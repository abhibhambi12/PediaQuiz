/* eslint-disable max-len */
// functions/src/index.ts

// --- Firebase Admin SDK Imports ---
import * as admin from "firebase-admin";
import { UserRecord } from "firebase-admin/auth";
import { FieldValue, Transaction, QueryDocumentSnapshot } from "firebase-admin/firestore";

// --- Firebase Functions V2 Imports ---
import { onCall, CallableRequest, HttpsError, CallableOptions } from "firebase-functions/v2/https";
import { onObjectFinalized, StorageEvent } from "firebase-functions/v2/storage";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { onUserCreated, UserRecord as V2UserRecord } from "firebase-functions/v2/auth";

// --- Node.js Built-in Modules ---
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// --- Google Cloud SDKs for AI and Vision ---
import { ImageAnnotatorClient, protos } from "@google-cloud/vision";
import { VertexAI, GenerativeModel, Content } from "@google-cloud/vertexai";

// --- Shared Types from Monorepo ---
import {
  MCQ, ChatMessage, UserUpload, QuizResult, Chapter, type UploadStatus, AttemptedMCQs,
  ToggleBookmarkCallableData, DeleteContentItemCallableData, AssignmentSuggestion,
  AwaitingReviewData, Topic as PediaQuizTopicType, Flashcard
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
const FIRESTORE_COMMON_RUNTIME_OPTIONS = { region: LOCATION, memory: '128MiB' as const, cpu: 'gcf_gen1' as const };

function extractJson(rawText: string): any {
    const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
        try { return JSON.parse(jsonMatch[1]); }
        catch (e: unknown) {
            logger.error("Failed to parse extracted JSON from markdown block.", { jsonString: jsonMatch[1], error: (e as Error).message });
            throw new HttpsError("internal", "Invalid JSON from AI model (in markdown block).");
        }
    }
    try { return JSON.parse(rawText); }
    catch (e: unknown) {
        logger.error("Failed to parse raw text as JSON.", { rawText, error: (e as Error).message });
        throw new HttpsError("internal", "Invalid JSON from AI model (raw text).");
    }
}

const normalizeId = (name: string): string => {
  if (typeof name !== 'string') { return 'unknown'; }
  return name.replace(/\s+/g, '_').toLowerCase();
};

// =============================================================================
//
//   AUTH & STORAGE TRIGGERS (Universal)
//
// =============================================================================

export const onUserCreate = onUserCreated({ region: LOCATION }, async (event: { data: V2UserRecord }) => {
    const user = event.data;
    logger.info(`v2 Auth Trigger: New user created: ${user.uid}`, { email: user.email });
    const userRef = db.collection("users").doc(user.uid);
    try {
        await userRef.set({
            uid: user.uid, email: user.email, displayName: user.displayName || "PediaQuiz User",
            createdAt: FieldValue.serverTimestamp(), lastLogin: FieldValue.serverTimestamp(),
            isAdmin: false, bookmarks: [],
        });
        logger.log(`Firestore: User document created for ${user.uid}`);
    } catch (error: any) {
        logger.error(`Error creating user document for ${user.uid}:`, error);
    }
});

export const onFileUploaded = onObjectFinalized({
    cpu: 2, memory: "1GiB", timeoutSeconds: 300,
    bucket: "pediaquizapp.firebasestorage.app",
}, async (event: StorageEvent) => {
    ensureClientsInitialized();
    const { bucket, name, contentType } = event.data || {};
    if (!bucket || !name || !contentType) {
        logger.warn("Storage trigger event is missing critical data.", { event });
        return;
    }
    if (!name.startsWith("uploads/") || name.endsWith('/')) {
        logger.log(`Ignoring file ${name} as it does not match the upload path.`);
        return;
    }
    const pathParts = name.split("/");
    if (pathParts.length < 3) {
        logger.log(`Ignoring file ${name} due to incorrect path structure.`);
        return;
    }
    const userId = pathParts[1];
    const fileName = path.basename(name);
    const userUploadRef = db.collection("userUploads").doc();
    const newUpload: Partial<UserUpload> = { id: userUploadRef.id, userId, fileName, createdAt: new Date() };

    try {
        await userUploadRef.set({ ...newUpload, status: "pending_ocr" });
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
            let combinedFullText = "";
            for (const file of files) {
                const [contents] = await file.download();
                const output = JSON.parse(contents.toString());
                (output.responses || []).forEach((pageResponse: protos.google.cloud.vision.v1.IAnnotateImageResponse) => {
                    if (pageResponse.fullTextAnnotation?.text) combinedFullText += pageResponse.fullTextAnnotation.text + "\n\n";
                });
            }
            
            await storage.bucket(bucket).deleteFiles({ prefix: outputPrefix });
            if (!combinedFullText.trim()) throw new Error("OCR extracted no readable text.");
            await userUploadRef.update({ extractedText: combinedFullText.trim(), status: "processed", updatedAt: FieldValue.serverTimestamp() });

        } else if (contentType === "text/plain") {
            const tempFilePath = path.join(os.tmpdir(), fileName);
            await storage.bucket(bucket).file(name).download({ destination: tempFilePath });
            const extractedText = fs.readFileSync(tempFilePath, "utf8");
            fs.unlinkSync(tempFilePath);
            if (!extractedText.trim()) throw new Error("The uploaded text file is empty.");
            await userUploadRef.update({ extractedText, status: 'processed', updatedAt: FieldValue.serverTimestamp() });
        } else {
            await userUploadRef.update({ status: "failed_unsupported_type", error: `Unsupported file type: ${contentType}.`, updatedAt: FieldValue.serverTimestamp() });
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await userUploadRef.update({ status: "error", error: `Processing failed: ${errorMessage}` }).catch(() => {});
    }
  }
);
// --- PASTE THE REST OF YOUR FUNCTIONS HERE (from createUploadFromText to the end) ---
// I am omitting them for brevity, but you should paste the rest of your file's functions below this line.
// =============================================================================
//
//   MARROW PIPELINE FUNCTIONS (Simple 3-Stage)
//
// =============================================================================
export const createUploadFromText = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ fileName: string, rawText: string, isMarrow: boolean }>) => {
    ensureClientsInitialized();
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
    ensureClientsInitialized();
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
    const uploadRef = db.collection("userUploads").doc(uploadId);
    const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists) throw new HttpsError("not-found", "Upload document not found.");
    const { extractedText } = uploadDoc.data() as UserUpload;
    if (!extractedText) throw new HttpsError("failed-precondition", "No extracted text found.");
    const textSnippet = extractedText.substring(0, 30000);

    const prompt = `You are an expert medical data processor. Analyze the provided OCR text and categorize its content into 'mcq' and 'orphan_explanation'. Respond with ONLY a valid JSON object with keys "mcqs" and "orphanExplanations". "mcqs" should be an array of objects: { "question": string, "options": string[], "answer": string, "explanation": string }. "orphanExplanations" should be an array of strings. If a category is empty, return an empty array. If there is no clear distinction, treat the entire text as a single orphan explanation. TEXT TO ANALYZE: """${textSnippet}"""`;
    const result = await _quickModel.generateContent(prompt);
    const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
    if (!responseText) throw new HttpsError("internal", "AI failed to respond for extraction.");

    try {
      const parsedData = extractJson(responseText);
      const keyTopicsPrompt = `Analyze the following medical text and identify 5-10 key clinical topics (tags). Provide them as a JSON array of strings. Example: ["Topic 1", "Topic 2"]. Text: """${textSnippet}"""`;
      let suggestedKeyTopics: string[] = [];
      try {
          const keyTopicsResult = await _powerfulModel.generateContent(keyTopicsPrompt);
          const keyTopicsText = keyTopicsResult.response.candidates?.[0]?.content?.parts?.[0]?.text;
          if (keyTopicsText) suggestedKeyTopics = extractJson(keyTopicsText);
      } catch (e: unknown) {
          logger.warn(`Failed to suggest key topics: ${(e as Error).message}`);
      }
      await uploadRef.update({
        "stagedContent.extractedMcqs": parsedData.mcqs || [],
        "stagedContent.orphanExplanations": parsedData.orphanExplanations || [],
        suggestedKeyTopics, status: "pending_generation_decision", updatedAt: FieldValue.serverTimestamp(),
      });
      return { mcqCount: (parsedData.mcqs || []).length, explanationCount: (parsedData.orphanExplanations || []).length };
    } catch (e: unknown) {
      throw new HttpsError("internal", `Failed to parse AI response: ${(e as Error).message}`);
    }
});

export const generateAndAnalyzeMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string, count: number }>) => {
    ensureClientsInitialized();
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId, count } = request.data;
    const uploadRef = db.collection("userUploads").doc(uploadId);
    const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists) throw new HttpsError("not-found", "Upload document not found.");
    const stagedContent = uploadDoc.data()?.stagedContent || {};
    const orphanExplanations = stagedContent.orphanExplanations || [];
    let generatedMcqs: Partial<MCQ>[] = [];
    let suggestedKeyTopics: string[] = stagedContent.suggestedKeyTopics || [];
    if (orphanExplanations.length > 0 && count > 0) {
        const generationPrompt = `You are a medical author. From the provided 'orphanExplanations', generate exactly ${count} new MCQs...`;
        const result = await _powerfulModel.generateContent(generationPrompt);
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) throw new HttpsError("internal", "AI failed to respond for MCQ generation.");
        try {
            generatedMcqs = (extractJson(responseText)).generatedMcqs || [];
        } catch (e: unknown) {
            throw new HttpsError("internal", `Failed to parse AI response for MCQ generation: ${(e as Error).message}`);
        }
    }
    const allContentForTopicAnalysis = [...(stagedContent.extractedMcqs || []), ...generatedMcqs];
    if (allContentForTopicAnalysis.length > 0) {
        const keyTopicsPrompt = `Analyze the following medical text (from MCQs) and identify 5-10 key clinical topics (tags)...`;
        try {
            const keyTopicsResult = await _powerfulModel.generateContent(keyTopicsPrompt);
            const keyTopicsText = keyTopicsResult.response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (keyTopicsText) {
                const newSuggestedKeyTopics = extractJson(keyTopicsText);
                if (Array.isArray(newSuggestedKeyTopics)) suggestedKeyTopics = Array.from(new Set([...suggestedKeyTopics, ...newSuggestedKeyTopics]));
            }
        } catch (e: unknown) {
            logger.warn(`Failed to re-suggest key topics: ${(e as Error).message}`);
        }
    }
    await uploadRef.update({
        "stagedContent.generatedMcqs": generatedMcqs,
        suggestedKeyTopics, status: "pending_assignment", updatedAt: FieldValue.serverTimestamp(),
    });
    return { success: true, message: "Generation and topic analysis complete!" };
});

export const approveMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    ensureClientsInitialized();
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId, topicId, topicName, chapterId, chapterName, keyTopics } = request.data as { uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] };
    const adminId = request.auth.uid;
    const uploadRef = db.collection("userUploads").doc(uploadId);
    const topicRef = db.collection('MarrowTopics').doc(topicId);
    return db.runTransaction(async (transaction: Transaction) => {
        const uploadDoc = await transaction.get(uploadRef);
        if (!uploadDoc.exists) throw new HttpsError("not-found", "Upload document not found.");
        const stagedContent = uploadDoc.data()?.stagedContent || {};
        const allMcqsToApprove = [...(stagedContent.extractedMcqs || []), ...(stagedContent.generatedMcqs || [])];
        if (allMcqsToApprove.length === 0) throw new HttpsError("failed-precondition", "No content to approve.");
        const topicDoc = await transaction.get(topicRef);
        let chapters = (topicDoc.data()?.chapters || []) as Chapter[];
        const chapterIndex = chapters.findIndex(c => c.id === chapterId);
        if (chapterIndex > -1) {
            chapters[chapterIndex].sourceUploadIds = Array.from(new Set([...(chapters[chapterIndex].sourceUploadIds || []), uploadId]));
            chapters[chapterIndex].originalTextRefIds = Array.from(new Set([...(chapters[chapterIndex].originalTextRefIds || []), uploadId]));
            chapters[chapterIndex].mcqCount = (chapters[chapterIndex].mcqCount || 0) + allMcqsToApprove.length;
        } else {
            chapters.push({
                id: chapterId, name: chapterName, mcqCount: allMcqsToApprove.length, flashcardCount: 0,
                topicId: topicId, source: 'Marrow', sourceUploadIds: [uploadId], originalTextRefIds: [uploadId], summaryNotes: null
            });
        }
        if (!topicDoc.exists) {
            transaction.set(topicRef, { name: topicName, chapters: chapters, source: 'Marrow', totalMcqCount: allMcqsToApprove.length, totalFlashcardCount: 0, chapterCount: chapters.length });
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
        for (const tag of keyTopics) { 
            const keyTopicRef = db.collection('KeyClinicalTopics').doc(tag.replace(/\s+/g, '_').toLowerCase());
            transaction.set(keyTopicRef, { name: tag, createdAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        transaction.update(uploadRef, { status: 'completed', updatedAt: FieldValue.serverTimestamp() });
        return { success: true, message: `${allMcqsToApprove.length} Marrow MCQs approved.` };
    });
});

// =============================================================================
//
//   GENERAL PIPELINE FUNCTIONS (Advanced 5-Stage Batch Processing)
//
// =============================================================================

export const processManualTextInput = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ userId: string, textContent: string }>) => {
  ensureClientsInitialized();
  if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
  const { userId, textContent } = request.data; 
  if (!userId || !textContent) throw new HttpsError('invalid-argument', 'User ID and text content are required.');
  const docRef = db.collection('userUploads').doc();
  await docRef.set({ uid: userId, fileName: `Manual Input - ${new Date().toLocaleString()}`, extractedText: textContent, status: 'processed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), });
  return { success: true, docId: docRef.id };
});

export const suggestClassification = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>) => {
    ensureClientsInitialized();
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
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
    ensureClientsInitialized();
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId, totalMcqCount, totalFlashcardCount, batchSize, approvedTopic, approvedChapter } = request.data;
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
    ensureClientsInitialized();
    if (!request.auth?.token.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
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
                    const rawResponse = resp.response.candidates?.[0]?.content?.parts?.[0]?.text;
                    
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


export const autoAssignContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    ensureClientsInitialized();
    if (!request.auth?.token.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId, existingTopics, scopeToTopicName } = request.data as { uploadId: string; existingTopics: PediaQuizTopicType[]; scopeToTopicName?: string };
    const docRef = db.collection("userUploads").doc(uploadId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new HttpsError("not-found", "Upload not found.");
    const uploadData = docSnap.data() as UserUpload;
    if (uploadData.status !== 'pending_final_review') throw new HttpsError("failed-precondition", "Content must be in 'pending_final_review' state.");
    const allGeneratedContent = uploadData.finalAwaitingReviewData;
    if (!allGeneratedContent || allGeneratedContent.mcqs.length === 0) throw new HttpsError("failed-precondition", "No generated content to assign.");
    let contextText: string;
    let taskText: string;
    let topicsAndChaptersContext = existingTopics.map((t: PediaQuizTopicType) => ({ topic: t.name, chapters: t.chapters.map((c: Chapter) => c.name) }));
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

export const approveContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureClientsInitialized();
    if (!request.auth?.token.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId, assignments } = request.data as { uploadId: string, assignments: AssignmentSuggestion[] };
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
                flashcardCount: (flashcards || []).length
            })
        }, { merge: true });

        (mcqs || []).forEach((mcq: Partial<MCQ>) => batch.set(db.collection("MasterMCQ").doc(), { ...mcq, topic: topicName, chapter: chapterName, topicId: normalizeId(topicName), chapterId: normalizeId(chapterName), sourceUploadId: uploadId, status: 'approved', createdAt: FieldValue.serverTimestamp() }));
        (flashcards || []).forEach((flashcard: Partial<Flashcard>) => batch.set(db.collection("Flashcards").doc(), { ...flashcard, topic: topicName, chapter: chapterName, topicId: normalizeId(topicName), chapterId: normalizeId(chapterName), sourceUploadId: uploadId, status: 'approved', createdAt: FieldValue.serverTimestamp() }));
    }
    batch.update(db.collection("userUploads").doc(uploadId), { status: 'completed', completedAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return { success: true, message: "Content saved!" };
});

export const resetContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureClientsInitialized();
    if (!request.auth?.token.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
    const batch = db.batch();
    const mcqQuery = db.collection("MasterMCQ").where("sourceUploadId", "==", uploadId);
    const flashcardQuery = db.collection("Flashcards").where("sourceUploadId", "==", uploadId);
    const [mcqSnapshot, flashcardSnapshot] = await Promise.all([mcqQuery.get(), flashcardQuery.get()]);
    mcqSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => batch.delete(doc.ref));
    flashcardSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => batch.delete(doc.ref));
    const uploadRef = db.collection("userUploads").doc(uploadId);
    batch.update(uploadRef, { status: 'batch_ready', completedBatches: 0, generatedContent: [], finalAwaitingReviewData: FieldValue.delete(), assignmentSuggestions: FieldValue.delete(), });
    await batch.commit();
    return { success: true, message: `Reset ${mcqSnapshot.size} MCQs and ${flashcardSnapshot.size} Flashcards.` };
});

export const reassignContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureClientsInitialized();
    if (!request.auth?.token.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
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
    mcqSnapshot.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    flashcardSnapshot.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();
    return { success: true, message: "Content is ready for reassignment." };
});

export const prepareForRegeneration = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureClientsInitialized();
    if (!request.auth?.token.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
    const mcqQuery = db.collection("MasterMCQ").where("sourceUploadId", "==", uploadId);
    const mcqSnapshot = await mcqQuery.get();
    const existingQuestions = mcqSnapshot.docs.map((doc: QueryDocumentSnapshot) => doc.data().question as string);
    const uploadRef = db.collection("userUploads").doc(uploadId);
    await uploadRef.update({ status: 'batch_ready', completedBatches: 0, generatedContent: [], finalAwaitingReviewData: FieldValue.delete(), assignmentSuggestions: FieldValue.delete(), existingQuestionSnippets: existingQuestions, });
    return { success: true, message: "Ready for regeneration." };
});


// =============================================================================
//
//   UNIVERSAL USER & AI FUNCTIONS
//
// =============================================================================
export const updateChapterNotes = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureClientsInitialized();
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { topicId, chapterId, newSummary } = request.data as { topicId: string, chapterId: string, newSummary: string };
    const topicRef = db.collection('MarrowTopics').doc(topicId);
    const topicDoc = await topicRef.get();
    if (!topicDoc.exists) throw new HttpsError("not-found", "Marrow Topic not found.");
    let chapters = (topicDoc.data()?.chapters || []) as Chapter[];
    const chapterIndex = chapters.findIndex(ch => ch.id === chapterId);
    if (chapterIndex === -1) throw new HttpsError("not-found", "Marrow Chapter not found.");
    chapters[chapterIndex].summaryNotes = newSummary;
    await topicRef.update({ chapters, updatedAt: FieldValue.serverTimestamp() });
    return { success: true, message: "Chapter notes updated." };
});

export const addquizresult = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureClientsInitialized();
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const userId = request.auth.uid;
    const quizData = request.data as Omit<QuizResult, 'id' | 'userId' | 'date'>;
    const resultRef = db.collection('quizResults').doc();
    await resultRef.set({ ...quizData, id: resultRef.id, userId, date: FieldValue.serverTimestamp() });
    return { success: true, id: resultRef.id };
});

export const addattempt = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureClientsInitialized();
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    const userId = request.auth.uid;
    const { mcqId, isCorrect } = request.data as { mcqId: string; isCorrect: boolean };
    if (!mcqId || isCorrect == null) throw new HttpsError("invalid-argument", "MCQ ID and correctness required.");
    const attemptRef = db.collection("users").doc(userId).collection("attemptedMCQs").doc(mcqId);
    await db.runTransaction(async (transaction: Transaction) => {
        const attemptDoc = await transaction.get(attemptRef);
        if (attemptDoc.exists) {
            transaction.update(attemptRef, {
                attempts: FieldValue.increment(1),
                correct: FieldValue.increment(isCorrect ? 1 : 0),
                incorrect: FieldValue.increment(isCorrect ? 0 : 1),
                isCorrect, lastAttempted: FieldValue.serverTimestamp(),
            });
        } else {
            transaction.set(attemptRef, {
                attempts: 1, correct: isCorrect ? 1 : 0, incorrect: isCorrect ? 0 : 1,
                isCorrect, lastAttempted: FieldValue.serverTimestamp(),
            });
        }
    });
    return { success: true };
});

export const togglebookmark = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<ToggleBookmarkCallableData>) => {
    ensureClientsInitialized();
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

export const deletecontentitem = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<DeleteContentItemCallableData>) => {
    ensureClientsInitialized();
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { id, type, collectionName } = request.data;
    const allowedCollections: DeleteContentItemCallableData['collectionName'][] = ["MasterMCQ", "MarrowMCQ", "Flashcards"];
    if (!allowedCollections.includes(collectionName)) throw new HttpsError("invalid-argument", "Invalid collection name provided.");
    await db.collection(collectionName).doc(id).delete();
    return { success: true, message: `${type.toUpperCase()} deleted.` };
});

export const resetUpload = onCall(HEAVY_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>): Promise<{ success: boolean; message: string }> => {
    ensureClientsInitialized();
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
    });
    return { success: true, message: `Content for ${fileName} reset successfully.` };
});

export const archiveUpload = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ uploadId: string }>): Promise<{ success: boolean; message: string }> => {
    ensureClientsInitialized();
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;
    const uploadRef = db.collection('userUploads').doc(uploadId);
    await uploadRef.update({ status: 'archived', updatedAt: FieldValue.serverTimestamp() });
    return { success: true, message: `Upload ${uploadId} archived.` };
});

export const chatWithAssistant = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ prompt: string; history: ChatMessage[] }>): Promise<{ response: string; generatedQuiz?: MCQ[] }> => {
    ensureClientsInitialized();
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required to chat with the assistant.");
    const { prompt, history } = request.data;
    const chatHistoryForAI: Content[] = history.map((message: ChatMessage) => ({ role: message.sender === 'user' ? 'user' : 'model', parts: [{ text: message.text }] }));
    const chat = _powerfulModel.startChat({ history: chatHistoryForAI });
    try {
        const result = await chat.sendMessage(prompt);
        const modelResponse = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I'm sorry, I couldn't generate a response.";
        return { response: modelResponse };
    }
    catch (error: unknown) {
        throw new HttpsError("internal", `AI chat failed: ${(error as Error).message}`);
    }
});

export const generatePerformanceAdvice = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ overallAccuracy: number, strongTopics: string[], weakTopics: string[]}>) => {
    ensureClientsInitialized();
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const { overallAccuracy, strongTopics, weakTopics } = request.data;
    const prompt = `You are an AI academic advisor for a postgraduate medical student. Analyze the following performance data and provide actionable, professional advice: Overall Accuracy: ${overallAccuracy.toFixed(1)}%. Strongest Topics: ${strongTopics.join(", ")}. Weakest Topics: ${weakTopics.join(", ")}. Your advice should: 1. Congratulate them on strengths. 2. Identify weak areas gently. 3. Provide a brief, actionable study plan. Suggest specific strategies for tackling the weak topics (e.g., "Focus on flashcards for definitions in [Weak Topic 1]"). 4. End on a motivating note. Format your response using basic markdown.`;
    try {
        const result = await _powerfulModel.generateContent(prompt);
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        return { advice: responseText || "Could not generate advice." };
    } catch (e: unknown) {
        throw new HttpsError("internal", `Performance advice generation failed: ${(e as Error).message}`);
    }
});

export const generateWeaknessBasedTest = onCall(LIGHT_FUNCTION_OPTIONS, async (request: CallableRequest<{ attempted: AttemptedMCQs, allMcqs: Pick<MCQ, 'id' | 'topicId' | 'chapterId' | 'source' | 'tags'>[], testSize: number }>) => {
    ensureClientsInitialized();
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const { attempted, allMcqs, testSize } = request.data; 
    const prompt = `From the user's attempt history, select ${testSize} MCQs from the provided list that best target their weaknesses. Prioritize questions answered incorrectly multiple times, and those they got wrong after previously getting right. Include a few questions from their weakest topics. Return ONLY a valid JSON array of the selected MCQ IDs. Example: ["id1", "id2", "id3"]. DATA: """${JSON.stringify({ allMcqs, attempted })}"""`;
    try {
        const result = await _quickModel.generateContent(prompt);
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