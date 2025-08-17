/* eslint-disable max-len */
// --- Firebase Admin SDK Imports ---
import * as admin from "firebase-admin";
import { UserRecord } from "firebase-admin/auth";
import { FieldValue, Transaction, QueryDocumentSnapshot } from "firebase-admin/firestore";

// --- Firebase Functions V2 Imports ---
import { onCall, CallableRequest, HttpsError, CallableOptions } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";

// --- Firebase Functions V1 Import for Auth Trigger ---
import * as functionsV1 from "firebase-functions";

// --- Google Cloud SDKs for AI and Vision APIs ---
import { ImageAnnotatorClient, protos } from "@google-cloud/vision";
import { VertexAI, GenerativeModel, Content } from "@google-cloud/vertexai";

// --- Node.js Built-in Modules ---
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// --- Shared Types from Monorepo ---
import {
    MCQ, ChatMessage, ContentGenerationJob, QuizResult, Chapter,
    UploadStatus, AttemptedMCQs, ToggleBookmarkCallableData, DeleteContentItemCallableData,
    AssignmentSuggestion, AwaitingReviewData, Topic,
    Flashcard, Attempt, AddAttemptCallableData, AddFlashcardAttemptCallableData,
    GenerateWeaknessBasedTestCallableData, GetDailyWarmupQuizCallableData,
    PlanContentGenerationCallableData,
    ApproveGeneratedContentCallableData, ProcessManualTextInputCallableData,
    SuggestAssignmentCallableData
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
        try { return JSON.parse(jsonMatch[1]); } catch (e: unknown) { logger.error("Failed to parse extracted JSON string:", { jsonString: jsonMatch[1], error: (e as Error).message }); throw new HttpsError("internal", "Invalid JSON from AI model (in markdown)."); }
    }
    try { return JSON.parse(rawText); } catch (e: unknown) { logger.error("Failed to parse raw text as JSON:", { rawText, error: (e as Error).message }); throw new HttpsError("internal", "Invalid JSON from AI model (raw text)."); }
}

const normalizeId = (name: string): string => {
    if (typeof name !== 'string') return 'unknown';
    return name.replace(/\s+/g, '_').toLowerCase();
};

const ensureAdmin = (request: CallableRequest) => {
    if (request.auth?.token?.isAdmin !== true) {
        throw new HttpsError("permission-denied", "This function requires administrative privileges.");
    }
};

// =============================================================================
//
//   AUTH & STORAGE TRIGGERS (Universal)
//
// =============================================================================
export const onUserCreate = functionsV1.region(LOCATION).auth.user().onCreate(async (user: UserRecord) => {
    const userRef = db.collection("users").doc(user.uid);
    await userRef.set({
        uid: user.uid, email: user.email, displayName: user.displayName || "PediaQuiz User",
        createdAt: FieldValue.serverTimestamp(), lastLogin: FieldValue.serverTimestamp(), isAdmin: false,
        bookmarkedMcqs: [], bookmarkedFlashcards: [] // Initialize new bookmark fields
    });
});

export const onFileUploaded = onObjectFinalized({
    cpu: 2, memory: "1GiB", timeoutSeconds: 300, bucket: "pediaquizapp.firebasestorage.app",
}, async (event: { data?: { bucket: string; name: string; contentType?: string } }) => {
    ensureClientsInitialized();
    const { bucket, name } = event.data!;
    if (!name || !name.startsWith("uploads/") || name.endsWith('/')) return;
    const pathParts = name.split("/");
    if (pathParts.length < 3) return;
    const userId = pathParts[1];
    const fileName = path.basename(name);
    // Determine pipeline based on filename prefix (Marrow vs General)
    const pipeline: ContentGenerationJob['pipeline'] = fileName.startsWith("MARROW_") ? 'marrow' : 'general';
    const userUploadRef = db.collection("contentGenerationJobs").doc(); // Use contentGenerationJobs collection

    const newUpload: Partial<ContentGenerationJob> = { id: userUploadRef.id, userId, fileName, createdAt: new Date(), pipeline };

    try {
        await userUploadRef.set({ ...newUpload, status: "pending_ocr" });
        let extractedText = "";

        if (event.data?.contentType === "application/pdf") {
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
            files.sort((a: any, b: any) => a.name.localeCompare(b.name));
            for (const file of files) {
                const [contents] = await file.download();
                const output = JSON.parse(contents.toString());
                (output.responses || []).forEach((pageResponse: protos.google.cloud.vision.v1.IAnnotateImageResponse) => {
                    if (pageResponse.fullTextAnnotation?.text) extractedText += pageResponse.fullTextAnnotation.text + "\n\n";
                });
            }
            await storage.bucket(bucket).deleteFiles({ prefix: outputPrefix });
            if (!extractedText.trim()) throw new Error("OCR could not extract any readable text from the PDF.");
        } else if (event.data?.contentType === "text/plain") {
            const tempFilePath = path.join(os.tmpdir(), fileName);
            await storage.bucket(bucket).file(name).download({ destination: tempFilePath });
            extractedText = fs.readFileSync(tempFilePath, "utf8");
            fs.unlinkSync(tempFilePath);
            if (!extractedText.trim()) throw new Error("The uploaded text file is empty.");
        } else {
            throw new HttpsError("invalid-argument", `Unsupported file type: ${event.data?.contentType}.`);
        }

        const updateData: Partial<ContentGenerationJob> = { sourceText: extractedText.trim(), updatedAt: FieldValue.serverTimestamp() };

        if (pipeline === 'marrow') {
            (updateData as MarrowContentGenerationJob).status = "pending_planning"; // Marrow starts with planning, then generates
        } else { // General pipeline starts with classification, then planning
            (updateData as GeneralContentGenerationJob).status = 'processed'; // Just processed text, ready for classification
        }
        await userUploadRef.update(updateData);

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await userUploadRef.update({ status: "error", error: `Processing failed: ${errorMessage}` }).catch(() => { });
    }
});

export const onContentReadyForReview = onDocumentUpdated({ document: "contentGenerationJobs/{jobId}", ...FIRESTORE_COMMON_RUNTIME_OPTIONS }, async (event) => {
    ensureClientsInitialized();
    const before = event.data?.before.data() as ContentGenerationJob | undefined;
    const after = event.data?.after.data() as ContentGenerationJob | undefined;
    if (!before || !after) return;

    // Trigger suggestion only when status changes to 'pending_assignment' AND it's a general pipeline job
    // This is the auto-classification step.
    if (before.status !== 'pending_assignment' && after.status === 'pending_assignment' && after.pipeline === 'general') {
        const content = after.finalAwaitingReviewData;
        if (!content || (!content.mcqs?.length && !content.flashcards?.length)) return; // Ensure content exists

        const contentSample = JSON.stringify({
            mcqs: (content.mcqs || []).slice(0, 5).map((mcq: Partial<MCQ>) => mcq.question),
            flashcards: (content.flashcards || []).slice(0, 5).map((fc: Partial<Flashcard>) => fc.front),
        });
        const docRef = db.collection("contentGenerationJobs").doc(event.params.jobId);
        try {
            const generativeModel = _powerfulModel;
            const prompt = `CRITICAL: You MUST respond with only a valid JSON object. Do not add any conversational text. As a specialist in postgraduate pediatric medical curricula, analyze the following content sample and suggest the single best Topic and Chapter. JSON structure: {"suggestedTopic": "string", "suggestedChapter": "string"}. Sample: """${contentSample}"""`;
            const resp = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
            const rawResponse = resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            const parsedResponse = extractJson(rawResponse);
            await docRef.update({
                assignmentSuggestions: [{
                    topicName: parsedResponse.suggestedTopic || 'Uncategorized',
                    chapterName: parsedResponse.suggestedChapter || 'General',
                    isNewChapter: true, // This AI does not check for existing chapters
                    mcqIndexes: Array.from(Array(content.mcqs?.length || 0).keys()), // Suggest all for the primary assignment
                    flashcardIndexes: Array.from(Array(content.flashcards?.length || 0).keys()),
                }],
            });
        } catch (e: unknown) {
            const err = e as Error;
            logger.error(`AI assignment suggestion failed for job ${event.params.jobId}: ${err.message}`, e);
            await docRef.update({ error: `AI suggestion failed: ${err.message}` }).catch(() => { });
        }
    }
});

// =============================================================================
//
//   ADMIN & CONTENT GENERATION PIPELINE FUNCTIONS (Callable by Admins)
//
// =============================================================================

// Handles manual text input or triggers initial processing for files uploaded via frontend.
// Sets the job status to 'processed' (General) or 'pending_planning' (Marrow).
export const processManualTextInput = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureAdmin(request);
    ensureClientsInitialized(); // For consistency, though not strictly needed for this simple function

    const { fileName, rawText, isMarrow } = request.data;
    const userId = request.auth!.uid;
    const jobRef = db.collection("contentGenerationJobs").doc();

    const pipeline: ContentGenerationJob['pipeline'] = isMarrow ? 'marrow' : 'general';
    const finalFileName = isMarrow ? `MARROW_TEXT_${Date.now()}_${fileName}` : `TEXT_${Date.now()}_${fileName}`;

    const newJob: Partial<ContentGenerationJob> = {
        id: jobRef.id, userId, fileName: finalFileName, createdAt: new Date(),
        sourceText: rawText, pipeline,
    };

    if (isMarrow) {
        (newJob as MarrowContentGenerationJob).stagedContent = { orphanExplanations: [rawText], extractedMcqs: [], generatedMcqs: [] };
        (newJob as MarrowContentGenerationJob).status = 'pending_planning'; // Marrow workflow
    } else {
        (newJob as GeneralContentGenerationJob).status = 'processed'; // General workflow
    }

    await jobRef.set(newJob);
    return { success: true, uploadId: jobRef.id, message: "Content submitted for processing." };
});

// AI analyzes the source text and suggests counts for MCQs and Flashcards.
export const planContentGeneration = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    ensureAdmin(request);
    ensureClientsInitialized();
    const { jobId } = request.data;
    const jobRef = db.collection("contentGenerationJobs").doc(jobId);
    const jobDocSnap = await jobRef.get();
    if (!jobDocSnap.exists) throw new HttpsError("not-found", "Job document not found.");

    const jobData = jobDocSnap.data() as ContentGenerationJob;
    const sourceText = jobData.sourceText || "";
    if (!sourceText) throw new HttpsError("failed-precondition", "No source text to plan.");

    // Update status to indicate planning is in progress
    await jobRef.update({ status: "pending_generation" }); // Renamed from pending_classification/approval to align with plan status

    const prompt = `CRITICAL: You MUST respond with only a valid JSON object. Analyze the following medical text and estimate a reasonable number of high-quality MCQs and Flashcards that can be generated from it.
    JSON structure: {"mcqCount": number, "flashcardCount": number}.
    Text excerpt: """${sourceText.substring(0, Math.min(sourceText.length, 8000))}"""`; // Limit input text to AI

    try {
        const resp = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const parsedResponse = extractJson(resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
        const plan = {
            mcqCount: parsedResponse.mcqCount || 0,
            flashcardCount: parsedResponse.flashcardCount || 0,
        };
        // Update job with the suggested plan and set status to 'pending_generation'
        await jobRef.update({ suggestedPlan: plan, status: "pending_generation" });
        return { success: true, message: "Content plan created successfully!", plan };
    } catch (e) {
        logger.error(`AI planning failed for job ${jobId}:`, e);
        await jobRef.update({ status: 'error', error: `AI planning failed: ${(e as Error).message}` });
        throw new HttpsError("internal", `AI planning failed: ${(e as Error).message}`);
    }
});

// Starts the automated batch generation process for General pipeline content.
export const startAutomatedBatchGeneration = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    ensureAdmin(request);
    ensureClientsInitialized();
    const { jobId } = request.data;
    const jobRef = db.collection("contentGenerationJobs").doc(jobId);
    const jobDocSnap = await jobRef.get();
    if (!jobDocSnap.exists) throw new HttpsError("not-found", "Job not found.");
    let jobData = jobDocSnap.data() as GeneralContentGenerationJob;

    if (jobData.pipeline !== 'general' || !jobData.suggestedPlan) {
        throw new HttpsError("failed-precondition", "Job is not a general pipeline job or has not been planned.");
    }

    const { sourceText, suggestedPlan } = jobData;
    const { mcqCount, flashcardCount } = suggestedPlan;
    const textChunks = (sourceText || "").split(/\n\s*\n/).filter(chunk => chunk.trim().length > 100);
    const totalBatches = textChunks.length;

    if (totalBatches === 0) {
        await jobRef.update({ status: "error", error: "No valid text chunks found for generation." });
        return { success: false, message: "No text to process." };
    }

    // Initialize job state for batch generation
    await jobRef.update({ status: "generating_content", totalBatches, completedBatches: 0, finalAwaitingReviewData: { mcqs: [], flashcards: [] } });

    // NOTE: For robust, long-running processes, each batch should ideally be triggered
    // via a Pub/Sub topic or Cloud Tasks queue to prevent function timeouts and handle retries.
    // This synchronous loop is provided for simplicity of the example.
    for (let i = (jobData.completedBatches || 0); i < totalBatches; i++) { // Resume from last completed batch
        const mcqsForBatch = Math.ceil((mcqCount || 0) / totalBatches);
        const flashcardsForBatch = Math.ceil((flashcardCount || 0) / totalBatches);

        const prompt = `Generate ${mcqsForBatch} MCQs and ${flashcardsForBatch} Flashcards from this text: """${textChunks[i]}""". Respond ONLY with JSON: {"mcqs": [...], "flashcards": [...]}`;

        try {
            const resp = await _powerfulModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
            const rawResponse = resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            const batchResult = extractJson(rawResponse);

            const newMcqs = (batchResult.mcqs || []).map((mcq: Partial<MCQ>) => ({
                ...mcq,
                source: 'AI_Generated',
                status: 'pending',
                creatorId: jobData.userId,
                uploadId: jobId,
                createdAt: new Date(),
            }));
            const newFlashcards = (batchResult.flashcards || []).map((fc: Partial<Flashcard>) => ({
                ...fc,
                source: 'AI_Generated',
                status: 'pending',
                creatorId: jobData.userId,
                uploadId: jobId,
                createdAt: new Date(),
            }));

            await jobRef.update({
                'finalAwaitingReviewData.mcqs': FieldValue.arrayUnion(...newMcqs),
                'finalAwaitingReviewData.flashcards': FieldValue.arrayUnion(...newFlashcards),
                completedBatches: FieldValue.increment(1)
            });

        } catch (e: unknown) {
            logger.error(`Batch generation ${i + 1}/${totalBatches} failed for job ${jobId}: ${e}`, e);
            await jobRef.update({
                status: "generation_failed_partially",
                error: `Batch ${i + 1} failed: ${(e as Error).message}`,
                updatedAt: FieldValue.serverTimestamp(),
            });
            throw new HttpsError("internal", `Batch generation failure: ${(e as Error).message}`);
        }
    }

    await jobRef.update({ status: "pending_assignment", updatedAt: FieldValue.serverTimestamp() });
    return { success: true, message: `Automated batch generation for job ${jobId} finished.` };
});

// AI suggests an assignment (topic/chapter) for generated content.
export const suggestAssignment = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    ensureAdmin(request);
    ensureClientsInitialized();
    const { jobId, existingTopics, scopeToTopicName } = request.data as SuggestAssignmentCallableData;
    const jobRef = db.collection("contentGenerationJobs").doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) throw new HttpsError("not-found", "Job not found.");
    const jobData = jobDoc.data() as GeneralContentGenerationJob;

    if (!jobData.finalAwaitingReviewData) {
        throw new HttpsError("failed-precondition", "No content available to suggest assignment for.");
    }
    const allGeneratedContent = jobData.finalAwaitingReviewData;

    let contextText: string;
    let taskText: string;
    let topicsAndChaptersContext = existingTopics.map((t: Topic) => ({ topic: t.name, chapters: t.chapters.map((c: Chapter) => c.name) }));

    if (scopeToTopicName) {
        const scopedTopic = topicsAndChaptersContext.find(t => t.topic === scopeToTopicName);
        contextText = `The content belongs to the broad medical topic of: "${scopeToTopicName}". Existing chapters are: ${JSON.stringify(scopedTopic?.chapters || [])}`;
        taskText = `Group the content into logical, new chapter names that fit within "${scopeToTopicName}". You can also assign content to existing chapters if it's a perfect fit.`;
    } else {
        contextText = `Here is the existing library structure: ${JSON.stringify(topicsAndChaptersContext, null, 2)}`;
        taskText = `Assign each item to the most appropriate existing chapter and topic. You may suggest new, relevant chapter names within existing topics if necessary.`;
    }

    const contentToCategorize = {
        mcqs: (allGeneratedContent.mcqs || []).map((m, index) => ({ index, question: m.question })),
        flashcards: (allGeneratedContent.flashcards || []).map((f, index) => ({ index, front: f.front }))
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
            mcqIndexes: a.mcqIndexes || [], // Store indexes, not full MCQs/Flashcards
            flashcardIndexes: a.flashcardIndexes || [],
        }));

        await jobRef.update({ assignmentSuggestions: assignmentPayload, updatedAt: FieldValue.serverTimestamp() });
        return { success: true, suggestions: assignmentPayload, message: "Assignment suggested." };
    }
    catch (e: unknown) {
        const err = e as Error;
        logger.error(`Auto-assignment failed for job ${jobId}: ${err.message}`, e);
        await jobRef.update({ status: 'error', error: `Auto-assignment failed: ${err.message}` }).catch(() => { });
        throw new HttpsError("internal", err.message);
    }
});

// Approves generated content (MCQs and Flashcards) and assigns them to topics/chapters.
export const approveGeneratedContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    ensureAdmin(request);
    ensureClientsInitialized(); // Ensure clients are initialized for potential AI tag generation/updates
    const { jobId, assignment } = request.data as ApproveGeneratedContentCallableData;
    const adminId = request.auth!.uid;
    const jobRef = db.collection("contentGenerationJobs").doc(jobId);

    return db.runTransaction(async (transaction) => {
        const jobDoc = await transaction.get(jobRef);
        if (!jobDoc.exists) throw new HttpsError("not-found", "Job not found.");
        const jobData = jobDoc.data() as GeneralContentGenerationJob; // Assert as GeneralContentGenerationJob

        const allMcqs = jobData.finalAwaitingReviewData?.mcqs || [];
        const allFlashcards = jobData.finalAwaitingReviewData?.flashcards || [];

        const mcqsToApprove = (assignment.mcqIndexes || []).map(i => allMcqs[i]).filter(Boolean) as MCQ[]; // Filter and cast
        const flashcardsToApprove = (assignment.flashcardIndexes || []).map(i => allFlashcards[i]).filter(Boolean) as Flashcard[]; // Filter and cast

        if (mcqsToApprove.length === 0 && flashcardsToApprove.length === 0) {
            throw new HttpsError("invalid-argument", "No content selected for this assignment batch.");
        }

        const topicId = normalizeId(assignment.topicName);
        const chapterId = normalizeId(assignment.chapterName);

        const topicRef = db.collection("Topics").doc(topicId); // General topics collection
        const topicDoc = await transaction.get(topicRef);
        let chapters = (topicDoc.data()?.chapters || []) as Chapter[];
        const chapterIndex = chapters.findIndex(c => c.id === chapterId);

        if (chapterIndex > -1) {
            chapters[chapterIndex].mcqCount = (chapters[chapterIndex].mcqCount || 0) + mcqsToApprove.length;
            chapters[chapterIndex].flashcardCount = (chapters[chapterIndex].flashcardCount || 0) + flashcardsToApprove.length;
            chapters[chapterIndex].originalTextRefIds = Array.from(new Set([...(chapters[chapterIndex].originalTextRefIds || []), jobId]));
        } else {
            chapters.push({
                id: chapterId, name: assignment.chapterName, mcqCount: mcqsToApprove.length, flashcardCount: flashcardsToApprove.length,
                topicId, source: 'General', topicName: assignment.topicName, originalTextRefIds: [jobId]
            });
        }

        // Update or set the topic document
        if (!topicDoc.exists) {
            transaction.set(topicRef, { name: assignment.topicName, chapters, totalMcqCount: mcqsToApprove.length, totalFlashcardCount: flashcardsToApprove.length, chapterCount: chapters.length, source: 'General' });
        } else {
            transaction.update(topicRef, { chapters, totalMcqCount: FieldValue.increment(mcqsToApprove.length), totalFlashcardCount: FieldValue.increment(flashcardsToApprove.length), chapterCount: chapters.length });
        }

        // Add MCQs to MasterMCQ collection
        mcqsToApprove.forEach((mcq: MCQ) => { // Cast to MCQ
            const mcqRef = db.collection("MasterMCQ").doc();
            transaction.set(mcqRef, {
                ...mcq, // Spread existing MCQ properties
                topicName: assignment.topicName, // Use assigned topic name
                topicId, // Use assigned topic ID
                chapterName: assignment.chapterName, // Use assigned chapter name
                chapterId, // Use assigned chapter ID
                tags: jobData.suggestedKeyTopics || [], // Use the overall job's suggested key topics
                status: 'approved',
                source: 'AI_Generated',
                creatorId: adminId,
                createdAt: FieldValue.serverTimestamp(),
                uploadId: jobId,
            });
        });

        // Add Flashcards to Flashcards collection
        flashcardsToApprove.forEach((flashcard: Flashcard) => { // Cast to Flashcard
            const flashcardRef = db.collection("Flashcards").doc();
            transaction.set(flashcardRef, {
                ...flashcard, // Spread existing Flashcard properties
                topicName: assignment.topicName,
                topicId,
                chapterName: assignment.chapterName,
                chapterId,
                tags: jobData.suggestedKeyTopics || [],
                status: 'approved',
                source: 'AI_Generated',
                creatorId: adminId,
                createdAt: FieldValue.serverTimestamp(),
                uploadId: jobId,
            });
        });

        // Update KeyClinicalTopics collection
        for (const tag of (jobData.suggestedKeyTopics || [])) {
            const keyTopicRef = db.collection('KeyClinicalTopics').doc(normalizeId(tag));
            transaction.set(keyTopicRef, { name: tag, createdAt: FieldValue.serverTimestamp() }, { merge: true });
        }

        // Remove this assignment from jobData.assignmentSuggestions and update job status if no more suggestions left
        const updatedSuggestions = (jobData.assignmentSuggestions || []).filter(s =>
            !(s.topicName === assignment.topicName && s.chapterName === assignment.chapterName &&
                JSON.stringify(s.mcqIndexes) === JSON.stringify(assignment.mcqIndexes) &&
                JSON.stringify(s.flashcardIndexes) === JSON.stringify(assignment.flashcardIndexes))
        );

        if (updatedSuggestions.length === 0) {
            transaction.update(jobRef, { status: 'completed', updatedAt: FieldValue.serverTimestamp(), assignmentSuggestions: FieldValue.delete() });
        } else {
            transaction.update(jobRef, { assignmentSuggestions: updatedSuggestions, updatedAt: FieldValue.serverTimestamp() });
        }

        return { success: true, message: `Approved ${mcqsToApprove.length} MCQs and ${flashcardsToApprove.length} Flashcards for ${assignment.topicName} > ${assignment.chapterName}.` };
    });
});

export const resetUpload = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    ensureAdmin(request);
    const { uploadId: jobId } = request.data;
    const jobRef = db.collection('contentGenerationJobs').doc(jobId);
    const jobDocSnap = await jobRef.get();
    if (!jobDocSnap.exists) throw new HttpsError("not-found", `ContentGenerationJob document with ID ${jobId} not found.`);

    const jobData = jobDocSnap.data() as ContentGenerationJob;
    const isMarrowUpload = jobData.pipeline === 'marrow';

    const deleteBatch = db.batch();
    const mcqCollectionToDeleteFrom = isMarrowUpload ? "MarrowMCQ" : "MasterMCQ";
    const flashcardCollectionToDeleteFrom = "Flashcards";

    // Delete associated MCQs
    const mcqsToDelete = await db.collection(mcqCollectionToDeleteFrom).where("uploadId", "==", jobId).get();
    mcqsToDelete.docs.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));

    // Delete associated Flashcards
    const flashcardsToDelete = await db.collection(flashcardCollectionToDeleteFrom).where("uploadId", "==", jobId).get();
    flashcardsToDelete.docs.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));

    await deleteBatch.commit();

    // Reset job document status and data
    const resetData: Partial<ContentGenerationJob> = {
        status: 'processed', // Revert to initial processed state after OCR/text input
        updatedAt: FieldValue.serverTimestamp(),
        error: FieldValue.delete(),
        // Clear all AI-generated content and suggestions
        stagedContent: FieldValue.delete(),
        suggestedKeyTopics: FieldValue.delete(),
        title: FieldValue.delete(),
        suggestedPlan: FieldValue.delete(),
        totalMcqCount: FieldValue.delete(),
        totalFlashcardCount: FieldValue.delete(),
        totalBatches: FieldValue.delete(),
        completedBatches: FieldValue.delete(),
        // textChunks: FieldValue.delete(), // Retain textChunks as source for re-planning
        generatedContent: FieldValue.delete(),
        finalAwaitingReviewData: FieldValue.delete(),
        assignmentSuggestions: FieldValue.delete(),
        existingQuestionSnippets: FieldValue.delete(),
    };

    // If it was a Marrow job from text, keep its initial staged content intact and go to pending_planning
    if (isMarrowUpload && jobData.sourceText) {
        (resetData as MarrowContentGenerationJob).status = 'pending_planning';
        (resetData as MarrowContentGenerationJob).stagedContent = { orphanExplanations: [jobData.sourceText], extractedMcqs: [], generatedMcqs: [] };
    } else {
        (resetData as GeneralContentGenerationJob).status = 'processed';
    }

    await jobRef.update(resetData);
    return { success: true, message: `Content for ${jobData.fileName} reset successfully.` };
});

export const archiveUpload = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureAdmin(request);
    const { uploadId: jobId } = request.data;
    const jobRef = db.collection('contentGenerationJobs').doc(jobId);
    await jobRef.update({ status: 'archived', updatedAt: FieldValue.serverTimestamp() });
    return { success: true, message: `Job ${jobId} archived.` };
});

export const reassignContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    ensureAdmin(request);
    const { jobId } = request.data;

    // Fetch all content associated with this jobId from approved collections
    const masterMcqSnap = await db.collection("MasterMCQ").where("uploadId", "==", jobId).get();
    const marrowMcqSnap = await db.collection("MarrowMCQ").where("uploadId", "==", jobId).get();
    const flashcardSnap = await db.collection("Flashcards").where("uploadId", "==", jobId).get();

    const mcqs = [...masterMcqSnap.docs, ...marrowMcqSnap.docs].map((doc: QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() } as MCQ));
    const flashcards = flashcardSnap.docs.map((doc: QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() } as Flashcard));

    if (mcqs.length === 0 && flashcards.length === 0) {
        throw new HttpsError("not-found", "No content found linked to this job for reassignment.");
    }

    const jobRef = db.collection("contentGenerationJobs").doc(jobId);

    // Create a batch to delete the current content from existing topics/chapters and collections
    const deleteBatch = db.batch();
    masterMcqSnap.docs.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    marrowMcqSnap.docs.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    flashcardSnap.docs.forEach((doc: QueryDocumentSnapshot) => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();

    // Prepare the content to be re-assigned
    const awaitingReviewData: AwaitingReviewData = { mcqs, flashcards };

    // Update the job status to pending_assignment so it appears in the admin queue for reassignment
    await jobRef.update({
        status: 'pending_assignment',
        finalAwaitingReviewData: awaitingReviewData,
        assignmentSuggestions: FieldValue.delete(), // Clear old suggestions
        updatedAt: FieldValue.serverTimestamp()
    });

    return { success: true, message: `Content is ready for reassignment.` };
});

export const prepareForRegeneration = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureAdmin(request);
    const { jobId } = request.data;
    const jobRef = db.collection("contentGenerationJobs").doc(jobId);
    const jobDocSnap = await jobRef.get();
    if (!jobDocSnap.exists) throw new HttpsError("not-found", `ContentGenerationJob document with ID ${jobId} not found.`);

    const jobData = jobDocSnap.data() as ContentGenerationJob;
    const isMarrowJob = jobData.pipeline === 'marrow';

    let existingQuestionSnippets: string[] = [];

    const deleteBatch = db.batch();
    if (isMarrowJob) {
        // Collect existing questions to prevent duplicates and delete them
        const mcqsToDelete = await db.collection("MarrowMCQ").where("uploadId", "==", jobId).get();
        mcqsToDelete.docs.forEach(doc => { existingQuestionSnippets.push(doc.data().question as string); deleteBatch.delete(doc.ref); });
    } else {
        const masterMcqsToDelete = await db.collection("MasterMCQ").where("uploadId", "==", jobId).get();
        const flashcardsToDelete = await db.collection("Flashcards").where("uploadId", "==", jobId).get();

        masterMcqsToDelete.docs.forEach(doc => { existingQuestionSnippets.push(doc.data().question as string); deleteBatch.delete(doc.ref); });
        flashcardsToDelete.docs.forEach(doc => { existingQuestionSnippets.push(doc.data().front as string); deleteBatch.delete(doc.ref); });
    }
    await deleteBatch.commit(); // Perform deletion

    // Reset job status and clear relevant fields for regeneration
    const updateData: Partial<ContentGenerationJob> = {
        status: 'pending_planning', // Both go back to planning stage
        completedBatches: 0,
        generatedContent: FieldValue.delete(),
        finalAwaitingReviewData: FieldValue.delete(),
        assignmentSuggestions: FieldValue.delete(),
        existingQuestionSnippets, // Pass existing snippets to AI for negative prompting
        totalMcqCount: FieldValue.delete(),
        totalFlashcardCount: FieldValue.delete(),
        totalBatches: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
    };

    // For Marrow jobs, re-initialize stagedContent if sourceText exists
    if (isMarrowJob && jobData.sourceText) {
        (updateData as MarrowContentGenerationJob).stagedContent = { orphanExplanations: [jobData.sourceText], extractedMcqs: [], generatedMcqs: [] };
    }
    await jobRef.update(updateData);

    return { success: true, message: "Content is ready for regeneration." };
});

export const updateChapterNotes = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureAdmin(request);
    const { topicId, chapterId, newSummary, source } = request.data as { topicId: string, chapterId: string, newSummary: string, source: 'General' | 'Marrow' };

    const collectionRef = source === 'Marrow' ? db.collection('MarrowTopics') : db.collection('Topics');
    const topicRef = collectionRef.doc(topicId);
    const topicDoc = await topicRef.get();
    if (!topicDoc.exists) throw new HttpsError("not-found", "Topic not found.");

    let chapters = (topicDoc.data()?.chapters || []) as Chapter[];
    const chapterIndex = chapters.findIndex(ch => ch.id === chapterId);
    if (chapterIndex === -1) throw new HttpsError("not-found", "Chapter not found within this topic.");

    chapters[chapterIndex].summaryNotes = newSummary;
    await topicRef.update({ chapters, updatedAt: FieldValue.serverTimestamp() });
    return { success: true, message: "Chapter notes updated." };
});

// =============================================================================
//
//   QUIZ & ATTEMPT FUNCTIONS
//
// =============================================================================

export const addquizresult = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const userId = request.auth.uid;
    const quizData = request.data as Omit<QuizResult, 'id' | 'userId' | 'quizDate'>;
    const resultRef = db.collection('users').doc(userId).collection('quizResults').doc();
    await resultRef.set({ ...quizData, id: resultRef.id, userId, quizDate: FieldValue.serverTimestamp() });
    return { success: true, id: resultRef.id };
});

export const addattempt = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    const userId = request.auth.uid;
    const { mcqId, isCorrect, selectedAnswer, sessionId, confidenceRating } = request.data as AddAttemptCallableData;
    if (!mcqId || isCorrect == null || selectedAnswer == null || !sessionId) throw new HttpsError("invalid-argument", "MCQ ID, correctness, selected answer, and session ID are required.");

    const attemptedMcqRef = db.collection("users").doc(userId).collection("attemptedMCQs").doc(mcqId);

    return db.runTransaction(async (transaction: Transaction) => {
        const attemptDoc = await transaction.get(attemptedMcqRef);
        const newAttempt = {
            mcqId, isCorrect, selectedAnswer, sessionId, confidenceRating,
            timestamp: new Date(),
            // Simple SM-2 like logic for spaced repetition based on confidence rating
            interval: confidenceRating === 'again' ? 0 : confidenceRating === 'hard' ? 1 : confidenceRating === 'good' ? 4 : 10,
            easeFactor: 2.5, // Default for now
            nextReviewDate: new Date(Date.now() + (confidenceRating === 'again' ? 0 : 24 * 60 * 60 * 1000 * (confidenceRating === 'hard' ? 1 : confidenceRating === 'good' ? 4 : 10))),
        };

        if (attemptDoc.exists) {
            const existingData = attemptDoc.data() as { history: Omit<Attempt, 'mcqId'>[]; latestAttempt: Attempt; };
            const history = existingData.history || [];
            if (existingData.latestAttempt) {
                history.push(existingData.latestAttempt);
            }
            transaction.update(attemptedMcqRef, {
                history: history,
                latestAttempt: newAttempt,
                updatedAt: FieldValue.serverTimestamp(),
            });
        } else {
            transaction.set(attemptedMcqRef, {
                history: [],
                latestAttempt: newAttempt,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
        }
    });
    return { success: true };
});

export const togglebookmark = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    const userId = request.auth.uid;
    const { contentId, contentType, action } = request.data as ToggleBookmarkCallableData;
    if (!contentId || !contentType) throw new HttpsError("invalid-argument", "Content ID and type are required.");
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new HttpsError("not-found", "User document not found.");

    let bookmarkedMcqs = userDoc.data()?.bookmarkedMcqs || [];
    let bookmarkedFlashcards = userDoc.data()?.bookmarkedFlashcards || [];
    let updated = false;

    if (contentType === 'mcq') {
        if (action === 'add' && !bookmarkedMcqs.includes(contentId)) {
            bookmarkedMcqs.push(contentId);
            updated = true;
        } else if (action === 'remove' && bookmarkedMcqs.includes(contentId)) {
            bookmarkedMcqs = bookmarkedMcqs.filter((id: string) => id !== contentId);
            updated = true;
        }
    } else if (contentType === 'flashcard') {
        if (action === 'add' && !bookmarkedFlashcards.includes(contentId)) {
            bookmarkedFlashcards.push(contentId);
            updated = true;
        } else if (action === 'remove' && bookmarkedFlashcards.includes(contentId)) {
            bookmarkedFlashcards = bookmarkedFlashcards.filter((id: string) => id !== contentId);
            updated = true;
        }
    }

    if (updated) {
        await userRef.update({ bookmarkedMcqs, bookmarkedFlashcards });
    }

    return { bookmarked: (contentType === 'mcq' ? bookmarkedMcqs : bookmarkedFlashcards).includes(contentId), bookmarks: [] };
});

export const deletecontentitem = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureAdmin(request);
    const { id, type, collectionName } = request.data as DeleteContentItemCallableData;
    const allowedCollections: DeleteContentItemCallableData['collectionName'][] = ["MasterMCQ", "MarrowMCQ", "Flashcards"];
    if (!allowedCollections.includes(collectionName)) throw new HttpsError("invalid-argument", "Invalid collection name provided.");
    await db.collection(collectionName).doc(id).delete();
    return { success: true, message: `${type.toUpperCase()} deleted.` };
});

// =============================================================================
//
//   AI-POWERED USER FEATURES
//
// =============================================================================

export const chatWithAssistant = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const { prompt, history } = request.data as { prompt: string; history: ChatMessage[] };
    const chatHistoryForAI: Content[] = history.map((message: ChatMessage) => ({ role: message.sender === 'user' ? 'user' : 'model', parts: [{ text: message.text }] }));
    const chat = _powerfulModel.startChat({ history: chatHistoryForAI });
    try {
        const result = await chat.sendMessage(prompt);
        return { response: result.response.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response." };
    }
    catch (error: unknown) {
        logger.error(`AI chat failed: ${error}`, error);
        throw new HttpsError("internal", `AI chat failed: ${(error as Error).message}`);
    }
});

export const generatePerformanceAdvice = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    ensureClientsInitialized();
    const { overallAccuracy, strongTopics, weakTopics } = request.data as { overallAccuracy: number, strongTopics: string[], weakTopics: string[] };
    const prompt = `You are an AI academic advisor for a postgraduate medical student. Analyze the following performance data and provide actionable, professional advice: Overall Accuracy: ${overallAccuracy.toFixed(1)}%. Strongest Topics: ${strongTopics.join(", ")}. Weakest Topics: ${weakTopics.join(", ")}. Your advice should be encouraging and concise.`;
    try {
        const result = await _powerfulModel.generateContent(prompt);
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        return { advice: responseText || "Could not generate advice." };
    } catch (e: unknown) {
        logger.error(`Performance advice generation failed: ${e}`, e);
        throw new HttpsError("internal", `Performance advice generation failed: ${(e as Error).message}`);
    }
});

export const generateWeaknessBasedTest = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const userId = request.auth.uid;

    // Fetch user's attempted MCQs
    const attemptedMcqsSnapshot = await db.collection("users").doc(userId).collection("attemptedMCQs").get();
    const attemptedMcqs: AttemptedMCQs = {};
    attemptedMcqsSnapshot.docs.forEach(doc => {
        const data = doc.data() as { history: Omit<Attempt, 'mcqId'>[]; latestAttempt: Attempt; };
        if (data.latestAttempt && data.latestAttempt.mcqId) {
            attemptedMcqs[doc.id] = {
                history: data.history || [],
                latestAttempt: { ...data.latestAttempt, mcqId: doc.id },
            };
        }
    });

    // Fetch all available MCQs (approved only)
    const masterMcqSnapshot = await db.collection('MasterMCQ').where('status', '==', 'approved').get();
    const marrowMcqSnapshot = await db.collection('MarrowMCQ').where('status', '==', 'approved').get();
    const allMcqIds: string[] = [];
    masterMcqSnapshot.docs.forEach(doc => allMcqIds.push(doc.id));
    marrowMcqSnapshot.docs.forEach(doc => allMcqIds.push(doc.id));

    const { testSize } = request.data as GenerateWeaknessBasedTestCallableData;

    const prompt = `You are an AI specialized in personalized learning paths. From the provided list of all available MCQs and the user's attempted history, select exactly ${testSize} MCQs that best target the user's weaknesses. Prioritize questions that the user has answered incorrectly, especially those with low confidence ratings. If there are not enough incorrect questions, select unseen questions that cover topics related to their weaknesses.
    CRITICAL: You MUST respond with ONLY a valid JSON array of the selected MCQ IDs. Do not include any conversational text outside the JSON.
    Example: ["mcqId1", "mcqId2", "mcqId3"].
    
    AVAILABLE_MCQS: ${JSON.stringify(allMcqIds)}
    USER_ATTEMPTS: ${JSON.stringify(attemptedMcqs)}`;

    try {
        const result = await _quickModel.generateContent(prompt);
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) throw new HttpsError("internal", "AI model returned an empty response for weakness test generation.");
        const selectedMcqIds = extractJson(responseText);
        if (!Array.isArray(selectedMcqIds)) throw new HttpsError("internal", "AI response for weakness test was not a valid array.");
        return { mcqIds: selectedMcqIds.slice(0, testSize) };
    } catch (e: unknown) {
        logger.error(`Failed to generate weakness test: ${e}`, e);
        throw new HttpsError("internal", `Failed to generate weakness test: ${(e as Error).message}`);
    }
});

export const getDailyWarmupQuiz = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const { count } = request.data as GetDailyWarmupQuizCallableData;

    const masterMcqSnapshot = await db.collection('MasterMCQ').where('status', '==', 'approved').get();
    const marrowMcqSnapshot = await db.collection('MarrowMCQ').where('status', '==', 'approved').get();
    const allMcqIds: string[] = [];
    masterMcqSnapshot.docs.forEach(doc => allMcqIds.push(doc.id));
    marrowMcqSnapshot.docs.forEach(doc => allMcqIds.push(doc.id));

    if (allMcqIds.length === 0) {
        return { mcqIds: [] };
    }

    const shuffledMcqIds = allMcqIds.sort(() => 0.5 - Math.random());
    const selectedMcqIds = shuffledMcqIds.slice(0, count);

    return { mcqIds: selectedMcqIds };
});

export const getQuizSessionFeedback = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const userId = request.auth.uid;
    const { quizResultId } = request.data as { quizResultId: string };

    const quizResultDoc = await db.collection('users').doc(userId).collection('quizResults').doc(quizResultId).get();
    if (!quizResultDoc.exists) throw new HttpsError("not-found", "Quiz result not found.");

    const quizResult = quizResultDoc.data() as QuizResult;

    const mcqIdsInQuiz = quizResult.mcqAttempts.map(a => a.mcqId);
    const mcqDetails = new Map<string, MCQ>();

    const chunkSize = 30;
    for (let i = 0; i < mcqIdsInQuiz.length; i += chunkSize) {
        const chunk = mcqIdsInQuiz.slice(i, i + chunkSize);
        const masterQuery = db.collection('MasterMCQ').where(admin.firestore.FieldPath.documentId(), 'in', chunk);
        const marrowQuery = db.collection('MarrowMCQ').where(admin.firestore.FieldPath.documentId(), 'in', chunk);

        const [masterSnap, marrowSnap] = await Promise.all([masterQuery.get(), marrowQuery.get()]);
        masterSnap.docs.forEach(doc => mcqDetails.set(doc.id, doc.data() as MCQ));
        marrowSnap.docs.forEach(doc => mcqDetails.set(doc.id, doc.data() as MCQ));
    }

    const relevantAttempts = quizResult.mcqAttempts.map(attempt => {
        const mcq = mcqDetails.get(attempt.mcqId);
        return {
            question: mcq?.question,
            correctAnswer: mcq?.answer,
            selectedAnswer: attempt.selectedAnswer,
            isCorrect: attempt.isCorrect,
            explanation: mcq?.explanation,
            topic: mcq?.topicName,
            chapter: mcq?.chapterName,
        };
    });

    const prompt = `You are an AI medical tutor. Provide concise, constructive feedback on the following quiz session for a postgraduate pediatric student. Highlight strong areas and suggest specific topics or question types for improvement. Consider the correct/incorrect answers, and explanations provided.
    
    QUIZ SESSION DATA: ${JSON.stringify(relevantAttempts, null, 2)}`;

    try {
        const result = await _powerfulModel.generateContent(prompt);
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        return { feedback: responseText || "Could not generate feedback." };
    } catch (e: unknown) {
        logger.error(`Quiz session feedback generation failed: ${e}`, e);
        throw new HttpsError("internal", `Quiz session feedback generation failed: ${(e as Error).message}`);
    }
});

export const getExpandedSearchTerms = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const { query } = request.data as { query: string };

    const prompt = `You are an AI assistant for a medical quiz app. Given a user's search query related to pediatric medicine, expand it into 3-5 closely related and relevant search terms. These terms should cover synonyms, related concepts, or narrower/broader categories that a student might also search for.
    CRITICAL: You MUST respond with ONLY a valid JSON array of strings. Do not include any conversational text outside the JSON.
    Example: ["septic shock", "distributive shock", "vasopressors"].
    
    USER_QUERY: "${query}"`;

    try {
        const result = await _quickModel.generateContent(prompt);
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) throw new HttpsError("internal", "AI model returned an empty response for search terms.");
        const terms = extractJson(responseText);
        if (!Array.isArray(terms)) throw new HttpsError("internal", "AI response for search terms was not a valid array.");
        return { terms: terms.slice(0, 5) };
    } catch (e: unknown) {
        logger.error(`Search term expansion failed: ${e}`, e);
        throw new HttpsError("internal", `Search term expansion failed: ${(e as Error).message}`);
    }
});

export const generateChapterSummary = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const { uploadIds: jobIds } = request.data as { uploadIds: string[] };

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
        throw new HttpsError("invalid-argument", "At least one job ID is required for summary generation.");
    }

    let combinedExtractedText = "";
    for (const jobId of jobIds) {
        const jobDoc = await db.collection('contentGenerationJobs').doc(jobId).get();
        if (jobDoc.exists) {
            const jobData = jobDoc.data() as ContentGenerationJob;
            if (jobData.sourceText) {
                combinedExtractedText += jobData.sourceText + "\n\n---\n\n";
            }
        }
    }

    if (!combinedExtractedText.trim()) {
        throw new HttpsError("not-found", "No extracted text found for the provided job IDs to summarize.");
    }

    const textToSummarize = combinedExtractedText.substring(0, Math.min(combinedExtractedText.length, 30000));

    const prompt = `You are an AI medical educator. Summarize the following raw medical text into concise, high-yield study notes for postgraduate pediatric students. Focus on key facts, concepts, and clinical pearls. Use Markdown formatting for readability (e.g., headings, bullet points).
    
    RAW TEXT: """${textToSummarize}"""`;

    try {
        const result = await _powerfulModel.generateContent(prompt);
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        return { summary: responseText || "Could not generate summary." };
    } catch (e: unknown) {
        logger.error(`Chapter summary generation failed: ${e}`, e);
        throw new HttpsError("internal", `Chapter summary generation failed: ${(e as Error).message}`);
    }
});

export const addFlashcardAttempt = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    ensureClientsInitialized();
    const userId = request.auth.uid;
    const { flashcardId, rating } = request.data as AddFlashcardAttemptCallableData;
    if (!flashcardId || !rating) throw new HttpsError("invalid-argument", "Flashcard ID and rating are required.");

    const attemptedFlashcardRef = db.collection("users").doc(userId).collection("attemptedFlashcards").doc(flashcardId);

    return db.runTransaction(async (transaction: Transaction) => {
        const attemptDoc = await transaction.get(attemptedFlashcardRef);

        let interval = 0;
        let easeFactor = 2.5;
        let reviews = 0;

        if (attemptDoc.exists) {
            const existingData = attemptDoc.data();
            interval = existingData.interval || 0;
            easeFactor = existingData.easeFactor || 2.5;
            reviews = existingData.reviews || 0;
        }

        reviews++;

        if (rating === 'again') {
            interval = 0;
            easeFactor = Math.max(1.3, easeFactor - 0.2);
        } else {
            let q = 3;
            if (rating === 'hard') q = 2;
            if (rating === 'easy') q = 4;

            if (q < 3) {
                interval = 0;
                easeFactor = Math.max(1.3, easeFactor - 0.20);
            } else {
                const newInterval = reviews === 1 ? 1 : reviews === 2 ? 6 : Math.round(interval * easeFactor);
                interval = newInterval;
                easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
            }
        }

        const nextReviewDate = new Date(Date.now() + interval * 24 * 60 * 60 * 1000);

        transaction.set(attemptedFlashcardRef, {
            flashcardId,
            rating,
            interval: interval,
            easeFactor: easeFactor,
            nextReviewDate: FieldValue.serverTimestamp(),
            lastAttempted: FieldValue.serverTimestamp(),
            reviews: reviews,
        });
    });
    return { success: true };
});

export const getHint = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const { mcqId } = request.data as { mcqId: string };

    const masterMcqDoc = await db.collection('MasterMCQ').doc(mcqId).get();
    const marrowMcqDoc = await db.collection('MarrowMCQ').doc(mcqId).get();
    const mcqDoc = masterMcqDoc.exists ? masterMcqDoc : marrowMcqDoc.exists ? marrowMcqDoc : null;

    if (!mcqDoc || !mcqDoc.exists) {
        throw new HttpsError("not-found", "MCQ not found.");
    }

    const mcq = mcqDoc.data() as MCQ;

    const prompt = `You are an AI medical tutor. Given the following multiple-choice question and its explanation, provide a concise hint that guides the student towards the correct answer without directly revealing it. The hint should encourage critical thinking.
    
    MCQ Question: "${mcq.question}"
    Options: ${JSON.stringify(mcq.options)}
    Explanation: "${mcq.explanation}"`;

    try {
        const result = await _quickModel.generateContent(prompt);
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        return { hint: responseText || "Could not generate a hint." };
    } catch (e: unknown) {
        logger.error(`Hint generation failed: ${e}`, e);
        throw new HttpsError("internal", `Hint generation failed: ${(e as Error).message}`);
    }
});

export const evaluateFreeTextAnswer = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const { mcqId, userAnswer } = request.data as { mcqId: string, userAnswer: string };

    const masterMcqDoc = await db.collection('MasterMCQ').doc(mcqId).get();
    const marrowMcqDoc = await db.collection('MarrowMCQ').doc(mcqId).get();
    const mcqDoc = masterMcqDoc.exists ? masterMcqDoc : marrowMcqDoc.exists ? marrowMcqDoc : null;

    if (!mcqDoc || !mcqDoc.exists) {
        throw new HttpsError("not-found", "MCQ not found.");
    }

    const mcq = mcqDoc.data() as MCQ;

    const prompt = `You are an AI medical tutor. Evaluate the user's free-text answer against the correct answer and explanation for a multiple-choice question. Determine if the user's answer is correct or incorrect, and provide brief, constructive feedback.
    CRITICAL: You MUST respond with ONLY a valid JSON object. {"isCorrect": boolean, "feedback": "string"}.
    
    MCQ Question: "${mcq.question}"
    Correct Answer: "${mcq.answer}"
    Explanation: "${mcq.explanation}"
    
    USER'S ANSWER: "${userAnswer}"`;

    try {
        const result = await _powerfulModel.generateContent(prompt);
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) throw new HttpsError("internal", "AI model returned an empty response for free text evaluation.");
        const parsedResponse = extractJson(responseText);
        return { isCorrect: !!parsedResponse.isCorrect, feedback: parsedResponse.feedback || "Could not generate feedback." };
    } catch (e: unknown) {
        logger.error(`Free text evaluation failed: ${e}`, e);
        throw new HttpsError("internal", `Free text evaluation failed: ${(e as Error).message}`);
    }
});

export const createFlashcardFromMcq = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    ensureClientsInitialized();
    const userId = request.auth.uid;
    const { mcqId } = request.data as { mcqId: string };

    const masterMcqDoc = await db.collection('MasterMCQ').doc(mcqId).get();
    const marrowMcqDoc = await db.collection('MarrowMCQ').doc(mcqId).get();
    const mcqDoc = masterMcqDoc.exists ? masterMcqDoc : marrowMcqDoc.exists ? marrowMcqDoc : null;

    if (!mcqDoc || !mcqDoc.exists) {
        throw new HttpsError("not-found", "MCQ not found to create flashcard from.");
    }

    const mcq = mcqDoc.data() as MCQ;

    const prompt = `You are an AI medical tutor. Convert the following multiple-choice question and its explanation into a single, concise flashcard. The 'front' should be a question or concept to be recalled, and the 'back' should be the answer or key details.
    CRITICAL: You MUST respond with ONLY a valid JSON object. {"front": "string", "back": "string"}.
    
    MCQ Question: "${mcq.question}"
    Correct Answer: "${mcq.answer}"
    Explanation: "${mcq.explanation}"`;

    let flashcardData: Partial<Flashcard>;

    try {
        const result = await _powerfulModel.generateContent(prompt);
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) throw new HttpsError("internal", "AI model returned an empty response for flashcard creation.");
        const parsedResponse = extractJson(responseText);
        flashcardData = {
            front: parsedResponse.front,
            back: parsedResponse.back,
            topicId: mcq.topicId,
            chapterId: mcq.chapterId,
            topicName: mcq.topicName,
            chapterName: mcq.chapterName,
            source: 'AI_Generated_From_MCQ',
            status: 'approved',
            creatorId: userId,
            createdAt: FieldValue.serverTimestamp() as any,
            tags: mcq.tags || [],
        };
    } catch (e: unknown) {
        logger.error(`Flashcard creation from MCQ failed: ${e}`, e);
        throw new HttpsError("internal", `Flashcard creation from MCQ failed: ${(e as Error).message}`);
    }

    const flashcardRef = db.collection('Flashcards').doc();
    await flashcardRef.set(flashcardData);

    return { flashcardId: flashcardRef.id, message: "Flashcard created successfully!" };
});

export const searchContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const { query: searchQuery, terms } = request.data as { query: string; terms: string[] };
    const searchTerms = Array.from(new Set([searchQuery, ...terms].filter(Boolean))).map(term => term.toLowerCase());

    if (searchTerms.length === 0) {
        return { mcqs: [], flashcards: [] };
    }

    const allMcqs: MCQ[] = [];
    const masterMcqSnap = await db.collection('MasterMCQ').where('status', '==', 'approved').get();
    const marrowMcqSnap = await db.collection('MarrowMCQ').where('status', '==', 'approved').get();
    masterMcqSnap.docs.forEach(doc => allMcqs.push({ id: doc.id, ...doc.data() } as MCQ));
    marrowMcqSnap.docs.forEach(doc => allMcqs.push({ id: doc.id, ...doc.data() } as MCQ));

    const allFlashcards: Flashcard[] = [];
    const flashcardSnap = await db.collection('Flashcards').where('status', '==', 'approved').get();
    flashcardSnap.docs.forEach(doc => allFlashcards.push({ id: doc.id, ...doc.data() } as Flashcard));

    const mcqResults = allMcqs.filter(mcq => {
        const searchableContent = [mcq.question, ...(mcq.options || []), mcq.explanation, ...(mcq.tags || [])].join(' ').toLowerCase();
        return searchTerms.some(term => searchableContent.includes(term));
    });

    const flashcardResults = allFlashcards.filter(flashcard => {
        const searchableContent = [flashcard.front, flashcard.back, ...(flashcard.tags || [])].join(' ').toLowerCase();
        return searchTerms.some(term => searchableContent.includes(term));
    });

    return { mcqs: mcqResults, flashcards: flashcardResults };
});

// =============================================================================
//
//   QUIZ SESSION MANAGEMENT (User-Facing)
//
// =============================================================================

export const getDueReviewItems = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const userId = request.auth.uid;
    const now = new Date();

    const dueMcqIds: string[] = [];
    const dueFlashcardIds: string[] = [];

    const mcqQuery = db.collection('users').doc(userId).collection('attemptedMCQs')
        .where('latestAttempt.nextReviewDate', '<=', now)
        .orderBy('latestAttempt.nextReviewDate', 'asc');

    const mcqSnapshot = await mcqQuery.get();
    mcqSnapshot.docs.forEach(doc => {
        const data = doc.data() as { latestAttempt?: Attempt; };
        if (data.latestAttempt?.nextReviewDate && data.latestAttempt.nextReviewDate.toDate() <= now) {
            dueMcqIds.push(doc.id);
        }
    });

    const flashcardQuery = db.collection('users').doc(userId).collection('attemptedFlashcards')
        .where('nextReviewDate', '<=', now)
        .orderBy('nextReviewDate', 'asc');

    const flashcardSnapshot = await flashcardQuery.get();
    flashcardSnapshot.docs.forEach(doc => {
        const data = doc.data() as { nextReviewDate?: admin.firestore.Timestamp; };
        if (data.nextReviewDate && data.nextReviewDate.toDate() <= now) {
            dueFlashcardIds.push(doc.id);
        }
    });

    return { dueMcqIds, dueFlashcardIds };
});


export const getActiveSession = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const userId = request.auth.uid;

    const userDocRef = db.collection('users').doc(userId);
    const userDocSnap = await userDocRef.get();
    const userData = userDocSnap.data();

    const activeSessionId = userData?.activeSessionId as string | undefined;

    if (activeSessionId) {
        const sessionRef = db.collection('quizSessions').doc(activeSessionId);
        const sessionSnap = await sessionRef.get();

        if (sessionSnap.exists) {
            const sessionData = sessionSnap.data();
            const expiresAt = (sessionData?.expiresAt as admin.firestore.Timestamp)?.toDate();
            if (expiresAt && new Date() < expiresAt) {
                return { sessionId: activeSessionId, sessionMode: sessionData?.mode as string };
            } else {
                await sessionRef.delete();
                await userDocRef.update({ activeSessionId: FieldValue.delete() });
                return { sessionId: null };
            }
        } else {
            await userDocRef.update({ activeSessionId: FieldValue.delete() });
            return { sessionId: null };
        }
    }
    return { sessionId: null };
});