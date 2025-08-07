/* eslint-disable max-len */
// functions/src/index.ts

// --- Firebase Admin SDK Imports ---
import * as admin from "firebase-admin";
// UserRecord is specifically for the Auth V1 trigger (onUserCreate)
import { UserRecord } from "firebase-admin/auth";
// Explicitly import Firestore types to prevent 'Cannot find module' or implicit 'any'
import { FieldValue, Transaction, QueryDocumentSnapshot } from "firebase-admin/firestore";

// --- Firebase Functions V2 Imports for Callable, Storage, and Firestore Triggers ---
import { onCall, CallableRequest, HttpsError, CallableOptions } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";

// --- Firebase Functions V1 Import for Auth Trigger (Specific to onUserCreate) ---
import * as functionsV1 from "firebase-functions";

// --- Google Cloud SDKs for AI and Vision APIs ---
import { ImageAnnotatorClient, protos } from "@google-cloud/vision";
import { VertexAI, GenerativeModel, Content } from "@google-cloud/vertexai";

// --- Node.js Built-in Modules for File Operations ---
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// --- Shared Types from Monorepo (Crucial for Type Safety Across Workspaces) ---
import {
  MCQ, ChatMessage, UserUpload, QuizResult, Chapter, UploadStatus, AttemptedMCQs,
  ToggleBookmarkCallableData, DeleteContentItemCallableData, AssignmentSuggestion,
  AwaitingReviewData, Topic as PediaquizTopicType, Flashcard, Attempt
} from "@pediaquiz/types";

// =============================================================================
//
//   INITIALIZATION & CONFIGURATION
//
// =============================================================================

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

const LOCATION = "us-central1";
const PROJECT_ID = "pediaquizapp";
setGlobalOptions({ region: LOCATION });

let _vertexAI: VertexAI;
let _visionClient: ImageAnnotatorClient;
let _quickModel: GenerativeModel;
let _powerfulModel: GenerativeModel;

function ensureClientsInitialized() {
  if (!_vertexAI) {
    _vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
    _powerfulModel = _vertexAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    _quickModel = _vertexAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-001" });
    _visionClient = new ImageAnnotatorClient();
    logger.info("AI and Vision clients initialized.");
  }
}

const HEAVY_FUNCTION_OPTIONS: CallableOptions = { cpu: 1, timeoutSeconds: 540, memory: "1GiB", region: LOCATION };
const LIGHT_FUNCTION_OPTIONS: CallableOptions = { timeoutSeconds: 120, memory: "512MiB", region: LOCATION };

// =============================================================================
//
//   UTILITY FUNCTIONS
//
// =============================================================================

function extractJson(rawText: string): any {
    const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)```/;
    const match = rawText.match(jsonBlockRegex);
    if (match && match[1]) {
        try { return JSON.parse(match[1].trim()); }
        catch (e: unknown) {
            logger.error("Failed to parse extracted JSON from markdown block:", { jsonString: match[1].trim(), error: (e as Error).message });
            throw new HttpsError("internal", "Invalid JSON from AI model (within markdown block).");
        }
    }
    try { return JSON.parse(rawText.trim()); }
    catch (e: unknown) {
        logger.error("Failed to parse raw text as JSON (no markdown block found):", { rawText: rawText.trim(), error: (e as Error).message });
        throw new HttpsError("internal", "Invalid JSON from AI model (raw text, no markdown block).");
    }
}

const normalizeId = (name: string): string => {
  if (typeof name !== 'string') return 'unknown';
  return name.replace(/\s+/g, '_').toLowerCase();
};

// =============================================================================
//
//   AUTH & STORAGE TRIGGERS
//
// =============================================================================

export const onUserCreate = functionsV1.region(LOCATION).auth.user().onCreate(async (user: UserRecord) => {
  const userRef = db.collection("users").doc(user.uid);
  await userRef.set({
    uid: user.uid, email: user.email, displayName: user.displayName || "PediaQuiz User",
    createdAt: FieldValue.serverTimestamp(), lastLogin: FieldValue.serverTimestamp(),
    isAdmin: false, bookmarks: [],
  });
  logger.info(`User created: ${user.email} (UID: ${user.uid})`);
});

export const onFileUploaded = onObjectFinalized({
    cpu: 2, memory: "1GiB", timeoutSeconds: 300, bucket: "pediaquizapp.firebasestorage.app",
}, async (event) => {
    ensureClientsInitialized();
    const { bucket, name, contentType, metadata } = event.data!;
    if (!name || !name.startsWith("uploads/") || name.endsWith('/')) return;
    const pathParts = name.split("/");
    if (pathParts.length < 3) return;
    const userIdInPath = pathParts[1];
    const ownerIdInMetadata = (metadata?.customMetadata as any)?.owner as string | undefined;
    if (!ownerIdInMetadata || userIdInPath !== ownerIdInMetadata) {
        logger.error(`Upload rejected: Path UID (${userIdInPath}) does not match metadata UID (${ownerIdInMetadata || 'N/A'}).`);
        return;
    }
    const userId = ownerIdInMetadata;
    const fileName = path.basename(name);
    const userUploadRef = db.collection("userUploads").doc();
    const newUpload: Partial<UserUpload> = { id: userUploadRef.id, userId, fileName, createdAt: new Date() };
    try {
        await userUploadRef.set({ ...newUpload, status: "pending_ocr" });
        let extractedText = "";
        if (contentType === "application/pdf") {
            const gcsSourceUri = `gs://${bucket}/${name}`;
            const outputPrefix = `ocr_results/${userUploadRef.id}`;
            const gcsDestinationUri = `gs://${bucket}/${outputPrefix}/`;
            const request: protos.google.cloud.vision.v1.IAsyncAnnotateFileRequest = {
                inputConfig: { gcsSource: { uri: gcsSourceUri }, mimeType: 'application/pdf' },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                outputConfig: { gcsDestination: { uri: gcsDestinationUri }, batchSize: 100 },
            };
            const [operation] = await _visionClient.asyncBatchAnnotateFiles({ requests: [request] });
            await operation.promise();
            const [files] = await storage.bucket(bucket).getFiles({ prefix: outputPrefix });
            files.sort((a, b) => a.name.localeCompare(b.name));
            for (const file of files) {
                const [contents] = await file.download();
                const output = JSON.parse(contents.toString());
                (output.responses || []).forEach((pageResponse: protos.google.cloud.vision.v1.IAnnotateImageResponse) => {
                    if (pageResponse.fullTextAnnotation?.text) {
                        extractedText += pageResponse.fullTextAnnotation.text + "\n\n";
                    }
                });
            }
            await storage.bucket(bucket).deleteFiles({ prefix: outputPrefix });
        } else if (contentType === "text/plain") {
            const tempFilePath = path.join(os.tmpdir(), fileName);
            await storage.bucket(bucket).file(name).download({ destination: tempFilePath });
            extractedText = fs.readFileSync(tempFilePath, "utf8");
            fs.unlinkSync(tempFilePath);
        } else { throw new HttpsError("invalid-argument", `Unsupported file type: ${contentType}.`); }
        if (!extractedText.trim()) throw new Error("Extracted text is empty.");
        await userUploadRef.update({ extractedText: extractedText.trim(), status: "processed", updatedAt: FieldValue.serverTimestamp() });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`File processing failed for ${fileName}: ${errorMessage}`, error);
        await userUploadRef.update({ status: "error", error: `Processing failed: ${errorMessage}` }).catch(() => {});
    }
});

export const onContentReadyForReview = onDocumentUpdated({
    document: "userUploads/{uploadId}", region: LOCATION, memory: '1GiB', cpu: 1, timeoutSeconds: 300,
}, async (event) => {
    ensureClientsInitialized();
    const before = event.data?.before.data() as UserUpload | undefined;
    const after = event.data?.after.data() as UserUpload | undefined;
    if (!before || !after || after.status !== 'pending_final_review') return;
    const content = after.finalAwaitingReviewData;
    if (!content || (!content.mcqs?.length && !content.flashcards?.length)) return;
    const contentSample = JSON.stringify({
        mcqs: (content.mcqs || []).slice(0, 3).map((mcq: MCQ) => mcq.question),
        flashcards: (content.flashcards || []).slice(0, 3).map((fc: Flashcard) => fc.front),
    });
    const docRef = db.collection("userUploads").doc(event.params.uploadId);
    try {
        const prompt = `CRITICAL: You MUST respond with only a valid JSON object. Analyze the following content sample and suggest the single best Topic and Chapter. JSON structure: {"suggestedTopic": "string", "suggestedChapter": "string"}. Sample: """${contentSample}"""`;
        const resp = await _powerfulModel.generateContent(prompt);
        const rawResponse = resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsedResponse = extractJson(rawResponse);
        await docRef.update({
            suggestedTopic: parsedResponse.suggestedTopic,
            suggestedChapter: parsedResponse.suggestedChapter,
            updatedAt: FieldValue.serverTimestamp(),
        });
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        await docRef.update({ status: 'error', error: `AI suggestion failed: ${err.message}` }).catch(() => {});
    }
});

// =============================================================================
//
//   CORE USER FUNCTIONS
//
// =============================================================================

export const addquizresult = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<Omit<QuizResult, 'id' | 'userId' | 'date'>>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const userId = request.auth.uid;
    const quizData = request.data;
    const resultRef = db.collection('quizResults').doc();
    await resultRef.set({ ...quizData, id: resultRef.id, userId, date: FieldValue.serverTimestamp() });
    return { success: true, id: resultRef.id };
});

export const addattempt = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ mcqId: string; isCorrect: boolean }>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    const userId = request.auth.uid;
    const { mcqId, isCorrect } = request.data;
    if (!mcqId || isCorrect == null) throw new HttpsError("invalid-argument", "MCQ ID and correctness required.");
    const attemptRef = db.collection("users").doc(userId).collection("attemptedMCQs").doc(mcqId);
    
    await db.runTransaction(async (transaction) => {
        const attemptDoc = await transaction.get(attemptRef);
        const attemptData = (attemptDoc.data() || {}) as Partial<Attempt>;
        const now = new Date();
        let nextReviewDate = new Date();
        let easeFactor = attemptData.easeFactor || 2.5;
        let interval = attemptData.interval || 0;

        if (isCorrect) {
            if (interval === 0) interval = 1;
            else if (interval === 1) interval = 6;
            else interval = Math.ceil(interval * easeFactor);
            easeFactor = Math.max(1.3, easeFactor + 0.1);
        } else {
            interval = 1;
            easeFactor = Math.max(1.3, easeFactor - 0.2);
        }
        nextReviewDate.setDate(now.getDate() + interval);
        
        const updatePayload: Attempt = {
            attempts: (attemptData.attempts || 0) + 1,
            correct: (attemptData.correct || 0) + (isCorrect ? 1 : 0),
            incorrect: (attemptData.incorrect || 0) + (isCorrect ? 0 : 1),
            isCorrect,
            lastAttempted: now,
            easeFactor,
            interval,
            nextReviewDate,
        };
        transaction.set(attemptRef, updatePayload, { merge: true });
    });
    return { success: true };
});

export const togglebookmark = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<ToggleBookmarkCallableData>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    const userId = request.auth.uid;
    const { contentId, contentType } = request.data;
    if (!contentId || !contentType) throw new HttpsError("invalid-argument", "Content ID and type are required.");
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    const bookmarks = userDoc.data()?.bookmarks || [];
    if (bookmarks.includes(contentId)) {
        await userRef.update({ bookmarks: FieldValue.arrayRemove(contentId) });
        return { bookmarked: false, bookmarks: bookmarks.filter((b: string) => b !== contentId) };
    } else {
        await userRef.update({ bookmarks: FieldValue.arrayUnion(contentId) });
        return { bookmarked: true, bookmarks: [...bookmarks, contentId] };
    }
});

// =============================================================================
//
//   ADMIN CONTENT PIPELINE & MANAGEMENT FUNCTIONS
//
// =============================================================================

export const createUploadFromText = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ fileName: string, rawText: string, isMarrow: boolean }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { fileName, rawText, isMarrow } = request.data;
    const userId = request.auth.uid;
    const userUploadRef = db.collection("userUploads").doc();
    const finalFileName = isMarrow ? `MARROW_TEXT_${Date.now()}_${fileName}` : `TEXT_${Date.now()}_${fileName}`;
    
    const newUpload: Partial<UserUpload> = {
        id: userUploadRef.id, userId, fileName: finalFileName, createdAt: new Date(),
        extractedText: rawText, status: 'processed',
    };

    if (isMarrow) {
        newUpload.stagedContent = { orphanExplanations: [rawText], extractedMcqs: [], generatedMcqs: [] };
        newUpload.status = 'pending_generation_decision';
    }
    await userUploadRef.set(newUpload);
    return { success: true, uploadId: userUploadRef.id };
});

export const extractMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized();
    const { uploadId } = request.data;
    const uploadRef = db.collection("userUploads").doc(uploadId);
    const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists) throw new HttpsError("not-found", "Upload document not found.");
    const { extractedText } = uploadDoc.data() as UserUpload;
    if (!extractedText) throw new HttpsError("failed-precondition", "No extracted text found.");
    try {
        const prompt = `You are an expert medical data processor... TEXT TO ANALYZE: """${extractedText}"""`;
        const result = await _quickModel.generateContent(prompt);
        const parsedData = extractJson(result.response.candidates?.[0]?.content.parts?.[0]?.text || '{}');
        const keyTopicsPrompt = `Analyze the following medical text... Text: """${extractedText}"""`;
        const keyTopicsResult = await _powerfulModel.generateContent(keyTopicsPrompt);
        const suggestedKeyTopics = extractJson(keyTopicsResult.response.candidates?.[0]?.content.parts?.[0]?.text || '[]');
        await uploadRef.update({
            "stagedContent.extractedMcqs": parsedData.mcqs || [],
            "stagedContent.orphanExplanations": parsedData.orphanExplanations || [],
            suggestedKeyTopics, status: "pending_generation_decision", updatedAt: FieldValue.serverTimestamp(),
        });
        return { mcqCount: (parsedData.mcqs || []).length, explanationCount: (parsedData.orphanExplanations || []).length };
    } catch (e) { throw new HttpsError("internal", (e as Error).message); }
});

export const generateAndAnalyzeMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, count: number }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized();
    const { uploadId, count } = request.data;
    const uploadRef = db.collection("userUploads").doc(uploadId);
    const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists) throw new HttpsError("not-found", "Upload document not found.");
    
    const stagedContent = uploadDoc.data()?.stagedContent || {};
    const orphanExplanations = stagedContent.orphanExplanations || [];
    let generatedMcqs: Partial<MCQ>[] = [];
    let suggestedKeyTopics: string[] = stagedContent.suggestedKeyTopics || [];

    if (orphanExplanations.length > 0 && count > 0) {
        const generationPrompt = `You are a medical author... orphanExplanations: """${JSON.stringify(orphanExplanations)}"""`;
        try {
            const result = await _powerfulModel.generateContent(generationPrompt);
            const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
            if (!responseText) throw new HttpsError("internal", "AI failed to respond for MCQ generation.");
            generatedMcqs = (extractJson(responseText)).generatedMcqs || [];
        } catch (e: unknown) {
            throw new HttpsError("internal", `MCQ generation failed: ${(e as Error).message}`);
        }
    }

    const allContentForTopicAnalysis = [...(stagedContent.extractedMcqs || []), ...generatedMcqs];
    if (allContentForTopicAnalysis.length > 0) {
        const allQuestionsText = allContentForTopicAnalysis.map(mcq => mcq.question).join("\n");
        const keyTopicsPrompt = `Analyze the following medical questions and explanations... Text: """${allQuestionsText}"""`;
        try {
            const keyTopicsResult = await _powerfulModel.generateContent(keyTopicsPrompt);
            const keyTopicsText = keyTopicsResult.response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (keyTopicsText) {
                const newSuggestedKeyTopics = extractJson(keyTopicsText);
                if (Array.isArray(newSuggestedKeyTopics)) {
                    suggestedKeyTopics = Array.from(new Set([...suggestedKeyTopics, ...newSuggestedKeyTopics]));
                }
            }
        } catch (e: unknown) {
            logger.warn(`Failed to re-suggest key topics for upload ${uploadId}: ${(e as Error).message}`);
        }
    }
    await uploadRef.update({
        "stagedContent.generatedMcqs": generatedMcqs,
        suggestedKeyTopics,
        status: "pending_assignment",
        updatedAt: FieldValue.serverTimestamp(),
    });
    return { success: true, message: "Generation and topic analysis complete!" };
});

export const approveMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId, topicId, topicName, chapterId, chapterName, keyTopics } = request.data;
    const adminId = request.auth.uid;
    const uploadRef = db.collection("userUploads").doc(uploadId);
    const topicRef = db.collection('MarrowTopics').doc(topicId);
    return db.runTransaction(async (transaction) => {
        const uploadDoc = await transaction.get(uploadRef);
        const stagedContent = uploadDoc.data()?.stagedContent || {};
        const allMcqsToApprove = [...(stagedContent.extractedMcqs || []), ...(stagedContent.generatedMcqs || [])];
        if (allMcqsToApprove.length === 0) throw new HttpsError("failed-precondition", "No content to approve.");
        const topicDoc = await transaction.get(topicRef);
        let chapters = (topicDoc.data()?.chapters || []) as Chapter[];
        const chapterIndex = chapters.findIndex(c => c.id === chapterId);
        if (chapterIndex > -1) {
            chapters[chapterIndex].mcqCount = (chapters[chapterIndex].mcqCount || 0) + allMcqsToApprove.length;
            chapters[chapterIndex].originalTextRefIds = Array.from(new Set([...(chapters[chapterIndex].originalTextRefIds || []), uploadId]));
        } else {
            chapters.push({ id: chapterId, name: chapterName, mcqCount: allMcqsToApprove.length, flashcardCount: 0, topicId, source: 'Marrow', originalTextRefIds: [uploadId] });
        }
        transaction.set(topicRef, { name: topicName, chapters, totalMcqCount: FieldValue.increment(allMcqsToApprove.length) }, { merge: true });
        allMcqsToApprove.forEach((mcq: Partial<MCQ>) => {
            const mcqRef = db.collection('MarrowMCQ').doc();
            transaction.set(mcqRef, { ...mcq, topic: topicName, topicId, chapter: chapterName, chapterId, tags: keyTopics, status: 'approved', source: 'Marrow', creatorId: adminId, uploadId, createdAt: FieldValue.serverTimestamp() });
        });
        for (const tag of keyTopics) { transaction.set(db.collection('KeyClinicalTopics').doc(normalizeId(tag)), { name: tag }, { merge: true }); }
        transaction.update(uploadRef, { status: 'completed', updatedAt: FieldValue.serverTimestamp() });
    });
});

export const approveContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, assignments: AssignmentSuggestion[] }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId, assignments } = request.data;
    const batch = db.batch();
    for (const assignment of assignments) {
        const { topicName, chapterName, mcqs, flashcards } = assignment;
        const topicRef = db.collection("Topics").doc(normalizeId(topicName));
        batch.set(topicRef, {
            name: topicName,
            chapters: FieldValue.arrayUnion({
                id: normalizeId(chapterName),
                name: chapterName,
                mcqCount: (mcqs || []).length,
                flashcardCount: (flashcards || []).length,
                originalTextRefIds: [uploadId]
            })
        }, { merge: true });
        (mcqs || []).forEach((mcq: Partial<MCQ>) => batch.set(db.collection("MasterMCQ").doc(), { ...mcq, topic: topicName, chapter: chapterName, topicId: normalizeId(topicName), chapterId: normalizeId(chapterName), uploadId, status: 'approved', createdAt: FieldValue.serverTimestamp() }));
        (flashcards || []).forEach((fc: Partial<Flashcard>) => batch.set(db.collection("Flashcards").doc(), { ...fc, topic: topicName, chapter: chapterName, topicId: normalizeId(topicName), chapterId: normalizeId(chapterName), uploadId, status: 'approved', createdAt: FieldValue.serverTimestamp() }));
    }
    batch.update(db.collection("userUploads").doc(uploadId), { status: 'completed', updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return { success: true };
});

export const deletecontentitem = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<DeleteContentItemCallableData>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { id, type, collectionName } = request.data;
    const allowedCollections: DeleteContentItemCallableData['collectionName'][] = ["MasterMCQ", "MarrowMCQ", "Flashcards"];
    if (!allowedCollections.includes(collectionName)) throw new HttpsError("invalid-argument", "Invalid collection name provided.");
    await db.collection(collectionName).doc(id).delete();
    logger.info(`Deleted ${type.toUpperCase()} with ID ${id} from collection ${collectionName} by admin ${request.auth.uid}.`);
    return { success: true, message: `${type.toUpperCase()} deleted.` };
});

export const resetUpload = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
    const uploadRef = db.collection('userUploads').doc(uploadId);
    const uploadDocSnap = await uploadRef.get();
    if (!uploadDocSnap.exists) throw new HttpsError("not-found", `UserUpload document with ID ${uploadId} not found.`);
    const fileName = uploadDocSnap.data()?.fileName || '';
    const isMarrowUpload = fileName.startsWith("MARROW_");
    const deleteBatch = db.batch();
    const collectionToDeleteFrom = isMarrowUpload ? "MarrowMCQ" : "MasterMCQ";
    const mcqsToDelete = await db.collection(collectionToDeleteFrom).where("uploadId", "==", uploadId).get();
    mcqsToDelete.docs.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();
    await uploadRef.update({
        status: 'processed', updatedAt: FieldValue.serverTimestamp(),
        error: FieldValue.delete(), stagedContent: FieldValue.delete(), suggestedKeyTopics: FieldValue.delete(),
        title: FieldValue.delete(), sourceReference: FieldValue.delete(), suggestedTopic: FieldValue.delete(),
        suggestedChapter: FieldValue.delete(), estimatedMcqCount: FieldValue.delete(),
        estimatedFlashcardCount: FieldValue.delete(), totalMcqCount: FieldValue.delete(),
        totalFlashcardCount: FieldValue.delete(), batchSize: FieldValue.delete(), totalBatches: FieldValue.delete(),
        completedBatches: FieldValue.delete(), textChunks: FieldValue.delete(), generatedContent: FieldValue.delete(),
        finalAwaitingReviewData: FieldValue.delete(), approvedTopic: FieldValue.delete(),
        approvedChapter: FieldValue.delete(), assignmentSuggestions: FieldValue.delete(), existingQuestionSnippets: FieldValue.delete(),
    });
    return { success: true, message: `Content for ${fileName} reset successfully.` };
});

export const archiveUpload = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
    const uploadRef = db.collection('userUploads').doc(uploadId);
    await uploadRef.update({ status: 'archived', updatedAt: FieldValue.serverTimestamp() });
    return { success: true, message: `Upload ${uploadId} archived.` };
});

export const reassignContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
    const mcqQuery = db.collection("MasterMCQ").where("sourceUploadId", "==", uploadId);
    const flashcardQuery = db.collection("Flashcards").where("sourceUploadId", "==", uploadId);
    const [mcqSnapshot, flashcardSnapshot] = await Promise.all([mcqQuery.get(), flashcardQuery.get()]);
    const mcqs = mcqSnapshot.docs.map((doc: QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() } as MCQ));
    const flashcards = flashcardSnapshot.docs.map((doc: QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() } as Flashcard));
    if (mcqs.length === 0 && flashcards.length === 0) throw new HttpsError("not-found", "No content found to reassign.");
    const awaitingReviewData: AwaitingReviewData = { mcqs, flashcards };
    const uploadRef = db.collection("userUploads").doc(uploadId);
    await uploadRef.update({ status: 'pending_final_review', finalAwaitingReviewData: awaitingReviewData, updatedAt: FieldValue.serverTimestamp() });
    const deleteBatch = db.batch();
    mcqSnapshot.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    flashcardSnapshot.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();
    return { success: true, message: "Content is ready for reassignment." };
});

export const prepareForRegeneration = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
    const mcqQuery = db.collection("MasterMCQ").where("sourceUploadId", "==", uploadId);
    const mcqSnapshot = await mcqQuery.get();
    const existingQuestions = mcqSnapshot.docs.map((doc: QueryDocumentSnapshot) => doc.data().question as string);
    const uploadRef = db.collection("userUploads").doc(uploadId);
    await uploadRef.update({
        status: 'batch_ready', completedBatches: 0, generatedContent: [], finalAwaitingReviewData: FieldValue.delete(),
        assignmentSuggestions: FieldValue.delete(), existingQuestionSnippets: existingQuestions, updatedAt: FieldValue.serverTimestamp(),
    });
    return { success: true, message: "Ready for regeneration." };
});

export const processManualTextInput = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ fileName: string, rawText: string, isMarrow: boolean }>) => {
  if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
  const { fileName, rawText, isMarrow } = request.data;
  const userId = request.auth.uid;
  const userUploadRef = db.collection("userUploads").doc();
  const finalFileName = isMarrow ? `MARROW_TEXT_${Date.now()}_${fileName}` : `TEXT_${Date.now()}_${fileName}`;
  const newUpload: Partial<UserUpload> = {
      id: userUploadRef.id, userId, fileName: finalFileName, createdAt: new Date(),
      extractedText: rawText, status: 'processed',
  };
  await userUploadRef.set(newUpload);
  return { success: true, uploadId: userUploadRef.id };
});

export const suggestClassification = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized();
    const { uploadId } = request.data;
    const docRef = db.collection("userUploads").doc(uploadId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new HttpsError("not-found", "Upload document not found.");
    const extractedText = docSnap.data()?.extractedText || "";
    if (!extractedText) throw new HttpsError("failed-precondition", "No extracted text to classify.");
    await docRef.update({ status: "pending_classification" });
    let attempts = 0;
    while (attempts < 3) {
        try {
            const prompt = `CRITICAL: You MUST respond with only a valid JSON object...`;
            const resp = await _powerfulModel.generateContent(prompt);
            const parsedResponse = extractJson(resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
            await docRef.update({
                title: parsedResponse.suggestedChapter || "Untitled", ...parsedResponse,
                status: "pending_approval", updatedAt: FieldValue.serverTimestamp(),
            });
            return { success: true, ...parsedResponse };
        } catch (e: unknown) {
            const err = e as Error;
            attempts++;
            if (attempts >= 3) {
                await docRef.update({ status: 'error', error: `AI classification failed: ${err.message}` }).catch(() => {});
                throw new HttpsError("internal", `AI classification failed: ${err.message}`);
            }
        }
    }
    throw new HttpsError("internal", "Function failed after multiple retries.");
});

export const prepareBatchGeneration = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, totalMcqCount: number, totalFlashcardCount: number, batchSize: number, approvedTopic: string, approvedChapter: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId, totalMcqCount, totalFlashcardCount, batchSize, approvedTopic, approvedChapter } = request.data;
    const docRef = db.collection("userUploads").doc(uploadId);
    const docSnap = await docRef.get();
    const extractedText = docSnap.data()?.extractedText || "";
    const textChunks = extractedText.split(/\n\s*\n/).filter((chunk: string) => chunk.trim().length > 100);
    if (textChunks.length === 0) throw new HttpsError("failed-precondition", "No valid text chunks found.");
    await docRef.update({
        approvedTopic, approvedChapter, totalMcqCount, totalFlashcardCount, batchSize,
        totalBatches: textChunks.length, completedBatches: 0, textChunks, generatedContent: [], status: "batch_ready", updatedAt: FieldValue.serverTimestamp(),
    });
    return { success: true, totalBatches: textChunks.length };
});

export const startAutomatedBatchGeneration = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized();
    const { uploadId } = request.data;
    const docRef = db.collection("userUploads").doc(uploadId);
    const docSnap = await docRef.get();
    const { textChunks, totalMcqCount, totalFlashcardCount, totalBatches, completedBatches, generatedContent, existingQuestionSnippets } = docSnap.data() as UserUpload;
    if (!textChunks?.length || !totalBatches) throw new HttpsError("invalid-argument", "Not prepared for batch generation.");
    await docRef.update({ status: "generating_batch" });
    let currentCompletedBatches = completedBatches || 0;
    let currentGeneratedContent = generatedContent || [];
    for (let i = currentCompletedBatches; i < totalBatches; i++) {
        const batchNumber = i + 1;
        const textChunk = textChunks[i];
        const mcqsPerBatch = Math.ceil((totalMcqCount || 0) / totalBatches);
        const flashcardsPerBatch = Math.ceil((totalFlashcardCount || 0) / totalBatches);
        const negativeConstraint = (existingQuestionSnippets?.length) ? `CRITICAL CONSTRAINT: Do not create questions similar to: ${JSON.stringify(existingQuestionSnippets)}` : "";
        try {
            const prompt = `You are a medical education expert... Text: """${textChunk}"""... Generate ${mcqsPerBatch} MCQs and ${flashcardsPerBatch} flashcards. ${negativeConstraint} JSON: {"mcqs": [...], "flashcards": [...]}`;
            const resp = await _powerfulModel.generateContent(prompt);
            const batchResult = extractJson(resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
            currentGeneratedContent.push({ batchNumber, ...batchResult });
            currentCompletedBatches++;
            const isComplete = currentCompletedBatches === totalBatches;
            await docRef.update({
                generatedContent: currentGeneratedContent, completedBatches: currentCompletedBatches,
                status: isComplete ? "pending_final_review" : "generating_batch", updatedAt: FieldValue.serverTimestamp(),
            });
            if (isComplete) {
                const finalAwaitingReviewData: AwaitingReviewData = {
                    mcqs: currentGeneratedContent.flatMap((b: any) => (b.mcqs || []) as MCQ[]),
                    flashcards: currentGeneratedContent.flatMap((b: any) => (b.flashcards || []) as Flashcard[]),
                };
                await docRef.update({ finalAwaitingReviewData, status: "pending_final_review" });
            }
        } catch (e: unknown) {
            const err = e as Error;
            await docRef.update({ status: "error", error: `Batch generation failure: ${err.message}` }).catch(() => {});
            throw new HttpsError("internal", `Batch generation failure: ${err.message}`);
        }
    }
    return { success: true, message: `Batch generation finished.` };
});

export const autoAssignContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, existingTopics: PediaquizTopicType[], scopeToTopicName?: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized();
    const { uploadId, existingTopics, scopeToTopicName } = request.data;
    const docRef = db.collection("userUploads").doc(uploadId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new HttpsError("not-found", "Upload not found.");
    const uploadData = docSnap.data() as UserUpload;
    if (uploadData.status !== 'pending_final_review') throw new HttpsError("failed-precondition", "Content not in 'pending_final_review' state.");
    const allGeneratedContent = uploadData.finalAwaitingReviewData;
    if (!allGeneratedContent || (!allGeneratedContent.mcqs?.length && !allGeneratedContent.flashcards?.length)) throw new HttpsError("failed-precondition", "No content to assign.");
    let contextText: string; let taskText: string;
    let topicsAndChaptersContext = existingTopics.map((t: PediaquizTopicType) => ({ topic: t.name, chapters: t.chapters.map((c: Chapter) => c.name) }));
    if (scopeToTopicName) {
        const scopedTopic = topicsAndChaptersContext.find(t => t.topic === scopeToTopicName);
        contextText = `... broad topic: "${scopeToTopicName}". Existing chapters: ${JSON.stringify(scopedTopic?.chapters || [])}`;
        taskText = `... group into new chapter names that fit within "${scopeToTopicName}"...`;
    } else {
        contextText = `... library structure: ${JSON.stringify(topicsAndChaptersContext, null, 2)}`;
        taskText = `... assign to the most appropriate existing chapter and topic...`;
    }
    const contentToCategorize = {
        mcqs: (allGeneratedContent.mcqs || []).map((m: MCQ, index: number) => ({ index, question: m.question })),
        flashcards: (allGeneratedContent.flashcards || []).map((f: Flashcard, index: number) => ({ index, front: f.front }))
    };
    const prompt = `... CONTEXT: ${contextText}. TASK: ${taskText}. CONTENT TO ASSIGN: ${JSON.stringify(contentToCategorize)}. RESPONSE FORMAT: [{"topicName": "...", "chapterName": "...", "isNewChapter": boolean, "mcqIndexes": [...], "flashcardIndexes": [...]}]`;
    try {
        const resp = await _powerfulModel.generateContent(prompt);
        const assignments = extractJson(resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]');
        const assignmentPayload: AssignmentSuggestion[] = assignments.map((a: any) => ({
            topicName: a.topicName, chapterName: a.chapterName, isNewChapter: a.isNewChapter,
            mcqs: (a.mcqIndexes || []).map((i: number) => allGeneratedContent.mcqs[i]),
            flashcards: (a.flashcardIndexes || []).map((i: number) => allGeneratedContent.flashcards[i]),
        }));
        await docRef.update({ status: 'pending_assignment_review', assignmentSuggestions: assignmentPayload, updatedAt: FieldValue.serverTimestamp() });
        return { success: true, suggestions: assignmentPayload };
    } catch (e: unknown) {
        const err = e as Error;
        await docRef.update({ status: 'error', error: `Auto-assignment failed: ${err.message}` }).catch(() => {});
        throw new HttpsError("internal", err.message);
    }
});

export const getDailyWarmupQuiz = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<never>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const userId = request.auth.uid;
    const attemptsSnapshot = await db.collection("users").doc(userId).collection("attemptedMCQs").get();
    const allAttemptedIds = new Set(attemptsSnapshot.docs.map(doc => doc.id));
    const now = new Date();
    const reviewIds = attemptsSnapshot.docs
        .filter(doc => (doc.data() as Attempt).nextReviewDate && (doc.data() as any).nextReviewDate.toDate() <= now)
        .map(doc => doc.id);
    const masterMcqSnapshot = await db.collection("MasterMCQ").select().get();
    const marrowMcqSnapshot = await db.collection("MarrowMCQ").select().get();
    const allLibraryIds = [...masterMcqSnapshot.docs.map(doc => doc.id), ...marrowMcqSnapshot.docs.map(doc => doc.id)];
    const newIds = allLibraryIds.filter(id => !allAttemptedIds.has(id));
    let warmupIds = [
        ...reviewIds.sort(() => 0.5 - Math.random()).slice(0, 10),
        ...newIds.sort(() => 0.5 - Math.random()).slice(0, 5)
    ];
    if (warmupIds.length < 15) {
        const needed = 15 - warmupIds.length;
        const filler = allLibraryIds.filter(id => !warmupIds.includes(id)).sort(() => 0.5 - Math.random()).slice(0, needed);
        warmupIds.push(...filler);
    }
    return { mcqIds: warmupIds.sort(() => 0.5 - Math.random()) };
});

export const getQuizSessionFeedback = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ quizResultId: string }>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const { quizResultId } = request.data;
    const resultDoc = await db.collection('quizResults').doc(quizResultId).get();
    if (!resultDoc.exists) throw new HttpsError("not-found", "Quiz result not found.");
    const resultData = resultDoc.data() as QuizResult;
    const incorrectResults = resultData.results.filter(r => !r.isCorrect && r.selectedAnswer !== null);
    if (incorrectResults.length === 0) return { feedback: "Excellent work! You got a perfect score. Keep up the great momentum." };
    const incorrectMcqIds = incorrectResults.map(r => r.mcqId);
    const topicPromises: Promise<QueryDocumentSnapshot[]>[] = [];
    for (let i = 0; i < incorrectMcqIds.length; i += 10) {
        const chunk = incorrectMcqIds.slice(i, i + 10);
        topicPromises.push(db.collection('MasterMCQ').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get().then(snap => snap.docs));
        topicPromises.push(db.collection('MarrowMCQ').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get().then(snap => snap.docs));
    }
    const allIncorrectMcqDocs = (await Promise.all(topicPromises)).flat();
    const incorrectTopics = allIncorrectMcqDocs.map(doc => doc.data().topic);
    const topicCounts = incorrectTopics.reduce((acc: Record<string, number>, topic: string) => ({ ...acc, [topic]: (acc[topic] || 0) + 1 }), {});
    const strugglingTopics = Object.entries(topicCounts).sort((a, b) => (b[1] as number) - (a[1] as number)).map(e => e[0]).slice(0, 2).join(', ');
    const prompt = `A user scored ${resultData.score}/${resultData.totalQuestions} on a quiz. They struggled most with topics: ${strugglingTopics}. Provide 2-3 sentences of encouraging feedback and a brief suggestion on what to review next. Be encouraging and concise.`;
    const result = await _powerfulModel.generateContent(prompt);
    return { feedback: result.response.candidates?.[0]?.content.parts?.[0]?.text || "Great effort! Keep reviewing the topics you found challenging." };
});

export const getExpandedSearchTerms = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ query: string }>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const { query } = request.data;
    const prompt = `A user is searching a medical quiz app for '${query}'. Provide a JSON array of 5-10 related clinical synonyms or more specific medical terms.`;
    const result = await _quickModel.generateContent(prompt);
    const terms = extractJson(result.response.candidates?.[0]?.content.parts?.[0]?.text || `["${query}"]`);
    if (!Array.isArray(terms)) return { terms: [query] };
    return { terms: Array.from(new Set([query, ...terms].map(t => String(t).trim()).filter(Boolean))) };
});

export const generateWeaknessBasedTest = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ allMcqs: Pick<MCQ, 'id'>[], testSize: number }>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const { allMcqs, testSize } = request.data;
    const prompt = `From the provided list of MCQs the user has previously answered incorrectly, select ${testSize} questions... DATA: """${JSON.stringify({ mcqsAvailable: allMcqs.map(m => m.id) })}"""`;
    const result = await _quickModel.generateContent(prompt);
    const mcqIds = extractJson(result.response.candidates?.[0]?.content.parts?.[0]?.text || '[]');
    return { mcqIds: Array.isArray(mcqIds) ? mcqIds : [] };
});

export const chatWithAssistant = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ prompt: string; history: ChatMessage[] }>): Promise<{ response: string; generatedQuiz?: MCQ[] }> => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const { prompt, history } = request.data;
    const chatHistoryForAI: Content[] = history.map((message: ChatMessage) => ({
        role: message.sender === 'user' ? 'user' : 'model',
        parts: [{ text: message.text }]
    }));
    const chat = _powerfulModel.startChat({ history: chatHistoryForAI });
    try {
        const result = await chat.sendMessage(prompt);
        return { response: result.response.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response." };
    } catch (error: unknown) {
        const err = error as Error;
        throw new HttpsError("internal", `AI chat failed: ${err.message}`);
    }
});

export const generatePerformanceAdvice = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ overallAccuracy: number, strongTopics: string[], weakTopics: string[] }>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const { overallAccuracy, strongTopics, weakTopics } = request.data;
    const prompt = `You are an AI academic advisor... Overall Accuracy: ${overallAccuracy.toFixed(1)}%... Strongest Topics: ${strongTopics.join(", ")}. Weakest Topics: ${weakTopics.join(", ")}...`;
    
    try {
        const result = await _powerfulModel.generateContent(prompt);
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) throw new HttpsError("internal", "AI model returned an empty response for performance advice.");
        return { advice: responseText };
    } catch (e: unknown) {
        const err = e as Error;
        throw new HttpsError("internal", `Performance advice generation failed: ${err.message}`);
    }
});