// --- CORRECTED FILE: workspaces/functions/src/index.ts ---

/* eslint-disable max-len */
import * as admin from "firebase-admin";
import { UserRecord } from "firebase-admin/auth";
import { FieldValue, Transaction, QueryDocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { onCall, CallableRequest, HttpsError, CallableOptions } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as functionsV1 from "firebase-functions";
import { ImageAnnotatorClient, protos } from "@google-cloud/vision";
import { VertexAI, GenerativeModel, Content } from "@google-cloud/vertexai";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import {
  MCQ, ChatMessage, UserUpload, QuizResult, Chapter,
  AttemptedMCQs, ToggleBookmarkCallableData, DeleteContentItemCallableData,
  AssignmentSuggestion, AwaitingReviewData, Topic as PediaquizTopicType,
  Flashcard, Attempt
} from "@pediaquiz/types";
import { validateInput } from "./utils/validation";
import * as schemas from "./utils/validation"; // Import all schemas

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

// Define CORS origins for callable functions.
const corsOrigins = ["https://pediaquiz.netlify.app", "http://localhost:5173", "http://127.0.0.1:5173"];

// Set global deployment options for all Functions V2.
setGlobalOptions({ 
    region: LOCATION,
    cors: corsOrigins 
});

let _vertexAI: VertexAI;
let _visionClient: ImageAnnotatorClient;
let _quickModel: GenerativeModel; 
let _powerfulModel: GenerativeModel; 

function ensureClientsInitialized() {
  if (!_vertexAI) {
    _vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
    // IMPORTANT: Retaining the exact model names as provided in the original prompt.
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
//   UTILITY FUNCTIONS (No changes needed, already correct from prompt)
//
// =============================================================================

function extractJson(rawText: string): any {
    const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)```/;
    const match = rawText.match(jsonBlockRegex);
    if (match && match[1]) {
        try { return JSON.parse(match[1].trim()); }
        catch (e: unknown) { logger.error("Failed to parse extracted JSON from markdown block:", { jsonString: match[1].trim(), error: (e as Error).message }); }
    }
    try { return JSON.parse(rawText.trim()); }
    catch (e: unknown) {
        logger.error("Failed to parse raw text as JSON:", { rawText: rawText.trim(), error: (e as Error).message });
        throw new HttpsError("internal", "Invalid JSON from AI model.");
    }
}

const normalizeId = (name: string): string => {
  if (typeof name !== 'string') { return String(name).replace(/\s+/g, '_').toLowerCase(); }
  return name.replace(/\s+/g, '_').toLowerCase();
};

// =============================================================================
//
//   AUTH & STORAGE TRIGGERS (Existing functions, no changes to logic)
//
// =============================================================================

export const onUserCreate = functionsV1.region(LOCATION).auth.user().onCreate(async (user: UserRecord) => {
  const userRef = db.collection("users").doc(user.uid);
  await userRef.set({
    uid: user.uid, email: user.email, displayName: user.displayName || "PediaQuiz User",
    createdAt: FieldValue.serverTimestamp(), lastLogin: FieldValue.serverTimestamp(),
    isAdmin: false, bookmarks: [], currentStreak: 0, lastStudiedDate: null,
  });
  logger.info(`User created: ${user.email} (UID: ${user.uid})`);
});

export const onFileUploaded = onObjectFinalized({
    cpu: 2, memory: "1GiB", timeoutSeconds: 300, bucket: "pediaquizapp.firebasestorage.app",
}, async (event) => {
    ensureClientsInitialized();
    const { bucket, name, contentType, metadata } = event.data!;
    if (!name || !name.startsWith("uploads/") || name.endsWith('/')) { logger.log("Skipping: Not a valid file path or is a directory."); return; }
    const pathParts = name.split("/");
    if (pathParts.length < 3) { logger.log("Skipping: File path is too short."); return; }
    const userIdInPath = pathParts[1];
    const ownerIdInMetadata = (metadata?.customMetadata as any)?.owner as string | undefined;
    if (!ownerIdInMetadata || userIdInPath !== ownerIdInMetadata) { logger.error(`Upload rejected: Path UID (${userIdInPath}) does not match metadata UID (${ownerIdInMetadata || 'N/A'}).`); return; }
    const userId = ownerIdInMetadata;
    const fileName = path.basename(name);
    const userUploadRef = db.collection("userUploads").doc();
    await userUploadRef.set({ id: userUploadRef.id, userId, fileName, createdAt: new Date(), status: "pending_ocr" });
    let extractedText = "";
    try {
        if (contentType === "application/pdf") {
            const gcsSourceUri = `gs://${bucket}/${name}`;
            const outputPrefix = `ocr_results/${userUploadRef.id}`;
            const gcsDestinationUri = `gs://${bucket}/${outputPrefix}/`;
            const request: protos.google.cloud.vision.v1.IAsyncAnnotateFileRequest = { inputConfig: { gcsSource: { uri: gcsSourceUri }, mimeType: 'application/pdf' }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], outputConfig: { gcsDestination: { uri: gcsDestinationUri }, batchSize: 100 } };
            const [operation] = await _visionClient.asyncBatchAnnotateFiles({ requests: [request] });
            await operation.promise();
            const [files] = await storage.bucket(bucket).getFiles({ prefix: outputPrefix });
            files.sort((a, b) => a.name.localeCompare(b.name));
            for (const file of files) {
                const [contents] = await file.download();
                const output = JSON.parse(contents.toString());
                (output.responses || []).forEach((pageResponse: protos.google.cloud.vision.v1.IAnnotateImageResponse) => { if (pageResponse.fullTextAnnotation?.text) { extractedText += pageResponse.fullTextAnnotation.text + "\n\n"; } });
            }
            await storage.bucket(bucket).deleteFiles({ prefix: outputPrefix });
        } else if (contentType === "text/plain") {
            const tempFilePath = path.join(os.tmpdir(), fileName);
            await storage.bucket(bucket).file(name).download({ destination: tempFilePath });
            extractedText = fs.readFileSync(tempFilePath, "utf8");
            fs.unlinkSync(tempFilePath);
        } else { throw new HttpsError("invalid-argument", `Unsupported file type: ${contentType}. Only PDF and TXT are supported.`); }
        if (!extractedText.trim()) { throw new Error("OCR or text extraction yielded no readable content."); }
        await userUploadRef.update({ extractedText: extractedText.trim(), status: "processed", updatedAt: FieldValue.serverTimestamp() });
        logger.info(`File ${fileName} processed successfully. Status: processed.`);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`File processing failed for upload ${userUploadRef.id} (${fileName}): ${errorMessage}`, error);
        await userUploadRef.update({ status: "error", error: `Processing failed: ${errorMessage}` }).catch(updateErr => { logger.error(`Failed to update upload status to error after processing failure: ${updateErr.message}`); });
    }
});

export const onContentReadyForReview = onDocumentUpdated({
    document: "userUploads/{uploadId}", region: LOCATION, memory: '1GiB', cpu: 1, timeoutSeconds: 300,
}, async (event) => {
    ensureClientsInitialized();
    const after = event.data?.after.data() as UserUpload | undefined;
    if (!after || after.status !== 'pending_final_review') { logger.log(`Skipping onContentReadyForReview trigger for upload ${event.params.uploadId}. Status not 'pending_final_review'.`); return; }
    const content = after.finalAwaitingReviewData;
    if (!content || (!content.mcqs?.length && !content.flashcards?.length)) { logger.warn(`No generated content found for upload ${event.params.uploadId} to classify.`); return; }
    const contentSample = JSON.stringify({ mcqs: (content.mcqs || []).slice(0, 3).map((mcq: MCQ) => mcq.question), flashcards: (content.flashcards || []).slice(0, 3).map((fc: Flashcard) => fc.front), });
    const docRef = db.collection("userUploads").doc(event.params.uploadId);
    logger.info(`Attempting to suggest classification for upload ${event.params.uploadId}`);
    try {
        const generativeModel = _powerfulModel;
        const prompt = `CRITICAL: You MUST respond with only a valid JSON object. Do not add any conversational text. As a specialist in postgraduate pediatric medical curricula, analyze the following content sample and suggest the single best Topic and Chapter. JSON structure: {"suggestedTopic": "string", "suggestedChapter": "string"}. Sample: """${contentSample}"""`;
        const resp = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const parsedResponse = extractJson(resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
        const { suggestedTopic, suggestedChapter } = parsedResponse || {};
        await docRef.update({ suggestedTopic: suggestedTopic || null, suggestedChapter: suggestedChapter || null, updatedAt: FieldValue.serverTimestamp(), });
        logger.info(`Classification suggested for upload ${event.params.uploadId}: Topic: ${suggestedTopic}, Chapter: ${suggestedChapter}`);
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        logger.error(`AI suggestion failed for upload ${event.params.uploadId}: ${err.message}`, err);
        await docRef.update({ status: 'error', error: `AI suggestion failed: ${err.message}` }).catch(updateErr => { logger.error(`Failed to update upload status to error after AI suggestion failure: ${updateErr.message}`); });
    }
});

// =============================================================================
//
//   CORE USER FUNCTIONS (Callable) - Exports confirmed
//
// =============================================================================

export const addquizresult = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<Omit<QuizResult, 'id' | 'userId' | 'date'>>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    const userId = request.auth.uid;
    const quizData = validateInput(schemas.QuizResultSchema, request.data);
    const resultRef = db.collection('quizResults').doc();
    await resultRef.set({ ...quizData, id: resultRef.id, userId, date: FieldValue.serverTimestamp() });
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    if (userData) {
        const lastStudiedDate = (userData.lastStudiedDate as Timestamp)?.toDate();
        const today = new Date(); today.setHours(0, 0, 0, 0); const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        let newStreak = userData.currentStreak || 0;
        if (lastStudiedDate) {
            const lastStudyDay = lastStudiedDate; lastStudyDay.setHours(0, 0, 0, 0);
            if (lastStudyDay.getTime() === today.getTime()) { }
            else if (lastStudyDay.getTime() === yesterday.getTime()) { newStreak++; }
            else { newStreak = 1; }
        } else { newStreak = 1; }
        await userRef.update({ currentStreak: newStreak, lastStudiedDate: FieldValue.serverTimestamp(), });
        logger.info(`User ${userId} completed quiz. Streak: ${newStreak}`);
    }
    logger.info(`New quiz result added for user ${userId}. Quiz ID: ${resultRef.id}`);
    return { success: true, id: resultRef.id };
});

export const addattempt = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ mcqId: string; isCorrect: boolean }>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const userId = request.auth.uid;
    const { mcqId, isCorrect } = validateInput(schemas.AttemptSchema, request.data);
    const attemptRef = db.collection("users").doc(userId).collection("attemptedMCQs").doc(mcqId);
    await db.runTransaction(async (transaction: Transaction) => {
        const attemptDoc = await transaction.get(attemptRef);
        const attemptData = (attemptDoc.data() || {}) as Partial<Attempt>;
        const now = new Date();
        let nextReviewDateJS = new Date();
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
        nextReviewDateJS.setDate(now.getDate() + interval);
        const updatePayload: Attempt = {
            attempts: (attemptData.attempts || 0) + 1, correct: (attemptData.correct || 0) + (isCorrect ? 1 : 0),
            incorrect: (attemptData.incorrect || 0) + (isCorrect ? 0 : 1), isCorrect, lastAttempted: now,
            easeFactor, interval, nextReviewDate: Timestamp.fromDate(nextReviewDateJS),
        };
        transaction.set(attemptRef, updatePayload, { merge: true });
        const userRef = db.collection('users').doc(userId);
        const userDoc = await transaction.get(userRef);
        const userData = userDoc.data();
        if (userData) {
            const lastStudiedDate = (userData.lastStudiedDate as Timestamp)?.toDate();
            const today = new Date(); today.setHours(0, 0, 0, 0); const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
            let newStreak = userData.currentStreak || 0;
            if (lastStudiedDate) {
                const lastStudyDay = lastStudiedDate; lastStudyDay.setHours(0, 0, 0, 0);
                if (lastStudyDay.getTime() === today.getTime()) { }
                else if (lastStudyDay.getTime() === yesterday.getTime()) { newStreak++; }
                else { newStreak = 1; }
            } else { newStreak = 1; }
            transaction.update(userRef, { currentStreak: newStreak, lastStudiedDate: FieldValue.serverTimestamp(), });
            logger.debug(`User ${userId} attempted MCQ. Streak: ${newStreak}`);
        }
        logger.debug(`Attempt recorded for user ${userId}, MCQ ${mcqId}. Correct: ${isCorrect}. Next Review: ${nextReviewDateJS.toISOString().split('T')[0]}`);
    });
    return { success: true };
});

export const togglebookmark = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<ToggleBookmarkCallableData>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const userId = request.auth.uid;
    const { contentId, contentType } = validateInput(schemas.ToggleBookmarkSchema, request.data);
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    const bookmarks = userDoc.data()?.bookmarks || [];
    let bookmarked: boolean; let updatedBookmarks: string[];
    if (bookmarks.includes(contentId)) {
        updatedBookmarks = bookmarks.filter((b: string) => b !== contentId);
        await userRef.update({ bookmarks: FieldValue.arrayRemove(contentId) });
        bookmarked = false; logger.info(`Removed bookmark for ${contentType} ${contentId} for user ${userId}.`);
    } else {
        updatedBookmarks = [...bookmarks, contentId];
        await userRef.update({ bookmarks: FieldValue.arrayUnion(contentId) });
        bookmarked = true; logger.info(`Added bookmark for ${contentType} ${contentId} for user ${userId}.`);
    }
    return { bookmarked, bookmarks: updatedBookmarks };
});

export const addFlashcardAttempt = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ flashcardId: string, rating: 'again' | 'good' | 'easy' }>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    const userId = request.auth.uid;
    const { flashcardId, rating } = validateInput(schemas.FlashcardAttemptSchema, request.data);
    const attemptRef = db.collection("users").doc(userId).collection("attemptedFlashcards").doc(flashcardId);
    await attemptRef.set({ lastReviewed: FieldValue.serverTimestamp(), rating: rating, attempts: FieldValue.increment(1), userId: userId, }, { merge: true });
    logger.info(`Flashcard ${flashcardId} rated as '${rating}' by user ${userId}.`);
    return { success: true };
});

// =============================================================================
//
//   ADMIN CONTENT PIPELINE & MANAGEMENT FUNCTIONS (Callable) - Exports confirmed
//
// =============================================================================

// FIX: Added validation using Zod schema
export const processManualTextInput = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ fileName: string, rawText: string, isMarrow: boolean }>) => {
  if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
  const { fileName, rawText, isMarrow } = validateInput(schemas.ProcessMarrowTextSchema, request.data); // FIX: Zod validation added
  const userId = request.auth.uid;
  const userUploadRef = db.collection("userUploads").doc();
  const finalFileName = isMarrow ? `MARROW_TEXT_${Date.now()}_${fileName}` : `TEXT_${Date.now()}_${fileName}`;
  const newUpload: Partial<UserUpload> = {
      id: userUploadRef.id, userId, fileName: finalFileName, createdAt: new Date(),
      extractedText: rawText, status: 'processed',
  };
  if (isMarrow) {
      newUpload.stagedContent = { orphanExplanations: [rawText], extractedMcqs: [], generatedMcqs: [] };
      newUpload.status = 'pending_marrow_generation_approval'; // Changed to new specific status for smart marrow text
      newUpload.suggestedNewMcqCount = Math.ceil(rawText.length / 500);
  }
  await userUploadRef.set(newUpload);
  logger.info(`New manual text upload created: ${userUploadRef.id} (File: ${finalFileName}).`);
  return { success: true, uploadId: userUploadRef.id, extractedMcqs: [], suggestedNewMcqCount: newUpload.suggestedNewMcqCount || 0 };
});

export const extractMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId } = request.data;
    const uploadRef = db.collection("userUploads").doc(uploadId); const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists) throw new HttpsError("not-found", "Upload document not found.");
    const { extractedText } = uploadDoc.data() as UserUpload;
    if (!extractedText) throw new HttpsError("failed-precondition", "No extracted text found for extraction.");
    try {
        const prompt = `You are an expert medical data processor. Analyze the provided OCR text and categorize its content into 'mcq' and 'orphan_explanation'. Respond with ONLY a valid JSON object with keys "mcqs" and "orphanExplanations". "mcqs" should be an array of objects: { "question": string, "options": string[], "answer": string, "explanation": string }. "orphanExplanations" should be an array of strings. If a category is empty, return an empty array. If there is no clear distinction, treat the entire text as a single orphan explanation. TEXT TO ANALYZE: """${extractedText}"""`;
        const result = await _quickModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const parsedData = extractJson(result.response.candidates?.[0]?.content.parts?.[0]?.text || '{}');
        const keyTopicsPrompt = `Analyze the following medical text and identify 5-10 key clinical topics (tags). Provide them as a JSON array of strings. Example: ["Topic 1", "Topic 2"]. Text: """${extractedText}"""`;
        const keyTopicsResult = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: keyTopicsPrompt }] }] });
        const suggestedKeyTopics = extractJson(keyTopicsResult.response.candidates?.[0]?.content.parts?.[0]?.text || '[]');
        await uploadRef.update({
            "stagedContent.extractedMcqs": parsedData.mcqs || [], "stagedContent.orphanExplanations": parsedData.orphanExplanations || [],
            suggestedKeyTopics, status: "pending_generation_decision", updatedAt: FieldValue.serverTimestamp(),
        }); logger.info(`Marrow content extracted for upload ${uploadId}. MCQs: ${(parsedData.mcqs || []).length}, Explanations: ${(parsedData.orphanExplanations || []).length}`);
        return { mcqCount: (parsedData.mcqs || []).length, explanationCount: (parsedData.orphanExplanations || []).length };
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e)); logger.error(`Marrow content extraction failed for upload ${uploadId}: ${err.message}`, err);
        throw new HttpsError("internal", `Marrow content extraction failed: ${err.message}`);
    }
});

export const generateAndAnalyzeMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, count: number }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId, count } = request.data;
    const uploadRef = db.collection("userUploads").doc(uploadId); const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists) throw new HttpsError("not-found", "Upload document not found.");
    const stagedContent = uploadDoc.data()?.stagedContent || {};
    const orphanExplanations = stagedContent.orphanExplanations || []; let generatedMcqs: Partial<MCQ>[] = [];
    let suggestedKeyTopics: string[] = stagedContent.suggestedKeyTopics || [];
    if (orphanExplanations.length > 0 && count > 0) {
        const generationPrompt = `You are a medical author. From the provided 'orphanExplanations', generate exactly ${count} new MCQs. Each MCQ should include: "question", 4 "options" (A, B, C, D), a single letter "answer" (A, B, C, or D), and an "explanation". Respond with ONLY a valid JSON object with key "generatedMcqs". orphanExplanations: """${JSON.stringify(orphanExplanations)}"""`;
        try {
            const result = await _quickModel.generateContent({ contents: [{ role: "user", parts: [{ text: generationPrompt }] }] });
            const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
            if (!responseText) throw new HttpsError("internal", "AI failed to respond for MCQ generation.");
            generatedMcqs = (extractJson(responseText)).generatedMcqs || [];
        } catch (e: unknown) { const err = e instanceof Error ? e : new Error(String(e)); logger.error(`MCQ generation failed for upload ${uploadId}: ${err.message}`, err); throw new HttpsError("internal", `MCQ generation failed: ${err.message}`); }
    }
    const allContentForTopicAnalysis = [...(stagedContent.extractedMcqs || []), ...generatedMcqs];
    if (allContentForTopicAnalysis.length > 0) {
        const allQuestionsText = allContentForTopicAnalysis.map(mcq => mcq.question).join("\n");
        const keyTopicsPrompt = `Analyze the following medical questions and explanations to identify 5-10 key clinical topics (tags). Provide them as a JSON array of strings. Example: ["Topic 1", "Topic 2"]. Text: """${allQuestionsText}"""`;
        try {
            const keyTopicsResult = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: keyTopicsPrompt }] }] });
            const keyTopicsText = keyTopicsResult.response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (keyTopicsText) { const newSuggestedKeyTopics = extractJson(keyTopicsText); if (Array.isArray(newSuggestedKeyTopics)) { suggestedKeyTopics = Array.from(new Set([...suggestedKeyTopics, ...newSuggestedKeyTopics])); } }
        } catch (e: unknown) { logger.warn(`Failed to re-suggest key topics for upload ${uploadId}: ${(e as Error).message}`); }
    }
    await uploadRef.update({ "stagedContent.generatedMcqs": generatedMcqs, suggestedKeyTopics, status: "pending_assignment", updatedAt: FieldValue.serverTimestamp(), });
    logger.info(`Marrow content generated and analyzed for upload ${uploadId}. New MCQs: ${generatedMcqs.length}`);
    return { success: true, message: "Generation and topic analysis complete!" };
});

export const approveMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId, topicId, topicName, chapterId, chapterName, keyTopics } = request.data;
    const adminId = request.auth.uid;
    const uploadRef = db.collection("userUploads").doc(uploadId); const topicRef = db.collection('MarrowTopics').doc(topicId);
    return db.runTransaction(async (transaction: Transaction) => {
        const uploadDoc = await transaction.get(uploadRef); const stagedContent = uploadDoc.data()?.stagedContent || {};
        const allMcqsToApprove = [...(stagedContent.extractedMcqs || []), ...(stagedContent.generatedMcqs || [])];
        if (allMcqsToApprove.length === 0) throw new HttpsError("failed-precondition", "No content to approve for Marrow.");
        const topicDoc = await transaction.get(topicRef); let chapters = (topicDoc.data()?.chapters || []) as Chapter[];
        const chapterIndex = chapters.findIndex(c => c.id === chapterId);
        if (chapterIndex > -1) {
            chapters[chapterIndex].mcqCount = (chapters[chapterIndex].mcqCount || 0) + allMcqsToApprove.length;
            chapters[chapterIndex].originalTextRefIds = Array.from(new Set([...(chapters[chapterIndex].originalTextRefIds || []), uploadId]));
        } else { chapters.push({ id: chapterId, name: chapterName, mcqCount: allMcqsToAppqs.length, flashcardCount: 0, topicId, source: 'Marrow', originalTextRefIds: [uploadId] }); }
        transaction.set(topicRef, { name: topicName, chapters, totalMcqCount: FieldValue.increment(allMcqsToApprove.length) }, { merge: true });
        allMcqsToApprove.forEach((mcq: Partial<MCQ>) => {
            const mcqRef = db.collection('MarrowMCQ').doc();
            transaction.set(mcqRef, {
                ...mcq, topic: topicName, topicId, chapter: chapterName, chapterId, tags: keyTopics, status: 'approved',
                source: 'Marrow', creatorId: adminId, uploadId, createdAt: FieldValue.serverTimestamp()
            });
        });
        for (const tag of keyTopics) { transaction.set(db.collection('KeyClinicalTopics').doc(normalizeId(tag)), { name: tag }, { merge: true }); }
        transaction.update(uploadRef, { status: 'completed', updatedAt: FieldValue.serverTimestamp() });
        logger.info(`Marrow content approved for upload ${uploadId}. ${allMcqsToApprove.length} MCQs saved to topic ${topicName}/${chapterName}.`);
        return { success: true, message: "Marrow content approved and saved!" };
    });
});

export const approveContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, assignments: AssignmentSuggestion[] }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId, assignments } = request.data;
    const batch = db.batch(); const adminId = request.auth.uid;
    for (const assignment of assignments) {
        const { topicName, chapterName, mcqs, flashcards } = assignment;
        const normalizedTopicId = normalizeId(topicName); const normalizedChapterId = normalizeId(chapterName);
        const topicRef = db.collection("Topics").doc(normalizedTopicId);
        batch.set(topicRef, {
            name: topicName,
            chapters: FieldValue.arrayUnion({ id: normalizedChapterId, name: chapterName, mcqCount: (mcqs || []).length, flashcardCount: (flashcards || []).length, originalTextRefIds: [uploadId] }),
            totalMcqCount: FieldValue.increment((mcqs || []).length),
            totalFlashcardCount: FieldValue.increment((flashcards || []).length),
            source: 'General'
        }, { merge: true });
        (mcqs || []).forEach((mcq: Partial<MCQ>) => {
            const mcqRef = db.collection("MasterMCQ").doc();
            batch.set(mcqRef, {
                ...mcq, topic: topicName, topicId: normalizedTopicId, chapter: chapterName, chapterId: normalizedChapterId,
                status: 'approved', source: 'PediaQuiz', creatorId: adminId, uploadId, createdAt: FieldValue.serverTimestamp()
            });
        });
        (flashcards || []).forEach((fc: Partial<Flashcard>) => {
            const fcRef = db.collection("Flashcards").doc();
            batch.set(fcRef, {
                ...fc, topic: topicName, topicId: normalizedTopicId, chapter: chapterName, chapterId: normalizedChapterId,
                status: 'approved', source: 'PediaQuiz_AI_Generated', creatorId: adminId, uploadId, createdAt: FieldValue.serverTimestamp()
            });
        });
    }
    batch.update(db.collection("userUploads").doc(uploadId), { status: 'completed', updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();
    logger.info(`General content approved for upload ${uploadId}. Assignments: ${assignments.length}.`);
    return { success: true, message: "Content approved successfully!" };
});

export const deletecontentitem = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<DeleteContentItemCallableData>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { id, type, collectionName } = validateInput(schemas.DeleteContentSchema, request.data);
    const itemRef = db.collection(collectionName).doc(id);
    await db.runTransaction(async (transaction: Transaction) => {
        const itemDoc = await transaction.get(itemRef);
        if (!itemDoc.exists) { throw new HttpsError("not-found", `${type} with ID ${id} not found in ${collectionName}.`); }
        const itemData = itemDoc.data();
        if (!itemData) { throw new HttpsError("internal", `Document data for ${id} is empty.`); }
        if ((type === 'mcq' || type === 'flashcard') && itemData.topicId) {
            const isMarrow = collectionName.includes('Marrow');
            const topicCollectionName = isMarrow ? 'MarrowTopics' : 'Topics';
            const topicRef = db.collection(topicCollectionName).doc(itemData.topicId);
            if (type === 'mcq') { transaction.update(topicRef, { totalMcqCount: FieldValue.increment(-1), }); }
            else if (type === 'flashcard') { transaction.update(topicRef, { totalFlashcardCount: FieldValue.increment(-1), }); }
        }
        transaction.delete(itemRef);
    });
    logger.info(`Deleted ${type.toUpperCase()} with ID ${id} from collection ${collectionName} by admin ${request.auth.uid}.`);
    return { success: true, message: `${type.toUpperCase()} deleted.` };
});

export const resetUpload = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
    const uploadRef = db.collection('userUploads').doc(uploadId); const uploadDocSnap = await uploadRef.get();
    if (!uploadDocSnap.exists) throw new HttpsError("not-found", `UserUpload document with ID ${uploadId} not found.`);
    const fileName = uploadDocSnap.data()?.fileName || ''; const isMarrowUpload = fileName.startsWith("MARROW_");
    const deleteBatch = db.batch();
    const mcqCollectionToDeleteFrom = isMarrowUpload ? "MarrowMCQ" : "MasterMCQ";
    const mcqsToDelete = await db.collection(mcqCollectionToDeleteFrom).where("uploadId", "==", uploadId).get();
    mcqsToDelete.docs.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    const flashcardsToDelete = await db.collection("Flashcards").where("uploadId", "==", uploadId).get();
    flashcardsToDelete.docs.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();
    logger.info(`Deleted ${mcqsToDelete.size} MCQs and ${flashcardsToDelete.size} Flashcards associated with upload ${uploadId}.`);
    await uploadRef.update({
        status: 'processed', updatedAt: FieldValue.serverTimestamp(), error: FieldValue.delete(),
        stagedContent: FieldValue.delete(), suggestedKeyTopics: FieldValue.delete(), title: FieldValue.delete(),
        sourceReference: FieldValue.delete(), suggestedTopic: FieldValue.delete(), suggestedChapter: FieldValue.delete(),
        estimatedMcqCount: FieldValue.delete(), estimatedFlashcardCount: FieldValue.delete(), totalMcqCount: FieldValue.delete(),
        totalFlashcardCount: FieldValue.delete(), batchSize: FieldValue.delete(), totalBatches: FieldValue.delete(),
        completedBatches: FieldValue.delete(), textChunks: FieldValue.delete(), generatedContent: FieldValue.delete(),
        finalAwaitingReviewData: FieldValue.delete(), approvedTopic: FieldValue.delete(), approvedChapter: FieldValue.delete(),
        assignmentSuggestions: FieldValue.delete(), existingQuestionSnippets: FieldValue.delete(),
    }); logger.info(`UserUpload document ${uploadId} reset to 'processed' status.`);
    return { success: true, message: `Content for ${fileName} reset successfully.` };
});

export const archiveUpload = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
    const uploadRef = db.collection('userUploads').doc(uploadId);
    await uploadRef.update({ status: 'archived', updatedAt: FieldValue.serverTimestamp() });
    logger.info(`Upload ${uploadId} archived.`);
    return { success: true, message: `Upload ${uploadId} archived.` };
});

export const reassignContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
    const mcqQuery = db.collection("MasterMCQ").where("uploadId", "==", uploadId);
    const flashcardQuery = db.collection("Flashcards").where("uploadId", "==", uploadId);
    const [mcqSnapshot, flashcardSnapshot] = await Promise.all([mcqQuery.get(), flashcardQuery.get()]);
    const mcqs = mcqSnapshot.docs.map((doc: QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() } as MCQ));
    const flashcards = flashcardSnapshot.docs.map((doc: QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() } as Flashcard));
    if (mcqs.length === 0 && flashcards.length === 0) throw new HttpsError("not-found", "No content found to reassign from this upload.");
    const awaitingReviewData: AwaitingReviewData = { mcqs, flashcards };
    const uploadRef = db.collection("userUploads").doc(uploadId);
    await uploadRef.update({ status: 'pending_final_review', finalAwaitingReviewData: awaitingReviewData, updatedAt: FieldValue.serverTimestamp() });
    const deleteBatch = db.batch();
    mcqSnapshot.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    flashcardSnapshot.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();
    logger.info(`Content from upload ${uploadId} prepared for reassignment.`);
    return { success: true, message: "Content is ready for reassignment." };
});

export const prepareForRegeneration = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
    const mcqQuery = db.collection("MasterMCQ").where("uploadId", "==", uploadId);
    const mcqSnapshot = await mcqQuery.get();
    const existingQuestions = mcqSnapshot.docs.map((doc: QueryDocumentSnapshot) => doc.data().question as string);
    const uploadRef = db.collection("userUploads").doc(uploadId);
    await uploadRef.update({
        status: 'batch_ready', completedBatches: 0, generatedContent: [],
        finalAwaitingReviewData: FieldValue.delete(), assignmentSuggestions: FieldValue.delete(),
        existingQuestionSnippets: existingQuestions, updatedAt: FieldValue.serverTimestamp(),
    }); logger.info(`Upload ${uploadId} prepared for regeneration.`);
    return { success: true, message: "Ready for regeneration." };
});

export const suggestClassification = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId } = request.data;
    const docRef = db.collection("userUploads").doc(uploadId); const docSnap = await docRef.get();
    if (!docSnap.exists) throw new HttpsError("not-found", "Upload document not found.");
    const extractedText = docSnap.data()?.extractedText || "";
    if (!extractedText) throw new HttpsError("failed-precondition", "No extracted text to classify.");
    await docRef.update({ status: "pending_classification" });
    logger.info(`Attempting AI classification for upload ${uploadId}.`);
    let attempts = 0;
    while (attempts < 3) {
        try {
            const prompt = `CRITICAL: You MUST respond with only a valid JSON object. Do not add any conversational text. As a specialist in postgraduate pediatric medical curricula (NEET SS, INI-CET), analyze the following text. Text excerpt to analyze: """${extractedText}""" Return a single JSON object with the following exact structure: {"suggestedTopic": "string", "suggestedChapter": "string", "estimatedMcqCount": number, "estimatedFlashcardCount": number, "sourceReference": "string"}`;
            const resp = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
            const parsedResponse = extractJson(resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
            const { suggestedTopic, suggestedChapter, estimatedMcqCount, estimatedFlashcardCount, sourceReference } = parsedResponse;
            await docRef.update({
                title: suggestedChapter || "Untitled", suggestedTopic: suggestedTopic || null, suggestedChapter: suggestedChapter || null,
                estimatedMcqCount: estimatedMcqCount || 0, estimatedFlashcardCount: estimatedFlashcardCount || 0,
                sourceReference: sourceReference || null, status: "pending_approval", updatedAt: FieldValue.serverTimestamp(),
            }); logger.info(`AI classification successful for upload ${uploadId}. Topic: ${suggestedTopic}, Chapter: ${suggestedChapter}`);
            return { success: true, suggestedTopic, suggestedChapter };
        } catch (e: unknown) {
            const err = e instanceof Error ? e : new Error(String(e)); logger.warn(`AI classification attempt ${attempts + 1} failed for upload ${uploadId}: ${err.message}`);
            attempts++;
            if (attempts >= 3) { await docRef.update({ status: 'error', error: `AI classification failed: ${err.message}` }).catch(() => {}); throw new HttpsError("internal", `AI classification failed: ${err.message}`); }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    } throw new HttpsError("internal", "Function failed after multiple retries.");
});

export const prepareBatchGeneration = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, totalMcqCount: number, totalFlashcardCount: number, batchSize: number, approvedTopic: string, approvedChapter: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId, totalMcqCount, totalFlashcardCount, batchSize, approvedTopic, approvedChapter } = request.data;
    const docRef = db.collection("userUploads").doc(uploadId); const docSnap = await docRef.get();
    const extractedText = docSnap.data()?.extractedText || "";
    const textChunks = extractedText.split(/\n\s*\n/).filter((chunk: string) => chunk.trim().length > 100);
    if (textChunks.length === 0) throw new HttpsError("failed-precondition", "No valid text chunks found for generation.");
    await docRef.update({
        approvedTopic, approvedChapter, totalMcqCount, totalFlashcardCount, batchSize,
        totalBatches: textChunks.length, completedBatches: 0, textChunks, generatedContent: [],
        status: "batch_ready", updatedAt: FieldValue.serverTimestamp(),
    }); logger.info(`Upload ${uploadId} prepared for ${textChunks.length} batches of generation.`);
    return { success: true, totalBatches: textChunks.length };
});

export const startAutomatedBatchGeneration = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId } = request.data;
    const docRef = db.collection("userUploads").doc(uploadId); const docSnap = await docRef.get();
    const { textChunks, totalMcqCount, totalFlashcardCount, totalBatches, completedBatches, generatedContent, existingQuestionSnippets } = docSnap.data() as UserUpload;
    if (!textChunks?.length || !totalBatches) throw new HttpsError("invalid-argument", "Upload not prepared for batch generation or missing data.");
    await docRef.update({ status: "generating_batch" }); logger.info(`Starting automated batch generation for upload ${uploadId}.`);
    let currentCompletedBatches = completedBatches || 0; let currentGeneratedContent = generatedContent || [];
    for (let i = currentCompletedBatches; i < totalBatches; i++) {
        const batchNumber = i + 1; const textChunk = textChunks[i];
        const mcqsPerBatch = Math.ceil((totalMcqCount || 0) / totalBatches);
        const flashcardsPerBatch = Math.ceil((totalFlashcardCount || 0) / totalBatches);
        const negativeConstraint = (existingQuestionSnippets?.length) ? `CRITICAL CONSTRAINT: Do not create questions similar to: ${JSON.stringify(existingQuestionSnippets)}` : "";
        try {
            const prompt = `You are a medical education expert specialized in Pediatrics. From the following text, generate exactly ${mcqsPerBatch} multiple-choice questions (MCQs) and ${flashcardsPerBatch} flashcards. Each MCQ must include: "question", 4 "options" (A, B, C, D), a single letter "answer" (A, B, C, or D), and an "explanation". Each flashcard must include: "front" (question/term) and "back" (answer/definition). ${negativeConstraint} Respond with ONLY a valid JSON object with keys "mcqs" and "flashcards". TEXT: """${textChunk}"""`;
            const resp = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
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
                    mcqs: currentGeneratedContent.flatMap((b: { mcqs?: Partial<MCQ>[] }) => (b.mcqs || [])).map(mcq => ({ ...mcq, id: mcq.id || db.collection('dummy').doc().id }) as MCQ),
                    flashcards: currentGeneratedContent.flatMap((b: { flashcards?: Partial<Flashcard>[] }) => (b.flashcards || [])).map(flashcard => ({ ...flashcard, id: flashcard.id || db.collection('dummy').doc().id }) as Flashcard),
                };
                await docRef.update({ finalAwaitingReviewData, status: "pending_final_review" });
                logger.info(`Automated batch generation for upload ${uploadId} finished. Total MCQs: ${finalAwaitingReviewData.mcqs.length}, Flashcards: ${finalAwaitingReviewData.flashcards.length}`);
            } else { logger.debug(`Batch ${batchNumber}/${totalBatches} generated for upload ${uploadId}.`); }
        } catch (e: unknown) {
            const err = e instanceof Error ? e : new Error(String(e)); logger.error(`Batch generation failure for upload ${uploadId} at batch ${batchNumber}: ${err.message}`, err);
            await docRef.update({ status: "error", error: `Batch generation failure: ${err.message}` }).catch(updateErr => { logger.error(`Failed to update upload status to error after batch failure: ${updateErr.message}`); });
            throw new HttpsError("internal", `Batch generation failure: ${err.message}`);
        }
    } return { success: true, message: `Batch generation finished.` };
});

// Explicitly add missing callable function export
export const generateAndStageMarrowMcqs = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, count: number }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized();
    const { uploadId, count } = request.data;
    const uploadRef = db.collection("userUploads").doc(uploadId);
    const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists) throw new HttpsError("not-found", "Upload document not found.");

    const stagedContent = uploadDoc.data()?.stagedContent || {};
    const orphanExplanations = stagedContent.orphanExplanations || [];
    let generatedMcqs: Partial<MCQ>[] = stagedContent.generatedMcqs || []; // Preserve existing generated MCQs
    let generatedFlashcards: Partial<Flashcard>[] = stagedContent.generatedFlashcards || []; // Preserve existing generated Flashcards

    // Generate new MCQs from orphan explanations if requested
    if (orphanExplanations.length > 0 && count > 0) {
        const generationPrompt = `You are a medical author specialized in Pediatrics for exams. From the provided 'orphanExplanations', generate exactly ${count} new MCQs. Each MCQ should include: "question", 4 "options" (A, B, C, D), a single letter "answer" (A, B, C, or D), and an "explanation". Respond with ONLY a valid JSON object with key "generatedMcqs". orphanExplanations: """${JSON.stringify(orphanExplanations)}"""`;
        try {
            const result = await _quickModel.generateContent({ contents: [{ role: "user", parts: [{ text: generationPrompt }] }] });
            const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
            if (!responseText) throw new HttpsError("internal", "AI failed to respond for new MCQ generation.");
            generatedMcqs = [...generatedMcqs, ...(extractJson(responseText).generatedMcqs || [])]; // Append
        } catch (e: unknown) {
            const err = e instanceof Error ? e : new Error(String(e));
            logger.error(`New MCQ generation for Smart Marrow failed for upload ${uploadId}: ${err.message}`, err);
            throw new HttpsError("internal", `New MCQ generation failed: ${err.message}`);
        }
    }
    
    // Consolidate all content into finalAwaitingReviewData for assignment stage
    const finalAwaitingReviewData: AwaitingReviewData = {
        mcqs: [...(stagedContent.extractedMcqs || []), ...generatedMcqs].map(mcq => ({ ...mcq, id: mcq.id || db.collection('dummy').doc().id }) as MCQ),
        flashcards: generatedFlashcards.map(flashcard => ({ ...flashcard, id: flashcard.id || db.collection('dummy').doc().id }) as Flashcard),
    };

    await uploadRef.update({
        "stagedContent.generatedMcqs": generatedMcqs,
        "stagedContent.generatedFlashcards": generatedFlashcards, // Update this field
        finalAwaitingReviewData, // Store the consolidated data for review/assignment
        status: "pending_assignment", // Move to the assignment stage
        updatedAt: FieldValue.serverTimestamp(),
    });
    logger.info(`Smart Marrow MCQs generated and staged for upload ${uploadId}. Total MCQs ready: ${finalAwaitingReviewData.mcqs.length}`);
    return { success: true };
});

// Explicitly add missing callable function export
export const generateGeneralContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, count: number }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized();
    const { uploadId, count } = request.data;
    const uploadRef = db.collection("userUploads").doc(uploadId);
    const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists) throw new HttpsError("not-found", "Upload document not found.");
    
    const { extractedText } = uploadDoc.data() as UserUpload;
    if (!extractedText) throw new HttpsError("failed-precondition", "No extracted text found for generation.");

    if (count <= 0) {
        throw new HttpsError("invalid-argument", "Count must be a positive number for general content generation.");
    }

    try {
        const generationPrompt = `You are an expert medical question author. From the following text, generate exactly ${count} new multiple-choice questions (MCQs). Each MCQ should include: "question", 4 "options" (A, B, C, D), a single letter "answer" (A, B, C, or D), and an "explanation". Respond with ONLY a valid JSON object with key "generatedMcqs". Text: """${extractedText}"""`;
        const result = await _quickModel.generateContent({ contents: [{ role: "user", parts: [{ text: generationPrompt }] }] });
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) throw new HttpsError("internal", "AI failed to respond for general MCQ generation.");
        const generatedMcqs = (extractJson(responseText).generatedMcqs || []) as Partial<MCQ>[];

        // For simplicity in this general pipeline, we directly set to pending_assignment here.
        // A more complex flow might involve more staging.
        await uploadRef.update({
            "stagedContent.generatedMcqs": generatedMcqs,
            status: "pending_assignment", // Move to assignment stage directly after general generation
            updatedAt: FieldValue.serverTimestamp(),
        });

        logger.info(`General content generated for upload ${uploadId}. New MCQs: ${generatedMcqs.length}`);
        return { success: true };
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        logger.error(`General content generation failed for upload ${uploadId}: ${err.message}`, err);
        throw new HttpsError("internal", `General content generation failed: ${err.message}`);
    }
});


export const autoAssignContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, existingTopics: PediaquizTopicType[], scopeToTopicName?: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId, existingTopics, scopeToTopicName } = request.data;
    const docRef = db.collection("userUploads").doc(uploadId); const docSnap = await docRef.get();
    if (!docSnap.exists) throw new HttpsError("not-found", "Upload document not found.");
    const uploadData = docSnap.data() as UserUpload;
    if (uploadData.status !== 'pending_final_review') throw new HttpsError("failed-precondition", "Content not in 'pending_final_review' state for auto-assignment.");
    const allGeneratedContent = uploadData.finalAwaitingReviewData;
    if (!allGeneratedContent || (!allGeneratedContent.mcqs?.length && !allGeneratedContent.flashcards?.length)) throw new HttpsError("failed-precondition", "No content to assign.");
    let contextText: string; let taskText: string;
    let topicsAndChaptersContext = existingTopics.map((t: PediaquizTopicType) => ({ topic: t.name, chapters: t.chapters.map((c: Chapter) => c.name) }));
    if (scopeToTopicName) {
        const scopedTopic = topicsAndChaptersContext.find((t: { topic: string; }) => t.topic === scopeToTopicName);
        contextText = `... broad topic: "${scopeToTopicName}". Existing chapters: ${JSON.stringify(scopedTopic?.chapters || [])}`;
        taskText = `... group into new chapter names that fit within "${scopeToTopicName}"...`;
    } else {
        contextText = `... library structure: ${JSON.stringify(topicsAndChaptersContext, null, 2)}`;
        taskText = `... assign to the most appropriate existing chapter and topic. If no good match exists, suggest a new one...`;
    }
    const contentToCategorize = {
        mcqs: (allGeneratedContent.mcqs || []).map((m: MCQ, index: number) => ({ index, question: m.question })),
        flashcards: (allGeneratedContent.flashcards || []).map((f: Flashcard, index: number) => ({ index, front: f.front }))
    };
    const prompt = `You are an AI-powered medical curriculum architect. Your task is to intelligently sort generated educational content into an existing library structure. CONTEXT: ${contextText}. TASK: ${taskText}. CONTENT TO ASSIGN: ${JSON.stringify(contentToCategorize)}. RESPONSE_FORMAT: [{"topicName": "...", "chapterName": "...", "isNewChapter": boolean, "mcqIndexes": [...], "flashcardIndexes": []}]`;
    try {
        const resp = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const assignments = extractJson(resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]');
        const assignmentPayload: AssignmentSuggestion[] = assignments.map((a: any) => ({
            topicName: a.topicName, chapterName: a.chapterName, isNewChapter: a.isNewChapter,
            mcqs: (a.mcqIndexes || []).map((i: number) => (allGeneratedContent.mcqs || [])[i]),
            flashcards: (a.flashcardIndexes || []).map((i: number) => (allGeneratedContent.flashcards || [])[i]),
        }));
        await docRef.update({ status: 'pending_assignment_review', assignmentSuggestions: assignmentPayload, updatedAt: FieldValue.serverTimestamp() });
        logger.info(`Auto-assignment successful for upload ${uploadId}. Suggested ${assignmentPayload.length} assignments.`);
        return { success: true, suggestions: assignmentPayload };
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e)); logger.error(`Auto-assignment failed for upload ${uploadId}: ${err.message}`, err);
        await docRef.update({ status: 'error', error: `Auto-assignment failed: ${err.message}` }).catch(() => {});
        throw new HttpsError("internal", err.message);
    }
});

// =============================================================================
//
//   AI-POWERED FEATURE FUNCTIONS (Callable) - Exports confirmed
//
// =============================================================================

export const getDailyWarmupQuiz = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<never>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized(); const userId = request.auth.uid;
    const attemptsSnapshot = await db.collection("users").doc(userId).collection("attemptedMCQs").get();
    const allAttemptedIds = new Set(attemptsSnapshot.docs.map(doc => doc.id));
    const now = admin.firestore.Timestamp.now();
    const reviewIds = attemptsSnapshot.docs.filter(doc => { const data = doc.data() as Attempt; return (data.nextReviewDate instanceof Timestamp) && (data.nextReviewDate as Timestamp) <= now; }).map(doc => doc.id);
    const masterMcqSnapshot = await db.collection("MasterMCQ").select(admin.firestore.FieldPath.documentId()).get();
    const marrowMcqSnapshot = await db.collection("MarrowMCQ").select(admin.firestore.FieldPath.documentId()).get();
    const allLibraryIds = [...masterMcqSnapshot.docs.map(doc => doc.id), ...marrowMcqSnapshot.docs.map(doc => doc.id)];
    const newIds = allLibraryIds.filter(id => !allAttemptedIds.has(id));
    let warmupIds = [...reviewIds.sort(() => 0.5 - Math.random()).slice(0, 10), ...newIds.sort(() => 0.5 - Math.random()).slice(0, 5)];
    if (warmupIds.length < 15) { const needed = 15 - warmupIds.length; const filler = allLibraryIds.filter(id => !warmupIds.includes(id)).sort(() => 0.5 - Math.random()).slice(0, needed); warmupIds.push(...filler); }
    logger.info(`Generated daily warmup quiz for user ${userId} with ${warmupIds.length} MCQs.`);
    return { mcqIds: warmupIds.sort(() => 0.5 - Math.random()) };
});

export const getQuizSessionFeedback = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ quizResultId: string }>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized(); const { quizResultId } = request.data;
    const resultDoc = await db.collection('quizResults').doc(quizResultId).get();
    if (!resultDoc.exists) throw new HttpsError("not-found", "Quiz result not found.");
    const resultData = resultDoc.data() as QuizResult;
    const incorrectResults = resultData.results.filter(r => !r.isCorrect && r.selectedAnswer !== null);
    if (incorrectResults.length === 0) { return { feedback: "Excellent work! You got a perfect score. Keep up the great momentum!" }; }
    const incorrectMcqIds = incorrectResults.map(r => r.mcqId);
    const queryPromises: Promise<QueryDocumentSnapshot<admin.firestore.DocumentData>[]>[] = []; const chunkSize = 10;
    for (let i = 0; i < incorrectMcqIds.length; i += chunkSize) {
        const chunk = incorrectMcqIds.slice(i, i + chunkSize);
        queryPromises.push(db.collection('MasterMCQ').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get().then(snap => snap.docs));
        queryPromises.push(db.collection('MarrowMCQ').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get().then(snap => snap.docs));
    }
    const allIncorrectMcqDocs = (await Promise.all(queryPromises)).flat();
    const incorrectTopics = allIncorrectMcqDocs.map(doc => doc.data().topic);
    const topicCounts = incorrectTopics.reduce((acc: Record<string, number>, topic: string) => ({ ...acc, [topic]: (acc[topic] || 0) + 1 }), {} as Record<string, number>);
    const strugglingTopics = Object.entries(topicCounts).sort((a, b) => (b[1] as number) - (a[1] as number)).map(e => e[0]).slice(0, 2).join(', ');
    const prompt = `A user scored ${resultData.score}/${resultData.totalQuestions} on a quiz. They struggled most with topics: ${strugglingTopics}. Provide 2-3 sentences of encouraging feedback and a brief suggestion on what to review next. Be encouraging and concise.`;
    const result = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
    return { feedback: result.response.candidates?.[0]?.content.parts?.[0]?.text || "Great effort! Keep reviewing the topics you found challenging." };
});

export const getExpandedSearchTerms = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ query: string }>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized(); const { query } = request.data;
    const prompt = `A user is searching a medical quiz app for '${query}'. Provide a JSON array of 5-10 related clinical synonyms or more specific medical terms.`;
    const result = await _quickModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
    const terms = extractJson(result.response.candidates?.[0]?.content.parts?.[0]?.text || `["${query}"]`);
    if (!Array.isArray(terms)) return { terms: [query] };
    return { terms: Array.from(new Set([query, ...terms].map((t: unknown) => String(t).trim()).filter(Boolean))) };
});

export const generateWeaknessBasedTest = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ allMcqs: Pick<MCQ, 'id'>[], testSize: number }>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized(); const { allMcqs, testSize } = request.data;
    const prompt = `From the provided list of MCQ IDs (which are questions the user has previously answered incorrectly), select exactly ${testSize} question IDs that provide a good variety of topics and difficulty. Prioritize questions the user got wrong more recently or more frequently. Return ONLY a valid JSON array of the selected MCQ IDs. If fewer than ${testSize} MCQs are available, return all available. DATA: """${JSON.stringify({ mcqIdsAvailable: allMcqs.map(m => m.id) })}"""`;
    try {
        const result = await _quickModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const mcqIds = extractJson(result.response.candidates?.[0]?.content.parts?.[0]?.text || '[]');
        if (!Array.isArray(mcqIds)) { logger.warn(`AI returned non-array for weakness test IDs. Falling back to empty array. Raw: ${result.response.candidates?.[0]?.content.parts?.[0]?.text}`); return { mcqIds: [] }; }
        logger.info(`Generated weakness test with ${mcqIds.length} MCQs.`);
        return { mcqIds };
    } catch (e: unknown) { const err = e instanceof Error ? e : new Error(String(e)); logger.error(`Failed to generate weakness test: ${err.message}`, err); throw new HttpsError("internal", `Failed to generate weakness test: ${err.message}`); }
});

export const chatWithAssistant = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ prompt: string; history: ChatMessage[] }>): Promise<{ response: string; generatedQuiz?: MCQ[] }> => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized(); const { prompt, history } = request.data;
    const systemInstruction = `You are PediaBot, a friendly and expert AI study assistant for a postgraduate medical student. Help them understand complex topics, clarify concepts, and answer questions. Format responses with markdown.`;
    const chatHistoryForAI: Content[] = history.map((message: ChatMessage) => ({ role: message.sender === 'user' ? 'user' : 'model', parts: [{ text: message.text }] }));
    const chat = _powerfulModel.startChat({ history: chatHistoryForAI, systemInstruction: { parts: [{ text: systemInstruction }] } });
    try {
        const result = await chat.sendMessage(prompt);
        return { response: result.response.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response." };
    } catch (error: unknown) { const err = error as Error; logger.error(`AI chat failed for user ${request.auth.uid}: ${err.message}`, err); throw new HttpsError("internal", `AI chat failed: ${err.message}`); }
});

export const generatePerformanceAdvice = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ overallAccuracy: number, strongTopics: string[], weakTopics: string[] }>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized(); const { overallAccuracy, strongTopics, weakTopics } = request.data;
    const prompt = `You are an AI academic advisor for a postgraduate medical student. Analyze the following performance data and provide actionable, professional advice: Overall Accuracy: ${overallAccuracy.toFixed(1)}%. Strongest Topics: ${strongTopics.join(", ")}. Weakest Topics: ${weakTopics.join(", ")}. Your advice should: 1. Congratulate them on strengths. 2. Identify weak areas gently. 3. Provide a brief, actionable study plan. Suggest specific strategies for tackling the weak topics (e.g., "Focus on flashcards for definitions in [Weak Topic 1]"). 4. End on a motivating note. Format your response using basic markdown.`;
    try {
        const result = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) throw new HttpsError("internal", "AI model returned an empty response for performance advice.");
        return { advice: responseText };
    } catch (e: unknown) { const err = e instanceof Error ? e : new Error(String(e)); logger.error(`Performance advice generation failed for user ${request.auth.uid}: ${err.message}`, err); throw new HttpsError("internal", `Performance advice generation failed: ${err.message}`); }
});

export const generateChapterSummary = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadIds: string[] }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadIds } = request.data;
    if (!uploadIds || uploadIds.length === 0) { throw new HttpsError("invalid-argument", "At least one upload ID is required to generate a summary."); }
    const combinedExtractedText: string[] = [];
    for (const uploadId of uploadIds) {
        const uploadDoc = await db.collection('userUploads').doc(uploadId).get();
        if (uploadDoc.exists && uploadDoc.data()?.extractedText) { combinedExtractedText.push(uploadDoc.data()!.extractedText); }
    }
    if (combinedExtractedText.length === 0) { throw new HttpsError("not-found", "No extracted text found for the provided upload IDs."); }
    const textToSummarize = combinedExtractedText.join('\n\n---\n\n');
    const prompt = `You are a medical expert specialized in Pediatrics. Generate a comprehensive, well-structured, and concise summary of the following pediatric medical text. Use markdown, including clear headings, bold text for key terms, and bullet points to organize the information. The summary should be highly relevant and suitable for a postgraduate student preparing for exams. Text to summarize: """${textToSummarize}"""`;
    try {
        const result = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const summary = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!summary) throw new HttpsError("internal", "AI failed to generate summary.");
        logger.info(`AI summary generated for upload IDs: ${uploadIds.join(',')}. Length: ${summary.length}`);
        return { summary: summary };
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e)); logger.error(`Failed to generate chapter summary for upload IDs ${uploadIds.join(',')}: ${err.message}`, err);
        throw new HttpsError("internal", `Summary generation failed: ${err.message}`);
    }
});

export const updateChapterNotes = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ topicId: string, chapterId: string, newSummary: string, source: 'General' | 'Marrow' }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { topicId, chapterId, newSummary, source } = request.data;
    if (!topicId || !chapterId || newSummary === undefined || !source) { throw new HttpsError("invalid-argument", "Missing required parameters: topicId, chapterId, newSummary, source."); }
    const topicCollection = source === 'Marrow' ? 'MarrowTopics' : 'Topics';
    const topicRef = db.collection(topicCollection).doc(topicId);
    try {
        await db.runTransaction(async (transaction) => {
            const topicDoc = await transaction.get(topicRef);
            if (!topicDoc.exists) { throw new HttpsError("not-found", `Topic ${topicId} not found.`); }
            let chapters = (topicDoc.data()?.chapters || []) as Chapter[];
            const chapterIndex = chapters.findIndex(c => c.id === chapterId);
            if (chapterIndex === -1) { throw new HttpsError("not-found", `Chapter ${chapterId} not found in topic ${topicId}.`); }
            chapters[chapterIndex].summaryNotes = newSummary;
            transaction.update(topicRef, { chapters: chapters });
        });
        logger.info(`Chapter notes updated for ${topicId}/${chapterId} (Source: ${source}).`);
        return { success: true, message: "Chapter notes saved successfully!" };
    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error)); logger.error(`Failed to update chapter notes for ${topicId}/${chapterId}: ${err.message}`, err);
        throw new HttpsError("internal", `Failed to save notes: ${err.message}`);
    }
});


// =============================================================================
//
//   NEW SCHEDULED FUNCTION (Confirmed existing and correct)
//
// =============================================================================

export const cleanupExpiredSessions = onSchedule({
    schedule: "every 6 hours", region: LOCATION, memory: "256MiB",
}, async () => {
    const now = Timestamp.now();
    const expiredSessionsQuery = db.collection('quizSessions').where('expiresAt', '<=', now);
    const snapshot = await expiredSessionsQuery.get();
    if (snapshot.empty) { logger.info("No expired sessions to clean up."); return; }
    const batch = db.batch();
    snapshot.docs.forEach(doc => { batch.delete(doc.ref); });
    await batch.commit();
    logger.info(`Cleaned up ${snapshot.size} expired quiz sessions.`);
});