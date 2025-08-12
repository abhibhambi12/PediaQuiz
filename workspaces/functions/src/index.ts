//* eslint-disable max-len *//
import * as admin from "firebase-admin";
import { UserRecord } from "firebase-admin/auth";
import { FieldValue, Transaction, QueryDocumentSnapshot, Timestamp, DocumentData } from "firebase-admin/firestore";
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
import * as schemas from "./utils/validation";

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

// Set global deployment options for all Functions V2.
setGlobalOptions({ region: LOCATION });

// AI and Vision client instances (initialized lazily on first use)
let _vertexAI: VertexAI;
let _visionClient: ImageAnnotatorClient;
let _quickModel: GenerativeModel;
let _powerfulModel: GenerativeModel;

function ensureClientsInitialized() {
  if (!_vertexAI) {
    _vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
    // KEPT ORIGINAL MODEL VERSIONS AS REQUESTED
    _powerfulModel = _vertexAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    _quickModel = _vertexAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-001" });
    _visionClient = new ImageAnnotatorClient();
    logger.info("AI and Vision clients initialized.");
  }
}

// Common Callable Function Options.
const HEAVY_FUNCTION_OPTIONS: CallableOptions = { cpu: 1, timeoutSeconds: 540, memory: "1GiB", region: LOCATION };
const LIGHT_FUNCTION_OPTIONS: CallableOptions = { timeoutSeconds: 120, memory: "512MiB", region: LOCATION };

// =============================================================================
//
//   UTILITY FUNCTIONS
//
// =============================================================================

// Robust JSON extraction from AI responses (handles markdown code blocks and whitespace)
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

// Normalizes a string to be used as a Firestore document ID (lowercase, replace spaces with underscores)
const normalizeId = (name: string): string => {
  if (typeof name !== "string") { return String(name).replace(/\s+/g, "_").toLowerCase(); }
  return name.replace(/\s+/g, "_").toLowerCase();
};

// =============================================================================
//
//   AUTH & STORAGE TRIGGERS (Existing functions, no changes to logic)
//
// =============================================================================

// Triggered when a new user signs up. Creates a corresponding user profile in Firestore.
export const onUserCreate = functionsV1.region(LOCATION).auth.user().onCreate(async (user: UserRecord) => {
  const userRef = db.collection("users").doc(user.uid);
  await userRef.set({
    uid: user.uid, email: user.email, displayName: user.displayName || "PediaQuiz User",
    createdAt: FieldValue.serverTimestamp(), lastLogin: FieldValue.serverTimestamp(),
    isAdmin: false, bookmarks: [], currentStreak: 0, lastStudiedDate: null,
  });
  logger.info(`User created: ${user.email} (UID: ${user.uid})`);
});

// Triggered when a file is uploaded to the specified Cloud Storage bucket.
// Handles OCR for PDFs and direct text extraction for TXT files.
export const onFileUploaded = onObjectFinalized({
    cpu: 2, memory: "1GiB", timeoutSeconds: 300, bucket: "pediaquizapp.appspot.com",
}, async (event) => {
    ensureClientsInitialized();
    const { bucket, name, contentType, metadata } = event.data;
    if (!name || !name.startsWith("uploads/") || name.endsWith("/")) { logger.log("Skipping: Not a valid file path or is a directory."); return; }
    const pathParts = name.split("/");
    if (pathParts.length < 3) { logger.log("Skipping: File path is too short."); return; }
    const userIdInPath = pathParts[1];
    const ownerIdInMetadata = (metadata?.customMetadata as any)?.owner as string | undefined;
    if (!ownerIdInMetadata || userIdInPath !== ownerIdInMetadata) { logger.error(`Upload rejected: Path UID (${userIdInPath}) does not match metadata UID (${ownerIdInMetadata || "N/A"}).`); return; }
    const userId = ownerIdInMetadata;
    const fileName = path.basename(name);
    const userUploadRef = db.collection("userUploads").doc();
    await userUploadRef.set({ id: userUploadRef.id, userId, fileName, createdAt: FieldValue.serverTimestamp(), status: "pending_ocr" });
    let extractedText = "";
    try {
        if (contentType === "application/pdf") {
            const gcsSourceUri = `gs://${bucket}/${name}`;
            const outputPrefix = `ocr_results/${userUploadRef.id}`;
            const gcsDestinationUri = `gs://${bucket}/${outputPrefix}/`;
            const request: protos.google.cloud.vision.v1.IAsyncAnnotateFileRequest = { inputConfig: { gcsSource: { uri: gcsSourceUri }, mimeType: "application/pdf" }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }], outputConfig: { gcsDestination: { uri: gcsDestinationUri }, batchSize: 100 } };
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
        await userUploadRef.update({ status: "error", error: `Processing failed: ${errorMessage}` }).catch((updateErr) => { logger.error(`Failed to update upload status to error after AI suggestion failure: ${updateErr.message}`); });
    }
});

// Triggered when a userUpload document's status becomes 'pending_final_review'.
// AI suggests a topic/chapter for the generated content.
export const onContentReadyForReview = onDocumentUpdated({
    document: "userUploads/{uploadId}", region: LOCATION, memory: "1GiB", cpu: 1, timeoutSeconds: 300,
}, async (event) => {
    ensureClientsInitialized();
    const after = event.data?.after.data() as UserUpload | undefined;
    const before = event.data?.before.data() as UserUpload | undefined; // Added before for accurate status change detection
    if (!after || !before || before.status === after.status || after.status !== "pending_final_review") {
        logger.log(`Skipping onContentReadyForReview trigger for upload ${event.params.uploadId}. Status not 'pending_final_review' or status unchanged.`);
        return;
    }
    const content = after.finalAwaitingReviewData;
    if (!content || (!content.mcqs?.length && !content.flashcards?.length)) { logger.warn(`No generated content found for upload ${event.params.uploadId} to classify.`); return; }
    const contentSample = JSON.stringify({ mcqs: (content.mcqs || []).slice(0, 3).map((mcq: MCQ) => mcq.question), flashcards: (content.flashcards || []).slice(0, 3).map((fc: Flashcard) => fc.front) });
    const docRef = db.collection("userUploads").doc(event.params.uploadId);
    logger.info(`Attempting to suggest classification for upload ${event.params.uploadId}`);
    try {
        const generativeModel = _powerfulModel;
        const prompt = `CRITICAL: You MUST respond with only a valid JSON object. Do not add any conversational text. As a specialist in postgraduate pediatric medical curricula, analyze the following content sample and suggest the single best Topic and Chapter. JSON structure: {"suggestedTopic": "string", "suggestedChapter": "string"}. Sample: """${contentSample}"""`;
        const resp = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const parsedResponse = extractJson(resp.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
        const { suggestedTopic, suggestedChapter } = parsedResponse || {};
        await docRef.update({ suggestedTopic: suggestedTopic || null, suggestedChapter: suggestedChapter || null, updatedAt: FieldValue.serverTimestamp() });
        logger.info(`Classification suggested for upload ${event.params.uploadId}: Topic: ${suggestedTopic}, Chapter: ${suggestedChapter}`);
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        logger.error(`AI suggestion failed for upload ${event.params.uploadId}: ${err.message}`, err);
        await docRef.update({ status: "error", error: `AI suggestion failed: ${err.message}` }).catch((updateErr) => { logger.error(`Failed to update upload status to error after AI suggestion failure: ${updateErr.message}`); });
    }
});

// =============================================================================
//
//   CORE USER FUNCTIONS (Callable)
//
// =============================================================================

// Records the full result of a completed quiz session to the 'quizResults' collection.
export const addquizresult = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<Omit<QuizResult, "id" | "userId" | "date">>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    const userId = request.auth.uid;
    const quizData = validateInput(schemas.QuizResultSchema, request.data);
    const resultRef = db.collection("quizResults").doc();
    await resultRef.set({ ...quizData, id: resultRef.id, userId, date: FieldValue.serverTimestamp() });
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.data() as DocumentData | undefined;
    if (userData) {
        const lastStudiedDate = (userData.lastStudiedDate as Timestamp)?.toDate();
        const today = new Date(); today.setHours(0, 0, 0, 0); const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        let newStreak = userData.currentStreak || 0;
        if (lastStudiedDate) {
            const lastStudyDay = lastStudiedDate; lastStudyDay.setHours(0, 0, 0, 0);
            if (lastStudyDay.getTime() === today.getTime()) { /* no change */ }
            else if (lastStudyDay.getTime() === yesterday.getTime()) { newStreak++; }
            else { newStreak = 1; }
        } else { newStreak = 1; }
        await userRef.update({ currentStreak: newStreak, lastStudiedDate: FieldValue.serverTimestamp() });
        logger.info(`User ${userId} completed quiz. Streak: ${newStreak}`);
    }
    logger.info(`New quiz result added for user ${userId}. Quiz ID: ${resultRef.id}`);
    return { success: true, id: resultRef.id };
});

// Records a user's attempt for a specific MCQ and applies Spaced Repetition (SM-2) logic.
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
        const userRef = db.collection("users").doc(userId);
        const userDoc = await transaction.get(userRef);
        const userData = userDoc.data() as DocumentData | undefined;
        if (userData) {
            const lastStudiedDate = (userData.lastStudiedDate as Timestamp)?.toDate();
            const today = new Date(); today.setHours(0, 0, 0, 0); const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
            let newStreak = userData.currentStreak || 0;
            if (lastStudiedDate) {
                const lastStudyDay = lastStudiedDate; lastStudyDay.setHours(0, 0, 0, 0);
                if (lastStudyDay.getTime() === today.getTime()) { /* no change */ }
                else if (lastStudyDay.getTime() === yesterday.getTime()) { newStreak++; }
                else { newStreak = 1; }
            } else { newStreak = 1; }
            transaction.update(userRef, { currentStreak: newStreak, lastStudiedDate: FieldValue.serverTimestamp() });
            logger.debug(`User ${userId} attempted MCQ. Streak: ${newStreak}`);
        }
        logger.debug(`Attempt recorded for user ${userId}, MCQ ${mcqId}. Correct: ${isCorrect}. Next Review: ${nextReviewDateJS.toISOString().split("T")[0]}`);
    });
    return { success: true };
});

// Toggles a content item (MCQ or Flashcard) in a user's bookmarks list.
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

// Callable function to record a flashcard attempt and confidence rating
export const addFlashcardAttempt = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ flashcardId: string, rating: "again" | "good" | "easy" }>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    const userId = request.auth.uid;
    const { flashcardId, rating } = validateInput(schemas.FlashcardAttemptSchema, request.data);
    const attemptRef = db.collection("users").doc(userId).collection("attemptedFlashcards").doc(flashcardId);
    await attemptRef.set({ lastReviewed: FieldValue.serverTimestamp(), rating: rating, attempts: FieldValue.increment(1), userId: userId }, { merge: true });
    logger.info(`Flashcard ${flashcardId} rated as '${rating}' by user ${userId}.`);
    return { success: true };
});

// =============================================================================
//
//   ADMIN CONTENT PIPELINE & MANAGEMENT FUNCTIONS (Callable)
//
// =============================================================================

// Creates a new UserUpload document from manually pasted text, primarily for General content.
export const processManualTextInput = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ fileName: string, rawText: string, isMarrow: boolean }>) => {
  if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
  const { fileName, rawText, isMarrow } = validateInput(schemas.ProcessMarrowTextSchema, request.data);

  const userId = request.auth.uid;
  const userUploadRef = db.collection("userUploads").doc();
  const finalFileName = isMarrow ? `MARROW_TEXT_${Date.now()}_${fileName}` : `TEXT_${Date.now()}_${fileName}`;

  const newUpload: Partial<UserUpload> = {
      id: userUploadRef.id, userId, fileName: finalFileName, createdAt: FieldValue.serverTimestamp(),
      extractedText: rawText, status: "processed",
  };

  if (isMarrow) {
      newUpload.stagedContent = { orphanExplanations: [rawText], extractedMcqs: [], generatedMcqs: [] };
      newUpload.status = "pending_marrow_generation_approval";
      newUpload.suggestedNewMcqCount = Math.ceil(rawText.length / 500);
  }

  await userUploadRef.set(newUpload, { merge: true });
  logger.info(`New manual text upload created: ${userUploadRef.id} (File: ${finalFileName}).`);

  return { success: true, uploadId: userUploadRef.id, extractedMcqs: [], suggestedNewMcqCount: newUpload.suggestedNewMcqCount || 0 };
});

// Extracts MCQs and orphan explanations from raw OCR text (primarily for Marrow PDFs).
// It also suggests initial key topics.
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
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) throw new HttpsError("internal", "AI failed to respond for MCQ generation.");
        const parsedData = extractJson(responseText);
        const keyTopicsPrompt = `Analyze the following medical text and identify 5-10 key clinical topics (tags). Provide them as a JSON array of strings. Example: ["Topic 1", "Topic 2"]. Text: """${extractedText}"""`;
        const keyTopicsResult = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: keyTopicsPrompt }] }] });
        const suggestedKeyTopics = extractJson(keyTopicsResult.response.candidates?.[0]?.content.parts?.[0]?.text || "[]");
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

// Generates new MCQs from orphan explanations and re-analyzes topics.
export const generateAndAnalyzeMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, count: number }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId, count } = request.data;
    const uploadRef = db.collection("userUploads").doc(uploadId); const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists) throw new HttpsError("not-found", "Upload document not found.");
    const stagedContent = uploadDoc.data()?.stagedContent || {};
    const orphanExplanations = stagedContent.orphanExplanations || []; let generatedMcqs: Partial<MCQ>[] = [];
    let suggestedKeyTopics: string[] = uploadDoc.data()?.suggestedKeyTopics || [];
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
        const allQuestionsText = allContentForTopicAnalysis.map((mcq) => mcq.question).join("\n");
        const keyTopicsPrompt = `Analyze the following medical questions and explanations to identify 5-10 key clinical topics (tags). Provide them as a JSON array of strings. Example: ["Topic 1", "Topic 2"]. Text: """${allQuestionsText}"""`;
        try {
            const keyTopicsResult = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: keyTopicsPrompt }] }] });
            const keyTopicsText = keyTopicsResult.response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (keyTopicsText) { const newSuggestedKeyTopics = extractJson(keyTopicsText); if (Array.isArray(newSuggestedKeyTopics)) { suggestedKeyTopics = Array.from(new Set([...suggestedKeyTopics, ...newSuggestedKeyTopics])); } }
        } catch (e: unknown) { logger.warn(`Failed to re-suggest key topics for upload ${uploadId}: ${(e as Error).message}`); }
    }
    await uploadRef.update({ "stagedContent.generatedMcqs": generatedMcqs, suggestedKeyTopics, status: "pending_assignment", updatedAt: FieldValue.serverTimestamp() });
    logger.info(`Marrow content generated and analyzed for upload ${uploadId}. New MCQs: ${generatedMcqs.length}`);
    return { success: true, message: "Generation and topic analysis complete!" };
});

// Approves and saves Marrow-specific content (MCQs) into Firestore.
export const approveMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId, topicId, topicName, chapterId, chapterName, keyTopics } = request.data;
    const adminId = request.auth.uid;
    const uploadRef = db.collection("userUploads").doc(uploadId); const topicRef = db.collection("MarrowTopics").doc(topicId);
    return db.runTransaction(async (transaction: Transaction) => {
        const uploadDoc = await transaction.get(uploadRef);
        if (!uploadDoc.exists) throw new HttpsError("not-found", `Upload ${uploadId} not found.`);
        const stagedContent = uploadDoc.data()?.stagedContent || {};
        const allMcqsToApprove = [...(stagedContent.extractedMcqs || []), ...(stagedContent.generatedMcqs || [])];
        if (allMcqsToApprove.length === 0) throw new HttpsError("failed-precondition", "No content to approve for Marrow.");
        
        const topicDoc = await transaction.get(topicRef);
        let chapters = (topicDoc.data()?.chapters || []) as Chapter[];
        const chapterIndex = chapters.findIndex((c) => c.id === chapterId);

        if (chapterIndex > -1) {
            chapters[chapterIndex].mcqCount = (chapters[chapterIndex].mcqCount || 0) + allMcqsToApprove.length;
            chapters[chapterIndex].originalTextRefIds = Array.from(new Set([...(chapters[chapterIndex].originalTextRefIds || []), uploadId]));
            chapters[chapterIndex].flashcardCount = (chapters[chapterIndex].flashcardCount || 0) + (stagedContent.generatedFlashcards?.length || 0);

        } else {
            chapters.push({ 
                id: chapterId, name: chapterName, mcqCount: allMcqsToApprove.length, 
                flashcardCount: (stagedContent.generatedFlashcards?.length || 0), 
                topicId: topicId, source: 'Marrow', originalTextRefIds: [uploadId], summaryNotes: null 
            });
        }

        if (!topicDoc.exists) {
            transaction.set(topicRef, { name: topicName, chapters: chapters, source: 'Marrow', totalMcqCount: allMcqsToApprove.length, totalFlashcardCount: (stagedContent.generatedFlashcards?.length || 0), chapterCount: chapters.length });
        } else {
            const newTotalMcqCount = chapters.reduce((sum, ch) => sum + (ch.mcqCount || 0), 0);
            const newTotalFlashcardCount = chapters.reduce((sum, ch) => sum + (ch.flashcardCount || 0), 0);
            transaction.update(topicRef, { chapters: chapters, totalMcqCount: newTotalMcqCount, totalFlashcardCount: newTotalFlashcardCount, chapterCount: chapters.length });
        }

        allMcqsToApprove.forEach((mcqData: Partial<MCQ>) => {
            const mcqRef = db.collection('MarrowMCQ').doc();
            transaction.set(mcqRef, { 
                ...mcqData, id: mcqRef.id, topic: topicName, topicId, chapter: chapterName, chapterId, tags: keyTopics, status: 'approved', 
                source: 'Marrow', creatorId: adminId, createdAt: FieldValue.serverTimestamp(), uploadId 
            });
        });

        (stagedContent.generatedFlashcards || []).forEach((flashcardData: Partial<Flashcard>) => {
            const flashcardRef = db.collection('Flashcards').doc();
            transaction.set(flashcardRef, {
                ...flashcardData, id: flashcardRef.id, topic: topicName, topicId, chapter: chapterName, chapterId, tags: keyTopics, status: 'approved',
                source: 'Marrow', creatorId: adminId, createdAt: FieldValue.serverTimestamp(), uploadId, topicName, chapterName
            });
        });

        for (const tag of keyTopics) { 
            const keyTopicRef = db.collection('KeyClinicalTopics').doc(tag.replace(/\s+/g, '_').toLowerCase());
            transaction.set(keyTopicRef, { name: tag, createdAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        transaction.update(uploadRef, { status: 'completed', updatedAt: FieldValue.serverTimestamp() });
        return { success: true, message: `${allMcqsToApprove.length} Marrow MCQs and ${(stagedContent.generatedFlashcards?.length || 0)} Flashcards approved.` };
    });
});

// =============================================================================
//
//   GENERAL PIPELINE FUNCTIONS (Advanced 5-Stage Batch Processing)
//
// =============================================================================

export const processManualTextInput = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ fileName: string, rawText: string, isMarrow: boolean }>) => {
  if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
  const { fileName, rawText, isMarrow } = validateInput(schemas.ProcessMarrowTextSchema, request.data);

  const userId = request.auth.uid;
  const userUploadRef = db.collection("userUploads").doc();
  const finalFileName = isMarrow ? `MARROW_TEXT_${Date.now()}_${fileName}` : `TEXT_${Date.now()}_${fileName}`;

  const newUpload: Partial<UserUpload> = {
      id: userUploadRef.id, userId, fileName: finalFileName, createdAt: FieldValue.serverTimestamp(),
      extractedText: rawText, status: "processed",
  };

  if (isMarrow) {
      newUpload.stagedContent = { orphanExplanations: [rawText], extractedMcqs: [], generatedMcqs: [] };
      newUpload.status = "pending_marrow_generation_approval";
      newUpload.suggestedNewMcqCount = Math.ceil(rawText.length / 500);
  }

  await userUploadRef.set(newUpload, { merge: true });
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
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) throw new HttpsError("internal", "AI failed to respond for MCQ generation.");
        const parsedData = extractJson(responseText);
        const keyTopicsPrompt = `Analyze the following medical text and identify 5-10 key clinical topics (tags). Provide them as a JSON array of strings. Example: ["Topic 1", "Topic 2"]. Text: """${extractedText}"""`;
        const keyTopicsResult = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: keyTopicsPrompt }] }] });
        const suggestedKeyTopics = extractJson(keyTopicsResult.response.candidates?.[0]?.content.parts?.[0]?.text || "[]");
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

// Generates new MCQs from orphan explanations and re-analyzes topics.
export const generateAndAnalyzeMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, count: number }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId, count } = request.data;
    const uploadRef = db.collection("userUploads").doc(uploadId); const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists) throw new HttpsError("not-found", "Upload document not found.");
    const stagedContent = uploadDoc.data()?.stagedContent || {};
    const orphanExplanations = stagedContent.orphanExplanations || []; let generatedMcqs: Partial<MCQ>[] = [];
    let suggestedKeyTopics: string[] = uploadDoc.data()?.suggestedKeyTopics || [];
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
        const allQuestionsText = allContentForTopicAnalysis.map((mcq) => mcq.question).join("\n");
        const keyTopicsPrompt = `Analyze the following medical questions and explanations to identify 5-10 key clinical topics (tags). Provide them as a JSON array of strings. Example: ["Topic 1", "Topic 2"]. Text: """${allQuestionsText}"""`;
        try {
            const keyTopicsResult = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: keyTopicsPrompt }] }] });
            const keyTopicsText = keyTopicsResult.response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (keyTopicsText) { const newSuggestedKeyTopics = extractJson(keyTopicsText); if (Array.isArray(newSuggestedKeyTopics)) { suggestedKeyTopics = Array.from(new Set([...suggestedKeyTopics, ...newSuggestedKeyTopics])); } }
        } catch (e: unknown) { logger.warn(`Failed to re-suggest key topics for upload ${uploadId}: ${(e as Error).message}`); }
    }
    await uploadRef.update({ "stagedContent.generatedMcqs": generatedMcqs, suggestedKeyTopics, status: "pending_assignment", updatedAt: FieldValue.serverTimestamp() });
    logger.info(`Marrow content generated and analyzed for upload ${uploadId}. New MCQs: ${generatedMcqs.length}`);
    return { success: true, message: "Generation and topic analysis complete!" };
});

// Approves and saves Marrow-specific content (MCQs) into Firestore.
export const approveMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId, topicId, topicName, chapterId, chapterName, keyTopics } = request.data;
    const adminId = request.auth.uid;
    const uploadRef = db.collection("userUploads").doc(uploadId); const topicRef = db.collection("MarrowTopics").doc(topicId);
    return db.runTransaction(async (transaction: Transaction) => {
        const uploadDoc = await transaction.get(uploadRef);
        if (!uploadDoc.exists) throw new HttpsError("not-found", `Upload ${uploadId} not found.`);
        const stagedContent = uploadDoc.data()?.stagedContent || {};
        const allMcqsToApprove = [...(stagedContent.extractedMcqs || []), ...(stagedContent.generatedMcqs || [])];
        if (allMcqsToApprove.length === 0) throw new HttpsError("failed-precondition", "No content to approve for Marrow.");
        
        const topicDoc = await transaction.get(topicRef);
        let chapters = (topicDoc.data()?.chapters || []) as Chapter[];
        const chapterIndex = chapters.findIndex((c) => c.id === chapterId);

        if (chapterIndex > -1) {
            chapters[chapterIndex].mcqCount = (chapters[chapterIndex].mcqCount || 0) + allMcqsToApprove.length;
            chapters[chapterIndex].originalTextRefIds = Array.from(new Set([...(chapters[chapterIndex].originalTextRefIds || []), uploadId]));
            chapters[chapterIndex].flashcardCount = (chapters[chapterIndex].flashcardCount || 0) + (stagedContent.generatedFlashcards?.length || 0);

        } else {
            chapters.push({ 
                id: chapterId, name: chapterName, mcqCount: allMcqsToApprove.length, 
                flashcardCount: (stagedContent.generatedFlashcards?.length || 0), 
                topicId: topicId, source: 'Marrow', originalTextRefIds: [uploadId], summaryNotes: null 
            });
        }

        if (!topicDoc.exists) {
            transaction.set(topicRef, { name: topicName, chapters: chapters, source: 'Marrow', totalMcqCount: allMcqsToApprove.length, totalFlashcardCount: (stagedContent.generatedFlashcards?.length || 0), chapterCount: chapters.length });
        } else {
            const newTotalMcqCount = chapters.reduce((sum, ch) => sum + (ch.mcqCount || 0), 0);
            const newTotalFlashcardCount = chapters.reduce((sum, ch) => sum + (ch.flashcardCount || 0), 0);
            transaction.update(topicRef, { chapters: chapters, totalMcqCount: newTotalMcqCount, totalFlashcardCount: newTotalFlashcardCount, chapterCount: chapters.length });
        }

        allMcqsToApprove.forEach((mcqData: Partial<MCQ>) => {
            const mcqRef = db.collection('MarrowMCQ').doc();
            transaction.set(mcqRef, { 
                ...mcqData, id: mcqRef.id, topic: topicName, topicId, chapter: chapterName, chapterId, tags: keyTopics, status: 'approved', 
                source: 'Marrow', creatorId: adminId, createdAt: FieldValue.serverTimestamp(), uploadId 
            });
        });

        (stagedContent.generatedFlashcards || []).forEach((flashcardData: Partial<Flashcard>) => {
            const flashcardRef = db.collection('Flashcards').doc();
            transaction.set(flashcardRef, {
                ...flashcardData, id: flashcardRef.id, topic: topicName, topicId, chapter: chapterName, chapterId, tags: keyTopics, status: 'approved',
                source: 'Marrow', creatorId: adminId, createdAt: FieldValue.serverTimestamp(), uploadId, topicName, chapterName
            });
        });

        for (const tag of keyTopics) { 
            const keyTopicRef = db.collection('KeyClinicalTopics').doc(tag.replace(/\s+/g, '_').toLowerCase());
            transaction.set(keyTopicRef, { name: tag, createdAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        transaction.update(uploadRef, { status: 'completed', updatedAt: FieldValue.serverTimestamp() });
        return { success: true, message: `${allMcqsToApprove.length} Marrow MCQs and ${(stagedContent.generatedFlashcards?.length || 0)} Flashcards approved.` };
    });
});

// =============================================================================
//
//   GENERAL PIPELINE FUNCTIONS (Advanced 5-Stage Batch Processing)
//
// =============================================================================

export const processManualTextInput = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ fileName: string, rawText: string, isMarrow: boolean }>) => {
  if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
  const { fileName, rawText, isMarrow } = validateInput(schemas.ProcessMarrowTextSchema, request.data);

  const userId = request.auth.uid;
  const userUploadRef = db.collection("userUploads").doc();
  const finalFileName = isMarrow ? `MARROW_TEXT_${Date.now()}_${fileName}` : `TEXT_${Date.now()}_${fileName}`;

  const newUpload: Partial<UserUpload> = {
      id: userUploadRef.id, userId, fileName: finalFileName, createdAt: FieldValue.serverTimestamp(),
      extractedText: rawText, status: "processed",
  };

  if (isMarrow) {
      newUpload.stagedContent = { orphanExplanations: [rawText], extractedMcqs: [], generatedMcqs: [] };
      newUpload.status = "pending_marrow_generation_approval";
      newUpload.suggestedNewMcqCount = Math.ceil(rawText.length / 500);
  }

  await userUploadRef.set(newUpload, { merge: true });
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
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) throw new HttpsError("internal", "AI failed to respond for MCQ generation.");
        const parsedData = extractJson(responseText);
        const keyTopicsPrompt = `Analyze the following medical text and identify 5-10 key clinical topics (tags). Provide them as a JSON array of strings. Example: ["Topic 1", "Topic 2"]. Text: """${extractedText}"""`;
        const keyTopicsResult = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: keyTopicsPrompt }] }] });
        const suggestedKeyTopics = extractJson(keyTopicsResult.response.candidates?.[0]?.content.parts?.[0]?.text || "[]");
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

// Generates new MCQs from orphan explanations and re-analyzes topics.
export const generateAndAnalyzeMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, count: number }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId, count } = request.data;
    const uploadRef = db.collection("userUploads").doc(uploadId); const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists) throw new HttpsError("not-found", "Upload document not found.");
    const stagedContent = uploadDoc.data()?.stagedContent || {};
    const orphanExplanations = stagedContent.orphanExplanations || []; let generatedMcqs: Partial<MCQ>[] = [];
    let suggestedKeyTopics: string[] = uploadDoc.data()?.suggestedKeyTopics || [];
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
        const allQuestionsText = allContentForTopicAnalysis.map((mcq) => mcq.question).join("\n");
        const keyTopicsPrompt = `Analyze the following medical questions and explanations to identify 5-10 key clinical topics (tags). Provide them as a JSON array of strings. Example: ["Topic 1", "Topic 2"]. Text: """${allQuestionsText}"""`;
        try {
            const keyTopicsResult = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: keyTopicsPrompt }] }] });
            const keyTopicsText = keyTopicsResult.response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (keyTopicsText) { const newSuggestedKeyTopics = extractJson(keyTopicsText); if (Array.isArray(newSuggestedKeyTopics)) { suggestedKeyTopics = Array.from(new Set([...suggestedKeyTopics, ...newSuggestedKeyTopics])); } }
        } catch (e: unknown) { logger.warn(`Failed to re-suggest key topics for upload ${uploadId}: ${(e as Error).message}`); }
    }
    await uploadRef.update({ "stagedContent.generatedMcqs": generatedMcqs, suggestedKeyTopics, status: "pending_assignment", updatedAt: FieldValue.serverTimestamp() });
    logger.info(`Marrow content generated and analyzed for upload ${uploadId}. New MCQs: ${generatedMcqs.length}`);
    return { success: true, message: "Generation and topic analysis complete!" };
});

// Approves and saves Marrow-specific content (MCQs) into Firestore.
export const approveMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId, topicId, topicName, chapterId, chapterName, keyTopics } = request.data;
    const adminId = request.auth.uid;
    const uploadRef = db.collection("userUploads").doc(uploadId); const topicRef = db.collection("MarrowTopics").doc(topicId);
    return db.runTransaction(async (transaction: Transaction) => {
        const uploadDoc = await transaction.get(uploadRef);
        if (!uploadDoc.exists) throw new HttpsError("not-found", `Upload ${uploadId} not found.`);
        const stagedContent = uploadDoc.data()?.stagedContent || {};
        const allMcqsToApprove = [...(stagedContent.extractedMcqs || []), ...(stagedContent.generatedMcqs || [])];
        if (allMcqsToApprove.length === 0) throw new HttpsError("failed-precondition", "No content to approve for Marrow.");
        
        const topicDoc = await transaction.get(topicRef);
        let chapters = (topicDoc.data()?.chapters || []) as Chapter[];
        const chapterIndex = chapters.findIndex((c) => c.id === chapterId);

        if (chapterIndex > -1) {
            chapters[chapterIndex].mcqCount = (chapters[chapterIndex].mcqCount || 0) + allMcqsToApprove.length;
            chapters[chapterIndex].originalTextRefIds = Array.from(new Set([...(chapters[chapterIndex].originalTextRefIds || []), uploadId]));
            chapters[chapterIndex].flashcardCount = (chapters[chapterIndex].flashcardCount || 0) + (stagedContent.generatedFlashcards?.length || 0);

        } else {
            chapters.push({ 
                id: chapterId, name: chapterName, mcqCount: allMcqsToApprove.length, 
                flashcardCount: (stagedContent.generatedFlashcards?.length || 0), 
                topicId: topicId, source: 'Marrow', originalTextRefIds: [uploadId], summaryNotes: null 
            });
        }

        if (!topicDoc.exists) {
            transaction.set(topicRef, { name: topicName, chapters: chapters, source: 'Marrow', totalMcqCount: allMcqsToApprove.length, totalFlashcardCount: (stagedContent.generatedFlashcards?.length || 0), chapterCount: chapters.length });
        } else {
            const newTotalMcqCount = chapters.reduce((sum, ch) => sum + (ch.mcqCount || 0), 0);
            const newTotalFlashcardCount = chapters.reduce((sum, ch) => sum + (ch.flashcardCount || 0), 0);
            transaction.update(topicRef, { chapters: chapters, totalMcqCount: newTotalMcqCount, totalFlashcardCount: newTotalFlashcardCount, chapterCount: chapters.length });
        }

        allMcqsToApprove.forEach((mcqData: Partial<MCQ>) => {
            const mcqRef = db.collection('MarrowMCQ').doc();
            transaction.set(mcqRef, { 
                ...mcqData, id: mcqRef.id, topic: topicName, topicId, chapter: chapterName, chapterId, tags: keyTopics, status: 'approved', 
                source: 'Marrow', creatorId: adminId, createdAt: FieldValue.serverTimestamp(), uploadId 
            });
        });

        (stagedContent.generatedFlashcards || []).forEach((flashcardData: Partial<Flashcard>) => {
            const flashcardRef = db.collection('Flashcards').doc();
            transaction.set(flashcardRef, {
                ...flashcardData, id: flashcardRef.id, topic: topicName, topicId, chapter: chapterName, chapterId, tags: keyTopics, status: 'approved',
                source: 'Marrow', creatorId: adminId, createdAt: FieldValue.serverTimestamp(), uploadId, topicName, chapterName
            });
        });

        for (const tag of keyTopics) { 
            const keyTopicRef = db.collection('KeyClinicalTopics').doc(tag.replace(/\s+/g, '_').toLowerCase());
            transaction.set(keyTopicRef, { name: tag, createdAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        transaction.update(uploadRef, { status: 'completed', updatedAt: FieldValue.serverTimestamp() });
        return { success: true, message: `${allMcqsToApprove.length} Marrow MCQs and ${(stagedContent.generatedFlashcards?.length || 0)} Flashcards approved.` };
    });
});

// =============================================================================
//
//   GENERAL PIPELINE FUNCTIONS (Advanced 5-Stage Batch Processing)
//
// =============================================================================

export const processManualTextInput = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ fileName: string, rawText: string, isMarrow: boolean }>) => {
  if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
  const { fileName, rawText, isMarrow } = validateInput(schemas.ProcessMarrowTextSchema, request.data);

  const userId = request.auth.uid;
  const userUploadRef = db.collection("userUploads").doc();
  const finalFileName = isMarrow ? `MARROW_TEXT_${Date.now()}_${fileName}` : `TEXT_${Date.now()}_${fileName}`;

  const newUpload: Partial<UserUpload> = {
      id: userUploadRef.id, userId, fileName: finalFileName, createdAt: FieldValue.serverTimestamp(),
      extractedText: rawText, status: "processed",
  };

  if (isMarrow) {
      newUpload.stagedContent = { orphanExplanations: [rawText], extractedMcqs: [], generatedMcqs: [] };
      newUpload.status = "pending_marrow_generation_approval";
      newUpload.suggestedNewMcqCount = Math.ceil(rawText.length / 500);
  }

  await userUploadRef.set(newUpload, { merge: true });
  logger.info(`New manual text upload created: ${userUploadRef.id} (File: ${finalFileName}).`);

  return { success: true, uploadId: userUploadRef.id, extractedMcqs: [], suggestedNewMcqCount: newUpload.suggestedNewMcqCount || 0 };
});

export const suggestClassification = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId } = request.data;
    const docRef = db.collection("userUploads").doc(uploadId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new HttpsError("not-found", "Upload document not found.");
    const extractedText = docSnap.data()?.extractedText || "";
    if (!extractedText) throw new HttpsError("failed-precondition", "Document has no extracted text.");
    await docRef.update({ status: "pending_classification" });
    let attempts = 0;
    while (attempts < 3) {
        try {
            const generativeModel = _powerfulModel;
            const prompt = `CRITICAL: You MUST respond with only a valid JSON object. Do not add any conversational text. As a specialist in postgraduate pediatric medical curricula (NEET SS, INI-CET), analyze the following text. Text excerpt to analyze: """${extractedText.substring(0, 8000) || ""}""" Return a single JSON object with the following exact structure: {"suggestedTopic": "string", "suggestedChapter": "string", "estimatedMcqCount": number, "estimatedFlashcardCount": number, "sourceReference": "string"}`;
            const resp = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
            const rawResponse = resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            const parsedResponse = extractJson(rawResponse);
            await docRef.update({ title: parsedResponse.suggestedChapter || "Untitled", suggestedTopic: parsedResponse.suggestedTopic, suggestedChapter: parsedResponse.suggestedChapter, estimatedMcqCount: parsedResponse.estimatedMcqCount, estimatedFlashcardCount: parsedResponse.estimatedFlashcardCount, sourceReference: parsedResponse.sourceReference, status: "pending_approval" });
            return { success: true, ...parsedResponse };
        } catch (e: unknown) {
            const err = e as Error;
            attempts++;
            logger.warn(`suggestClassification attempt ${attempts} failed.`, { error: (e as Error).message });
            if (attempts >= 3) {
                await docRef.update({ status: 'error', error: `AI suggestion failed: ${err.message}` });
                throw new HttpsError("internal", err.message);
            }
        }
    }
    throw new HttpsError("internal", "Function failed after multiple retries.");
});

export const prepareBatchGeneration = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, totalMcqCount: number, totalFlashcardCount: number, batchSize: number, approvedTopic: string, approvedChapter: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId, totalMcqCount, totalFlashcardCount, batchSize, approvedTopic, approvedChapter } = request.data;
    const docRef = db.collection("userUploads").doc(uploadId);
    const docSnap = await docRef.get();
    const extractedText = docSnap.data()?.extractedText || "";
    const textChunks = extractedText.split(/\n\s*\n/).filter((chunk: string) => chunk.trim().length > 100);
    if (textChunks.length === 0) {
        throw new HttpsError("failed-precondition", "No valid text chunks found for batch generation.");
    }
    await docRef.update({ approvedTopic, approvedChapter, totalMcqCount, totalFlashcardCount, batchSize, totalBatches: textChunks.length, completedBatches: 0, textChunks, generatedContent: [], status: "batch_ready" });
    return { success: true, totalBatches: textChunks.length };
});

export const startAutomatedBatchGeneration = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    if (!request.auth?.token.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId } = request.data;
    const docRef = db.collection("userUploads").doc(uploadId);
    const docSnap = await docRef.get();
    const uploadData = docSnap.data() as UserUpload;
    const { textChunks, totalMcqCount, totalFlashcardCount, totalBatches, completedBatches, generatedContent, existingQuestionSnippets } = uploadData;
    if (!textChunks || !totalBatches) throw new HttpsError("invalid-argument", `Upload ${uploadId} is not prepared for batch generation.`);
    
    await docRef.update({ status: "generating_batch" });

    let currentCompletedBatches = completedBatches || 0;
    let currentGeneratedContent = generatedContent || [];

    for (let i = currentCompletedBatches; i < totalBatches; i++) {
        const batchNumber = i + 1;
        const textChunk = textChunks[i];
        const mcqsPerBatch = Math.ceil((totalMcqCount || 0) / totalBatches);
        const flashcardsPerBatch = Math.ceil((totalFlashcardCount || 0) / totalBatches);
        const negativeConstraint = (existingQuestionSnippets && existingQuestionSnippets.length > 0) ? `CRITICAL CONSTRAINT: Do not create questions that are functionally identical to any of the questions in this list: ${JSON.stringify(existingQuestionSnippets)}` : "";

        logger.info(`Generating content for batch ${batchNumber} of ${totalBatches} for upload ${uploadId}`);

        try {
            const generativeModel = _powerfulModel;
            const prompt = `You are a medical education expert specialized in Pediatrics, tasked with creating high-yield, exam-focused MCQs and Flashcards for a Pediatrics Postgraduate Resident preparing for NEET SS and INI-CET.

Instructions:
1.  Create **single-best-answer MCQs** (one correct option + three plausible distractors).
2.  Base questions on:
    - Core pediatric topics (as per Ghai/Nelson)
    - Clinical case scenarios
    - Drug dosages and protocols
    - Investigations, diagnostic criteria, and interpretation
    - Treatment guidelines and emergency management
    - Recent advances and evidence-based practices
3.  For Flashcards, create concise front/back pairs covering high-yield facts, definitions, or criteria.

Text to process: """${textChunk}"""

Based on the text, generate exactly ${mcqsPerBatch} MCQs and ${flashcardsPerBatch} flashcards.
${negativeConstraint}

Return the output as a single, well-formed JSON object with this exact structure: {"mcqs": [{"question": "string", "options": ["string", "string", "string", "string"], "answer": "string"}], "flashcards": [{"front": "string", "back": "string"}]}`;

            let genAttempts = 0;
            let batchResult: any = {};
            while (genAttempts < 3) {
                try {
                    const resp = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
                    const rawResponse = resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    
                    if (!rawResponse) {
                        throw new Error("AI model returned an empty or invalid response.");
                    }
                    batchResult = extractJson(rawResponse);
                    break;
                } catch (e: unknown) {
                        genAttempts++;
                        logger.warn(`Batch ${batchNumber} generation attempt ${genAttempts} failed.`, { error: (e as Error).message });
                        if (genAttempts >= 3) {
                            logger.error(`Failed to generate batch ${batchNumber} after 3 attempts, stopping automated process for this upload.`, { error: (e as Error).message });
                            await docRef.update({ status: "error", error: `Automated batch generation failed for batch ${batchNumber}: ${(e as Error).message}` });
                            throw new HttpsError("internal", `Automated batch generation failed for batch ${batchNumber}.`);
                        }
                    }
                }
            
            currentGeneratedContent.push({ batchNumber, ...batchResult });
            currentCompletedBatches++;

            const isComplete = currentCompletedBatches === totalBatches;

            await docRef.update({
                generatedContent: currentGeneratedContent,
                completedBatches: currentCompletedBatches,
                status: isComplete ? "pending_final_review" : "generating_batch"
            });

            if (isComplete) {
                const finalAwaitingReviewData: AwaitingReviewData = {
                    mcqs: currentGeneratedContent.flatMap((b: any) => (b.mcqs || []) as MCQ[]),
                    flashcards: currentGeneratedContent.flatMap((b: any) => (b.flashcards || []) as Flashcard[]),
                };
                await docRef.update({ finalAwaitingReviewData, status: "pending_final_review" });
                logger.info(`Automated batch generation complete for upload ${uploadId}. Final status: pending_final_review.`);
            }

        } catch (e: unknown) {
            logger.error(`Critical error during automated batch generation for upload ${uploadId}:`, e);
            await docRef.update({ status: "error", error: `Critical automated batch generation failure: ${(e as Error).message}` });
            throw new HttpsError("internal", `Critical automated batch generation failure for upload ${uploadId}.`);
        }
    }
    return { success: true, message: `Automated batch generation for upload ${uploadId} finished.` };
});

export const autoAssignContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, existingTopics: PediaquizTopicType[], scopeToTopicName?: string }>) => {
    if (!request.auth?.token.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId, existingTopics, scopeToTopicName } = request.data;
    const docRef = db.collection("userUploads").doc(uploadId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new HttpsError("not-found", "Upload not found.");
    const uploadData = docSnap.data() as UserUpload;
    if (uploadData.status !== 'pending_final_review') throw new HttpsError("failed-precondition", "Content must be in 'pending_final_review' state.");
    const allGeneratedContent = uploadData.finalAwaitingReviewData;
    if (!allGeneratedContent || allGeneratedContent.mcqs.length === 0) throw new HttpsError("failed-precondition", "No generated content to assign.");
    let contextText: string;
    let taskText: string;
    let topicsAndChaptersContext = existingTopics.map((t: PediaquizTopicType) => ({ topic: t.name, chapters: t.chapters.map((c: Chapter) => c.name) }));
    if (scopeToTopicName) {
        const scopedTopic = topicsAndChaptersContext.find(t => t.topic === scopeToTopicName);
        contextText = `The content belongs to the broad medical topic of: "${scopeToTopicName}". Existing chapters are: ${JSON.stringify(scopedTopic?.chapters || [])}`;
        taskText = `Group the content into logical, new chapter names that fit within "${scopeToTopicName}". You can also assign content to existing chapters if it's a perfect fit.`;
    } else {
        contextText = `Here is the existing library structure: ${JSON.stringify(topicsAndChaptersContext, null, 2)}`;
        taskText = `Assign each item to the most appropriate existing chapter and topic. You may suggest new, relevant chapter names within existing topics if necessary.`;
    }
    const contentToCategorize = {
        mcqs: (allGeneratedContent.mcqs || []).map((m: MCQ, index: number) => ({ index, question: m.question })),
        flashcards: (allGeneratedContent.flashcards || []).map((f: Flashcard, index: number) => ({ index, front: f.front }))
    };
    const prompt = `You are an AI-powered medical curriculum architect. Your task is to intelligently sort generated educational content into an existing library structure.
CONTEXT: ${contextText}.
TASK: ${taskText}.
CONTENT TO ASSIGN: ${JSON.stringify(contentToCategorize, null, 2).substring(0, 100000)}.
RESPONSE FORMAT: Return a single JSON array with the exact structure: [{"topicName": "...", "chapterName": "...", "isNewChapter": boolean, "mcqIndexes": [...], "flashcardIndexes": [...]}, ...]`;
    try {
        const generativeModel = _powerfulModel;
        const resp = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const rawResponse = resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const assignments = extractJson(rawResponse);
        const assignmentPayload: AssignmentSuggestion[] = assignments.map((a: any) => ({
            topicName: a.topicName, chapterName: a.chapterName, isNewChapter: a.isNewChapter,
            mcqs: (a.mcqIndexes || []).map((i: number) => allGeneratedContent.mcqs[i]),
            flashcards: (a.flashcardIndexes || []).map((i: number) => allGeneratedContent.flashcards[i]),
        }));
        await docRef.update({ status: 'pending_assignment_review', assignmentSuggestions: assignmentPayload, updatedAt: FieldValue.serverTimestamp() });
        return { success: true, suggestions: assignmentPayload };
    }
    catch (e: unknown) {
        const err = e as Error;
        await docRef.update({ status: 'error', error: `Auto-assignment failed: ${err.message}` });
        throw new HttpsError("internal", err.message);
    }
});

export const approveContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, assignments: AssignmentSuggestion[] }>) => {
    if (!request.auth?.token.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId, assignments } = request.data;
    const batch = db.batch();
    const adminId = request.auth.uid; // Get adminId for creatorId

    for (const assignment of assignments) {
        const { topicName, chapterName, mcqs, flashcards } = assignment;
        const topicRef = db.collection("Topics").doc(normalizeId(topicName));
        
        // Update the Topic document's chapters array with objects
        batch.set(topicRef, {
            name: topicName,
            chapters: FieldValue.arrayUnion({
                id: normalizeId(chapterName),
                name: chapterName,
                // These counts will be updated later by a separate Firestore trigger/function or
                // recalculated on the frontend for display purposes when fetching AppData.
                // For now, we ensure the structure matches what frontend expects for chapter objects.
                mcqCount: 0, // Placeholder, will be accurately counted by frontend's getAppData
                flashcardCount: 0, // Placeholder
                topicId: normalizeId(topicName), // Ensure consistency
                source: 'General' // Ensure consistency
            })
        }, { merge: true });

        // Save MCQs
        (mcqs || []).forEach((mcq: Partial<MCQ>) => {
            const mcqRef = db.collection("MasterMCQ").doc();
            batch.set(mcqRef, { 
                ...mcq, 
                id: mcqRef.id,
                topic: topicName, // Raw name
                chapter: chapterName, // Raw name
                topicId: normalizeId(topicName), // Normalized ID
                chapterId: normalizeId(chapterName), // Normalized ID
                sourceUploadId: uploadId, 
                status: 'approved', 
                creatorId: adminId, // Assign current admin as creator
                createdAt: FieldValue.serverTimestamp(),
            });
        });

        // Save Flashcards
        (flashcards || []).forEach((flashcard: Partial<Flashcard>) => {
            const flashcardRef = db.collection("Flashcards").doc();
            batch.set(flashcardRef, { 
                ...flashcard, 
                id: flashcardRef.id,
                topic: topicName, // Raw name
                chapter: chapterName, // Raw name
                topicId: normalizeId(topicName), // Normalized ID
                chapterId: normalizeId(chapterName), // Normalized ID
                sourceUploadId: uploadId, 
                status: 'approved', 
                creatorId: adminId, // Assign current admin as creator
                createdAt: FieldValue.serverTimestamp(),
                topicName: topicName, // Explicitly save for frontend display
                chapterName: chapterName, // Explicitly save for frontend display
            });
        });
    }
    
    // Update total counts for Topics collection AFTER all content is processed.
    // This part of the calculation needs to be more robust for batch processing,
    // potentially triggering a separate function or handled by frontend.
    // For a batch approval, we simply commit the content and let frontend recalculate.

    batch.update(db.collection("userUploads").doc(uploadId), { status: 'completed', updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return { success: true, message: "Content saved!" };
});


export const resetContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>): Promise<{ success: boolean; message: string }> => {
    if (!request.auth?.token.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId } = request.data;
    const batch = db.batch();
    const mcqQuery = db.collection("MasterMCQ").where("sourceUploadId", "==", uploadId);
    const flashcardQuery = db.collection("Flashcards").where("sourceUploadId", "==", uploadId);
    const [mcqSnapshot, flashcardSnapshot] = await Promise.all([mcqQuery.get(), flashcardQuery.get()]);
    mcqSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => batch.delete(doc.ref));
    flashcardSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => batch.delete(doc.ref));
    const uploadRef = db.collection("userUploads").doc(uploadId);
    await uploadRef.update({ status: 'batch_ready', completedBatches: 0, generatedContent: [], finalAwaitingReviewData: FieldValue.delete(), assignmentSuggestions: FieldValue.delete(), });
    await batch.commit();
    return { success: true, message: `Reset ${mcqSnapshot.size} MCQs and ${flashcardSnapshot.size} Flashcards.` };
});

export const reassignContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>): Promise<{ success: boolean; message: string }> => {
    if (!request.auth?.token.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId } = request.data;
    const mcqQuery = db.collection("MasterMCQ").where("sourceUploadId", "==", uploadId);
    const flashcardQuery = db.collection("Flashcards").where("sourceUploadId", "==", uploadId);
    const [mcqSnapshot, flashcardSnapshot] = await Promise.all([mcqQuery.get(), flashcardQuery.get()]);
    const mcqs = mcqSnapshot.docs.map((doc: QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() } as MCQ));
    const flashcards = flashcardSnapshot.docs.map((doc: QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() } as Flashcard));
    if (mcqs.length === 0 && flashcards.length === 0) { throw new HttpsError("not-found", "No content found for this upload to reassign."); }
    const awaitingReviewData: AwaitingReviewData = { mcqs: mcqs, flashcards: flashcards, };
    const uploadRef = db.collection("userUploads").doc(uploadId);
    await uploadRef.update({ status: 'pending_final_review', finalAwaitingReviewData: awaitingReviewData });
    const deleteBatch = db.batch();
    mcqSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    flashcardSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();
    return { success: true, message: "Content is ready for reassignment." };
});

export const prepareForRegeneration = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>): Promise<{ success: boolean; message: string }> => {
    if (!request.auth?.token.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId } = request.data;
    const mcqQuery = db.collection("MasterMCQ").where("sourceUploadId", "==", uploadId);
    const mcqSnapshot = await mcqQuery.get();
    const existingQuestions = mcqSnapshot.docs.map((doc: QueryDocumentSnapshot) => doc.data().question as string);
    const uploadRef = db.collection("userUploads").doc(uploadId);
    await uploadRef.update({ status: 'batch_ready', completedBatches: 0, generatedContent: [], finalAwaitingReviewData: FieldValue.delete(), assignmentSuggestions: FieldValue.delete(), existingQuestionSnippets: existingQuestions, });
    return { success: true, message: "Ready for regeneration." };
});

// NEW FUNCTIONS (from your new buggy code, but not present in the initial 'old working code' list):

// Generates and stages marrow MCQs (Likely used by the 'Smart Marrow' pipeline)
export const generateAndStageMarrowMcqs = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, count: number }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId, count } = request.data;
    const uploadRef = db.collection("userUploads").doc(uploadId);
    const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists) throw new HttpsError("not-found", "Upload document not found.");
    const stagedContent = uploadDoc.data()?.stagedContent || {};
    const orphanExplanations = stagedContent.orphanExplanations || [];
    
    let generatedMcqs: Partial<MCQ>[] = [];
    let generatedFlashcards: Partial<Flashcard>[] = []; // Assume Smart Marrow can also generate flashcards

    if (orphanExplanations.length > 0 && count > 0) {
        const generationPrompt = `You are a medical author. From the provided 'orphanExplanations', generate exactly ${count} new high-yield MCQs and an equal number of high-yield Flashcards. Each MCQ should include: "question", 4 "options" (A, B, C, D), a single letter "answer" (A, B, C, or D), and an "explanation". Each Flashcard should include "front" and "back". Respond with ONLY a valid JSON object with keys "generatedMcqs" and "generatedFlashcards".
        orphanExplanations: """${JSON.stringify(orphanExplanations)}"""`;
        try {
            const result = await _quickModel.generateContent({ contents: [{ role: "user", parts: [{ text: generationPrompt }] }] });
            const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
            if (!responseText) throw new HttpsError("internal", "AI failed to respond for content generation.");
            const parsedContent = extractJson(responseText);
            generatedMcqs = parsedContent.generatedMcqs || [];
            generatedFlashcards = parsedContent.generatedFlashcards || [];
        } catch (e: unknown) {
            const err = e instanceof Error ? e : new Error(String(e));
            logger.error(`Smart Marrow content generation failed for upload ${uploadId}: ${err.message}`, err);
            throw new HttpsError("internal", `Smart Marrow content generation failed: ${err.message}`);
        }
    }

    // Update stagedContent with newly generated MCQs and Flashcards
    await uploadRef.update({
        "stagedContent.generatedMcqs": generatedMcqs,
        "stagedContent.generatedFlashcards": generatedFlashcards,
        status: "pending_assignment", // Move to assignment stage after generation
        updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`Smart Marrow content generated for upload ${uploadId}. New MCQs: ${generatedMcqs.length}, New Flashcards: ${generatedFlashcards.length}`);
    return { success: true, message: "Smart Marrow generation complete!" };
});


// Generates chapter summary notes from upload text
export const generateChapterSummary = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadIds: string[] }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadIds } = request.data;
    
    if (!uploadIds || uploadIds.length === 0) {
        throw new HttpsError("invalid-argument", "Upload IDs are required to generate a summary.");
    }

    let combinedText = '';
    for (const uploadId of uploadIds) {
        const uploadDoc = await db.collection("userUploads").doc(uploadId).get();
        if (uploadDoc.exists && uploadDoc.data()?.extractedText) {
            combinedText += uploadDoc.data()?.extractedText + "\n\n";
        }
    }

    if (!combinedText.trim()) {
        throw new HttpsError("failed-precondition", "No extracted text found for summary generation from provided uploads.");
    }
    
    const prompt = `As a medical education expert, provide a concise, high-yield summary of the following pediatric medical text. Focus on key facts, definitions, clinical pearls, and exam-relevant information. The summary should be readable and formatted using Markdown. Text: """${combinedText.substring(0, 30000)}"""`; // Limit text for AI
    try {
        const result = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const summaryText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!summaryText) throw new HttpsError("internal", "AI failed to generate summary.");
        return { summary: summaryText };
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        logger.error(`Chapter summary generation failed: ${err.message}`, err);
        throw new HttpsError("internal", `Chapter summary generation failed: ${err.message}`);
    }
});


// Generates general content (MCQs and Flashcards) for the General pipeline, similar to startAutomatedBatchGeneration, but directly callable for a single batch or purpose.
export const generateGeneralContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, count: number }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId, count } = request.data;
    const uploadRef = db.collection("userUploads").doc(uploadId);
    const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists) throw new HttpsError("not-found", "Upload document not found.");
    const extractedText = uploadDoc.data()?.extractedText || "";
    if (!extractedText) throw new HttpsError("failed-precondition", "No extracted text found for general content generation.");

    const mcqCount = Math.floor(count / 2); // Example split
    const flashcardCount = count - mcqCount;

    const prompt = `You are a medical education expert specialized in Pediatrics. Based on the following text, generate ${mcqCount} high-yield MCQs and ${flashcardCount} high-yield flashcards.
    Each MCQ should include: "question", 4 "options" (A, B, C, D), a single letter "answer" (A, B, C, or D), and an "explanation".
    Each Flashcard should include "front" and "back".
    Return the output as a single, well-formed JSON object with this exact structure: {"mcqs": [{"question": "string", "options": ["string", "string", "string", "string"], "answer": "string"}], "flashcards": [{"front": "string", "back": "string"}]}.
    Text to process: """${extractedText.substring(0, 30000)}"""`; // Limit text for AI

    try {
        const result = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) throw new HttpsError("internal", "AI failed to generate general content.");
        
        const generatedContent = extractJson(responseText);
        const generatedMcqs = generatedContent.mcqs || [];
        const generatedFlashcards = generatedContent.flashcards || [];

        await uploadRef.update({
            "stagedContent.generatedMcqs": generatedMcqs,
            "stagedContent.generatedFlashcards": generatedFlashcards,
            status: "pending_final_review", // Move to final review
            updatedAt: FieldValue.serverTimestamp(),
        });
        logger.info(`General content generated for upload ${uploadId}. MCQs: ${generatedMcqs.length}, Flashcards: ${generatedFlashcards.length}`);
        return { success: true };

    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        logger.error(`General content generation failed for upload ${uploadId}: ${err.message}`, err);
        throw new HttpsError("internal", `General content generation failed: ${err.message}`);
    }
});


// Gets a daily warmup quiz (MCQ IDs)
export const getDailyWarmupQuiz = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    // This function will need to select MCQs based on user's past performance/random selection.
    // For now, a placeholder logic: return 10 random approved MCQs
    const masterMcqSnapshot = await db.collection('MasterMCQ').where('status', '==', 'approved').limit(100).get();
    const marrowMcqSnapshot = await db.collection('MarrowMCQ').where('status', '==', 'approved').limit(100).get();
    
    const allApprovedMcqIds = [
        ...masterMcqSnapshot.docs.map(doc => doc.id),
        ...marrowMcqSnapshot.docs.map(doc => doc.id)
    ].sort(() => 0.5 - Math.random()).slice(0, 10); // Get 10 random IDs

    logger.info(`Generated daily warmup quiz for user ${request.auth.uid} with ${allApprovedMcqIds.length} MCQs.`);
    return { mcqIds: allApprovedMcqIds };
});

// Provides AI feedback on a completed quiz session
export const getQuizSessionFeedback = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ quizResultId: string }>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized(); const { quizResultId } = request.data;

    const quizResultDoc = await db.collection('quizResults').doc(quizResultId).get();
    if (!quizResultDoc.exists) throw new HttpsError("not-found", "Quiz result not found.");
    const quizData = quizResultDoc.data() as QuizResult;

    if (quizData.userId !== request.auth.uid && !request.auth.token.isAdmin) {
        throw new HttpsError("permission-denied", "Unauthorized access to quiz result.");
    }

    // Fetch related MCQs to get questions and explanations
    const mcqIds = quizData.results.map(r => r.mcqId);
    const mcqPromises = [];
    const chunkSize = 10;
    for (let i = 0; i < mcqIds.length; i += chunkSize) {
        const chunk = mcqIds.slice(i, i + chunkSize);
        mcqPromises.push(db.collection('MasterMCQ').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get());
        mcqPromises.push(db.collection('MarrowMCQ').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get());
    }
    const snapshots = await Promise.all(mcqPromises);
    const mcqMap = new Map<string, MCQ>();
    snapshots.forEach(snapshot => snapshot.docs.forEach(doc => mcqMap.set(doc.id, doc.data() as MCQ)));

    const detailedResults = quizData.results.map(r => {
        const mcq = mcqMap.get(r.mcqId);
        return {
            question: mcq?.question || "N/A",
            selectedAnswer: r.selectedAnswer,
            correctAnswer: r.correctAnswer,
            isCorrect: r.isCorrect,
            explanation: mcq?.explanation || "No explanation provided.",
        };
    });

    const prompt = `You are an AI medical tutor. Analyze the following quiz session results and provide personalized feedback. Highlight areas of strength and specific topics/questions that indicate a need for review. Suggest concrete study actions. Focus on medical relevance and actionable advice. Respond in markdown.
Quiz Score: ${quizData.score}/${quizData.totalQuestions}
Detailed Results:
${JSON.stringify(detailedResults, null, 2)}
`;
    try {
        const result = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const feedbackText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!feedbackText) throw new HttpsError("internal", "AI failed to generate feedback.");
        return { feedback: feedbackText };
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        logger.error(`Quiz session feedback generation failed: ${err.message}`, err);
        throw new HttpsError("internal", `Quiz session feedback generation failed: ${err.message}`);
    }
});


// Expands search query into related terms
export const getExpandedSearchTerms = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ query: string }>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized(); const { query } = request.data;
    if (!query || query.trim().length < 3) throw new HttpsError("invalid-argument", "Search query must be at least 3 characters.");

    const prompt = `You are a medical knowledge expert. A user has searched for "${query}". Provide 3-5 related search terms (synonyms, closely related concepts, common differential diagnoses) that would broaden their search results for medical questions. Return ONLY a valid JSON array of strings. Example: ["related term 1", "related term 2"].`;
    try {
        const result = await _quickModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const termsText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        const terms = termsText ? extractJson(termsText) : [];
        if (!Array.isArray(terms)) {
            logger.warn(`AI returned non-array for search terms: ${termsText}`);
            return { terms: [query] }; // Fallback to just original query
        }
        return { terms: Array.from(new Set([query.toLowerCase(), ...terms.map((t: string) => t.toLowerCase())])) };
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        logger.error(`Search term expansion failed: ${err.message}`, err);
        // Fallback to returning just the original query on error
        return { terms: [query] };
    }
});


// Processes marrow text (similar to processManualTextInput, but specifically for marrow and potentially more advanced)
export const processMarrowText = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ rawText: string, fileName: string }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized();
    const { rawText, fileName } = request.data;
    const userId = request.auth.uid;
    
    // Simulate initial processing to set up the userUpload document
    const userUploadRef = db.collection("userUploads").doc();
    const finalFileName = `MARROW_TEXT_SMART_${Date.now()}_${fileName}`;
    
    // This is essentially Stage 1 of the "Smart Marrow" pipeline, setting status for AI generation decision
    const newUpload: Partial<UserUpload> = {
        id: userUploadRef.id, userId, fileName: finalFileName, createdAt: FieldValue.serverTimestamp(),
        extractedText: rawText, status: "pending_marrow_generation_approval", // Specific status for smart marrow generation approval
        stagedContent: { orphanExplanations: [rawText], extractedMcqs: [], generatedMcqs: [] }, // Initially just raw text as orphan
        suggestedNewMcqCount: Math.ceil(rawText.length / 500) || 10, // Suggest some initial number
    };

    await userUploadRef.set(newUpload, { merge: true });
    logger.info(`New smart marrow text upload created: ${userUploadRef.id} (File: ${finalFileName}).`);

    return { success: true, uploadId: userUploadRef.id, extractedMcqs: [], suggestedNewMcqCount: newUpload.suggestedNewMcqCount || 0 };
});


// Updates chapter notes (now includes source to distinguish topic collections)
export const updateChapterNotes = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ topicId: string, chapterId: string, newSummary: string, source: 'General' | 'Marrow' }>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { topicId, chapterId, newSummary, source } = request.data;

    const collectionName = source === 'Marrow' ? 'MarrowTopics' : 'Topics';
    const topicRef = db.collection(collectionName).doc(topicId);
    const topicDoc = await topicRef.get();

    if (!topicDoc.exists) throw new HttpsError("not-found", `Topic '${topicId}' not found in '${collectionName}' collection.`);
    
    let chapters = (topicDoc.data()?.chapters || []) as Chapter[];
    let chapterToUpdate: Chapter | undefined;

    // Handle both string[] and object[] chapter arrays
    if (source === 'General') {
        // General topics store chapters as an array of strings
        // Find the chapter index by its *name*, as that's what's stored in the array
        const chapterName = chapters.find((c: Chapter) => c.id === chapterId)?.name;
        if (!chapterName) throw new HttpsError("not-found", `Chapter '${chapterId}' not found in General topic '${topicId}'.`);
        
        // This is a simplified update: we're only setting `summaryNotes` on the *chapter object* that matches the ID.
        // For general topics, chapter data is stored as a simple string.
        // To add summaryNotes to General topics, the chapter structure in Firestore needs to change from string to object.
        // Given current frontend data mapping, we must update the specific chapter object if it exists.
        // This is a more complex change if summaryNotes need to be saved directly on the chapter within the topic array.
        // For now, if General chapters are still just strings, this would require a re-design.
        // Assuming 'summaryNotes' is only truly supported for Marrow chapters structured as objects.
        // If General topics need summary notes, the schema for chapters in the 'Topics' collection must be changed from string[] to Chapter[].
        logger.warn(`Attempted to update summaryNotes for General topic '${topicId}' chapter '${chapterId}'. This feature is currently fully supported only for MarrowTopics with object-based chapters.`);
        // For now, for 'General' source, we will NOT update chapter notes via this function,
        // as chapter objects are not directly mutable in array of strings.
        // If this is a required feature, 'Topics' collection chapter field needs to become array of Chapter objects.
        throw new HttpsError("failed-precondition", "Summary notes editing is currently supported only for Marrow chapters.");

    } else if (source === 'Marrow') {
        // Marrow topics store chapters as objects
        const chapterIndex = chapters.findIndex((c: Chapter) => c.id === chapterId);
        if (chapterIndex === -1) throw new HttpsError("not-found", `Chapter '${chapterId}' not found in Marrow topic '${topicId}'.`);
        
        chapterToUpdate = { ...chapters[chapterIndex], summaryNotes: newSummary };
        chapters[chapterIndex] = chapterToUpdate; // Update the object in the array
        await topicRef.update({ chapters, updatedAt: FieldValue.serverTimestamp() });
        logger.info(`Chapter notes updated for Marrow topic '${topicId}', chapter '${chapterId}'.`);
        return { success: true, message: "Chapter notes updated." };
    }
    throw new HttpsError("invalid-argument", "Invalid source specified.");
});

// =============================================================================
//
//   UNIVERSAL USER & AI FUNCTIONS
//
// =============================================================================
export const updateChapterNotes = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureClientsInitialized();
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { topicId, chapterId, newSummary, source } = request.data as { topicId: string, chapterId: string, newSummary: string, source: 'General' | 'Marrow' }; // Added source for proper routing

    const collectionName = source === 'Marrow' ? 'MarrowTopics' : 'Topics';
    const topicRef = db.collection(collectionName).doc(topicId);
    const topicDoc = await topicRef.get();

    if (!topicDoc.exists) throw new HttpsError("not-found", "Topic not found.");
    
    let chapters = (topicDoc.data()?.chapters || []) as Chapter[];
    const chapterIndex = chapters.findIndex(ch => ch.id === chapterId);

    if (chapterIndex === -1) throw new HttpsError("not-found", "Chapter not found in specified topic.");

    // Update the chapter object in the array
    // This assumes chapters are stored as objects in both collections
    // If 'Topics' collection still stores chapters as strings, this logic needs adaptation or a schema migration.
    // Given frontend's new AppData structure expecting objects for chapters, it's safer to assume objects here.
    chapters[chapterIndex] = { ...chapters[chapterIndex], summaryNotes: newSummary };

    await topicRef.update({ chapters, updatedAt: FieldValue.serverTimestamp() });
    return { success: true, message: "Chapter notes updated." };
});

// NOTE: The addquizresult, addattempt, togglebookmark, deletecontentitem, resetUpload, archiveUpload, chatWithAssistant,
// generatePerformanceAdvice, generateWeaknessBasedTest functions already exist in the user's provided 'new buggy code' file.
// Their definitions here are for completeness and minimal correction to ensure basic functionality based on previous analysis.

// EXISTING (from new buggy code) - Review for any necessary corrections for compilation or data integrity
export const addquizresult = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<Omit<QuizResult, "id" | "userId" | "date">>) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    const userId = request.auth.uid;
    const quizData = validateInput(schemas.QuizResultSchema, request.data);
    const resultRef = db.collection("quizResults").doc();
    await resultRef.set({ ...quizData, id: resultRef.id, userId, date: FieldValue.serverTimestamp() });
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.data() as DocumentData | undefined;
    if (userData) {
        const lastStudiedDate = (userData.lastStudiedDate as Timestamp)?.toDate();
        const today = new Date(); today.setHours(0, 0, 0, 0); const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        let newStreak = userData.currentStreak || 0;
        if (lastStudiedDate) {
            const lastStudyDay = lastStudiedDate; lastStudyDay.setHours(0, 0, 0, 0);
            if (lastStudyDay.getTime() === today.getTime()) { /* no change */ }
            else if (lastStudyDay.getTime() === yesterday.getTime()) { newStreak++; }
            else { newStreak = 1; }
        } else { newStreak = 1; }
        await userRef.update({ currentStreak: newStreak, lastStudiedDate: FieldValue.serverTimestamp() });
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
        const userRef = db.collection("users").doc(userId);
        const userDoc = await transaction.get(userRef);
        const userData = userDoc.data() as DocumentData | undefined;
        if (userData) {
            const lastStudiedDate = (userData.lastStudiedDate as Timestamp)?.toDate();
            const today = new Date(); today.setHours(0, 0, 0, 0); const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
            let newStreak = userData.currentStreak || 0;
            if (lastStudiedDate) {
                const lastStudyDay = lastStudiedDate; lastStudyDay.setHours(0, 0, 0, 0);
                if (lastStudyDay.getTime() === today.getTime()) { /* no change */ }
                else if (lastStudyDay.getTime() === yesterday.getTime()) { newStreak++; }
                else { newStreak = 1; }
            } else { newStreak = 1; }
            transaction.update(userRef, { currentStreak: newStreak, lastStudiedDate: FieldValue.serverTimestamp() });
            logger.debug(`User ${userId} attempted MCQ. Streak: ${newStreak}`);
        }
        logger.debug(`Attempt recorded for user ${userId}, MCQ ${mcqId}. Correct: ${isCorrect}. Next Review: ${nextReviewDateJS.toISOString().split("T")[0]}`);
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

export const deletecontentitem = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<DeleteContentItemCallableData>) => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { id, type, collectionName } = validateInput(schemas.DeleteContentSchema, request.data); // Use validateInput
    const allowedCollections: DeleteContentItemCallableData['collectionName'][] = ["MasterMCQ", "MarrowMCQ", "Flashcards"];
    if (!allowedCollections.includes(collectionName)) throw new HttpsError("invalid-argument", "Invalid collection name provided.");
    await db.collection(collectionName).doc(id).delete();
    return { success: true, message: `${type.toUpperCase()} deleted.` };
});

export const resetUpload = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>): Promise<{ success: boolean; message: string }> => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    ensureClientsInitialized(); const { uploadId } = request.data;
    const uploadRef = db.collection('userUploads').doc(uploadId);
    const uploadDocSnap = await uploadRef.get();
    if (!uploadDocSnap.exists) throw new HttpsError("not-found", `UserUpload document with ID ${uploadId} not found.`);
    const fileName = uploadDocSnap.data()?.fileName || '';
    const isMarrowUpload = fileName.startsWith("MARROW_");
    const deleteBatch = db.batch();
    const collectionToDeleteFrom = isMarrowUpload ? "MarrowMCQ" : "MasterMCQ";
    const mcqsToDelete = await db.collection(collectionToDeleteFrom).where("uploadId", "==", uploadId).get();
    mcqsToDelete.docs.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    // Also delete flashcards related to this upload if they exist in the stagedContent
    const flashcardsToDelete = await db.collection("Flashcards").where("uploadId", "==", uploadId).get();
    flashcardsToDelete.docs.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));

    await deleteBatch.commit();
    await uploadRef.update({
        status: 'processed', updatedAt: FieldValue.serverTimestamp(),
        error: FieldValue.delete(), stagedContent: FieldValue.delete(), suggestedKeyTopics: FieldValue.delete(),
        // Reset properties specific to general pipeline that might have been set
        title: FieldValue.delete(), sourceReference: FieldValue.delete(),
        suggestedTopic: FieldValue.delete(), suggestedChapter: FieldValue.delete(),
        estimatedMcqCount: FieldValue.delete(), estimatedFlashcardCount: FieldValue.delete(),
        totalMcqCount: FieldValue.delete(), totalFlashcardCount: FieldValue.delete(),
        batchSize: FieldValue.delete(), totalBatches: FieldValue.delete(),
        completedBatches: FieldValue.delete(), textChunks: FieldValue.delete(),
        generatedContent: FieldValue.delete(), finalAwaitingReviewData: FieldValue.delete(),
        assignmentSuggestions: FieldValue.delete(), existingQuestionSnippets: FieldValue.delete(),
    });
    return { success: true, message: `Content for ${fileName} reset successfully.` };
});

export const archiveUpload = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>): Promise<{ success: boolean; message: string }> => {
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
    const uploadRef = db.collection('userUploads').doc(uploadId);
    await uploadRef.update({ status: 'archived', updatedAt: FieldValue.serverTimestamp() });
    return { success: true, message: `Upload ${uploadId} archived.` };
});

export const chatWithAssistant = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ prompt: string; history: ChatMessage[] }>): Promise<{ response: string; generatedQuiz?: MCQ[] }> => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required to chat with the assistant.");
    ensureClientsInitialized(); const { prompt, history } = request.data;
    const systemInstruction = `You are PediaBot, a friendly and expert AI study assistant for a postgraduate medical student. Help them understand complex topics, clarify concepts, and answer questions. Format responses with markdown.`;
    const chatHistoryForAI: Content[] = history.map((message: ChatMessage) => ({ role: message.sender, parts: [{ text: message.text }] }));
    const chat = _powerfulModel.startChat({ history: chatHistoryForAI });
    try {
        const result = await chat.sendMessage(prompt);
        const modelResponse = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";
        return { response: modelResponse };
    } catch (error: unknown) {
        throw new HttpsError("internal", `AI chat failed: ${(error as Error).message}`);
    }
});

export const generatePerformanceAdvice = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ overallAccuracy: number, strongTopics: string[], weakTopics: string[]}>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    ensureClientsInitialized(); const { overallAccuracy, strongTopics, weakTopics } = request.data;
    const prompt = `You are an AI academic advisor for a postgraduate medical student. Analyze the following performance data and provide actionable, professional advice: Overall Accuracy: ${overallAccuracy.toFixed(1)}%. Strongest Topics: ${strongTopics.join(", ")}. Weakest Topics: ${weakTopics.join(", ")}. Your advice should: 1. Congratulate them on strengths. 2. Identify weak areas gently. 3. Provide a brief, actionable study plan. Suggest specific strategies for tackling the weak topics (e.g., "Focus on flashcards for definitions in [Weak Topic 1]"). 4. End on a motivating note. Format your response using basic markdown.`;
    try {
        const result = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        return { advice: responseText || "Could not generate advice." };
    } catch (e: unknown) {
        throw new HttpsError("internal", `Performance advice generation failed: ${(e as Error).message}`);
    }
});

export const generateWeaknessBasedTest = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ attempted: AttemptedMCQs, allMcqs: Pick<MCQ, 'id' | 'topicId' | 'chapterId' | 'source' | 'tags'>[], testSize: number }>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized(); const { attempted, allMcqs, testSize } = request.data; 
    const prompt = `From the user's attempt history, select ${testSize} MCQs from the provided list that best target their weaknesses. Prioritize questions answered incorrectly multiple times, and those they got wrong after previously getting right. Include a few questions from their weakest topics. Return ONLY a valid JSON array of the selected MCQ IDs. Example: ["id1", "id2", "id3"]. DATA: """${JSON.stringify({ allMcqs, attempted })}"""`;
    try {
        const result = await _quickModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) {
            throw new HttpsError("internal", "AI model returned an empty response for weakness test generation.");
        }
        const mcqIds = extractJson(responseText);
        return { mcqIds };
    } catch (e: unknown) {
        throw new HttpsError("internal", `Failed to generate weakness test: ${(e as Error).message}`);
    }
});