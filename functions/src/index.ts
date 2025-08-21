// functions/src/index.ts
/* eslint-disable max-len */
import * as admin from "firebase-admin";
import { UserRecord } from "firebase-admin/auth";
import { FieldValue, Transaction, QueryDocumentSnapshot, Timestamp, FieldPath, DocumentData } from "firebase-admin/firestore";
import { onCall, CallableRequest, HttpsError, CallableOptions } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentUpdated, onDocumentDeleted, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as functionsV1 from "firebase-functions"; // Keep for onUserCreate trigger
import { ImageAnnotatorClient, protos } from "@google-cloud/vision";
import { VertexAI, GenerativeModel, Content } from "@google-cloud/vertexai";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as types from "@pediaquiz/types";
import * as Validation from "./utils/validation"; // Import Validation module

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

const LOCATION = "us-central1"; // Firebase Functions deploy region
const PROJECT_ID = "pediaquizapp"; // Your Firebase project ID

// Set global options for all V2 functions
setGlobalOptions({ region: LOCATION });

// AI and Vision clients - initialized lazily to save resources
let _vertexAI: VertexAI;
let _visionClient: ImageAnnotatorClient;
let _quickModel: GenerativeModel; // gemini-2.0-flash-lite-001 for quicker, cheaper tasks
let _powerfulModel: GenerativeModel; // gemini-2.5-flash for more complex, robust tasks

function ensureClientsInitialized() {
    if (!_vertexAI) {
        _vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
        // Keeping original Gemini models as requested
        _powerfulModel = _vertexAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        _quickModel = _vertexAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-001" });
        _visionClient = new ImageAnnotatorClient();
        logger.info("AI and Vision clients initialized.");
    }
}

// Constants for Gamification
const XP_PER_CORRECT_ANSWER = 10;
const LEVEL_UP_THRESHOLD = 500; // XP needed to advance to the next level (e.g., Level 1 requires 500 XP to reach Level 2)

// Callable Function Options
const HEAVY_FUNCTION_OPTIONS: CallableOptions = { cpu: 1, timeoutSeconds: 540, memory: "1GiB", region: LOCATION };
const LIGHT_FUNCTION_OPTIONS: CallableOptions = { timeoutSeconds: 120, memory: "512MiB", region: LOCATION };

/**
 * Extracts JSON content from a string, handling markdown code blocks.
 * @param rawText The raw string potentially containing a JSON markdown block or raw JSON.
 * @returns Parsed JSON object.
 * @throws HttpsError if JSON is invalid or not found.
 */
function extractJson(rawText: string): any {
    const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
        try { return JSON.parse(jsonMatch[1]); } catch (e: any) { logger.error("Failed to parse extracted JSON string:", { jsonString: jsonMatch[1], error: (e as Error).message }); throw new HttpsError("internal", "Invalid JSON from AI model (in markdown)."); }
    }
    // Fallback: try to parse the entire raw text as JSON if no markdown block is found
    try { return JSON.parse(rawText); } catch (e: any) { logger.error("Failed to parse raw text as JSON:", { rawText, error: (e as Error).message }); throw new HttpsError("internal", "Invalid JSON from AI model (raw text)."); }
}

/**
 * Normalizes a string name into a Firebase-friendly document ID (lowercase, underscores, no special chars).
 * @param name The input string.
 * @returns Normalized string.
 */
function normalizeId(name: string): string {
    if (typeof name !== 'string') {
        logger.warn(`Attempted to normalize a non-string value: ${name}. Returning 'unknown'.`);
        return 'unknown';
    }
    return name
        .trim()
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .toLowerCase()         // Convert to lowercase
        .replace(/[^a-z0-9_]/g, ''); // Remove any characters not alphanumeric or underscore
}

/**
 * Ensures the request is authenticated and returns the user's UID.
 * @param request CallableRequest object.
 * @returns User's UID.
 * @throws HttpsError if not authenticated.
 */
function ensureAuthenticated(request: CallableRequest): string {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }
    return request.auth.uid;
}

/**
 * Ensures the request is from an administrator and returns the user's UID.
 * @param request CallableRequest object.
 * @returns User's UID.
 * @throws HttpsError if not authenticated or not an admin.
 */
async function ensureAdmin(request: CallableRequest): Promise<string> {
    const userId = ensureAuthenticated(request);
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data()?.isAdmin) {
        throw new HttpsError('permission-denied', 'Only administrators can perform this action.');
    }
    return userId;
}

/**
 * Logs a user action to the 'logs' collection.
 * @param userId The ID of the user performing the action.
 * @param message A descriptive message of the action.
 * @param type The type of log ('info', 'warn', 'error').
 * @param context Optional additional data to log.
 */
async function logUserAction(userId: string | undefined, message: string, type: 'info' | 'warn' | 'error' = 'info', context?: Record<string, any>) {
    if (!userId) {
        logger.warn("Attempted to log user action without a valid userId.", { message, type, context });
        return;
    }
    try {
        await db.collection('logs').add({ userId, message, timestamp: FieldValue.serverTimestamp(), type, context: context || {} });
    } catch (e) {
        logger.error("Failed to write user log:", { userId, message, error: e });
    }
}

// --- Auth Triggers ---

// Creates a new user document in Firestore when a new user signs up via Firebase Auth.
export const onUserCreate = functionsV1.region(LOCATION).auth.user().onCreate(async (user: UserRecord) => {
    const userRef = db.collection("users").doc(user.uid);
    await userRef.set({
        uid: user.uid, email: user.email, displayName: user.displayName || "PediaQuiz User", createdAt: FieldValue.serverTimestamp(),
        lastLogin: FieldValue.serverTimestamp(), isAdmin: false, bookmarkedMcqs: [], bookmarkedFlashcards: [],
        xp: 0, level: 1, currentStreak: 0, lastStudiedDate: null, theme: 'default', badges: [],
    });
    logger.info(`New user created: ${user.uid} (${user.email})`);
    await logUserAction(user.uid, "Welcome! Your account has been created.");
});

// --- Storage Triggers (File Uploads for Content Generation) ---

/**
 * Triggered when a new file is uploaded to Firebase Storage in the 'uploads/{userId}/{fileName}' path.
 * This function processes the file (OCR for PDFs, reads text for TXT/DOCX) and
 * creates a content generation job in Firestore.
 */
export const onFileUploaded = onObjectFinalized({ cpu: 2, memory: "1GiB", timeoutSeconds: 300, bucket: "pediaquizapp.firebasestorage.app", }, async (event) => { // CRITICAL FIX: Updated bucket name
    ensureClientsInitialized();
    const { bucket, name, contentType } = event.data;

    // Guard against non-upload or directory objects
    if (!name || !name.startsWith("uploads/") || name.endsWith('/')) {
        logger.info("Skipping non-upload or directory object.", { name });
        return;
    }

    // Extract userId and fileName from the storage path
    const pathParts = name.split("/");
    if (pathParts.length < 3) {
        logger.warn("Invalid upload path format. Expected uploads/{userId}/{fileName}", { name });
        return;
    }
    const userId = pathParts[1];
    const fileName = path.basename(name);

    // Determine pipeline based on filename prefix (e.g., MARROW_file.pdf)
    const pipeline: types.ContentGenerationJob['pipeline'] = fileName.startsWith("MARROW_") ? 'marrow' : 'general';

    const jobRef = db.collection("contentGenerationJobs").doc(); // Create a new Firestore document for the job
    const newJob: Partial<types.ContentGenerationJob> = {
        id: jobRef.id,
        userId,
        fileName,
        createdAt: FieldValue.serverTimestamp(),
        pipeline,
        title: fileName.replace(/^(MARROW_|GENERAL_)\d+_/, '').split('.').slice(0, -1).join('.') || fileName, // Clean title from filename
        status: "pending_ocr" // Initial status
    };

    try {
        await jobRef.set(newJob);
        await logUserAction(userId, `File upload initiated: ${fileName}.`, 'info', { jobId: jobRef.id });

        let extractedText = "";
        const file = storage.bucket(bucket).file(name);

        // Process PDF files using Google Cloud Vision for OCR
        if (contentType === "application/pdf") {
            const gcsSourceUri = `gs://${bucket}/${name}`;
            const outputPrefix = `ocr_results/${jobRef.id}`;
            const gcsDestinationUri = `gs://${bucket}/${outputPrefix}/`; // Output location for OCR results

            const request: protos.google.cloud.vision.v1.IAsyncAnnotateFileRequest = {
                inputConfig: { gcsSource: { uri: gcsSourceUri }, mimeType: 'application/pdf' },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                outputConfig: { gcsDestination: { uri: gcsDestinationUri }, batchSize: 100 },
            };
            const [operation] = await _visionClient.asyncBatchAnnotateFiles({ requests: [request] });
            await operation.promise(); // Wait for OCR operation to complete

            // Retrieve OCR results from GCS
            const [files] = await storage.bucket(bucket).getFiles({ prefix: outputPrefix });
            // Sort files by name to ensure correct page order
            files.sort((a: any, b: any) => a.name.localeCompare(b.name));

            for (const file of files) {
                const [contents] = await file.download();
                const output = JSON.parse(contents.toString());
                (output.responses || []).forEach((pageResponse: protos.google.cloud.vision.v1.IAnnotateImageResponse) => {
                    if (pageResponse.fullTextAnnotation?.text) extractedText += pageResponse.fullTextAnnotation.text + "\n\n";
                });
            }
            // Clean up intermediate OCR results from GCS
            await storage.bucket(bucket).deleteFiles({ prefix: outputPrefix });
        }
        // Process plain text or DOCX (converted to text) files directly
        else if (contentType === "text/plain" || contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            const tempFilePath = path.join(os.tmpdir(), fileName);
            await file.download({ destination: tempFilePath });
            extractedText = fs.readFileSync(tempFilePath, "utf8");
            fs.unlinkSync(tempFilePath); // Clean up temp file
        }
        else {
            throw new HttpsError("invalid-argument", `Unsupported file type: ${contentType}.`);
        }

        // Check if extracted text is empty
        if (!extractedText.trim()) {
            throw new Error("Extracted text is empty or could not be read.");
        }

        // Update job status to 'processed' and save extracted text
        const updateData: Partial<types.ContentGenerationJob> = { sourceText: extractedText.trim(), updatedAt: FieldValue.serverTimestamp() };
        updateData.status = 'processed';
        await jobRef.update(updateData);
        logger.info(`OCR/Text extraction completed and job updated for ${jobRef.id}. Status: processed.`);
        await logUserAction(userId, `File ${fileName} processed (text extraction complete).`, 'info', { jobId: jobRef.id });

    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`File upload processing failed for ${name}: ${errorMessage}`, { error });
        // Update job status to 'error' and log the error message
        await jobRef.update({ status: "error", errors: FieldValue.arrayUnion(`Processing failed: ${errorMessage}`) }).catch(() => { });
        await logUserAction(userId, `File upload failed for ${fileName}: ${errorMessage}.`, 'error', { jobId: jobRef.id });
    }
});

// --- Firestore Triggers ---

/**
 * Triggered when a contentGenerationJob document is updated.
 * Handles state transitions for the content generation pipelines.
 */
export const onJobStatusChange = onDocumentUpdated({
    document: "contentGenerationJobs/{jobId}",
    cpu: 1,
    memory: "1GiB",
    timeoutSeconds: 540 // Allow sufficient time for AI operations
}, async (event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined, { jobId: string }>) => {
    ensureClientsInitialized();

    if (!event.data) {
        logger.warn(`Job status change event data was undefined for jobId: ${event.params.jobId}. Skipping execution.`);
        return;
    }

    const before = (event.data.before as QueryDocumentSnapshot<DocumentData>)?.data() as types.ContentGenerationJob | undefined;
    const after = (event.data.after as QueryDocumentSnapshot<DocumentData>)?.data() as types.ContentGenerationJob | undefined;

    // Only proceed if status has actually changed, or if it's 'generating_batch' (as it updates internally)
    if (!before || !after || (before.status === after.status && after.status !== 'generating_batch')) {
        return;
    }

    // Initial status determination after text extraction
    if (before.status === 'processed' && after.status === 'processed') {
        logger.info(`Job ${after.id}: Initial processing complete. Determining next pipeline step.`);
        if (after.pipeline === 'general') {
            await db.collection("contentGenerationJobs").doc(after.id).update({ status: 'pending_classification', updatedAt: FieldValue.serverTimestamp() });
            logger.info(`Job ${after.id}: General pipeline, status set to pending_classification.`);
            await logUserAction(after.userId, `Job ${after.title} (${after.id}) moved to pending AI classification.`, 'info', { pipeline: after.pipeline });
        } else if (after.pipeline === 'marrow') {
            await db.collection("contentGenerationJobs").doc(after.id).update({ status: 'pending_marrow_extraction', updatedAt: FieldValue.serverTimestamp() });
            logger.info(`Job ${after.id}: Marrow pipeline, status set to pending_marrow_extraction.`);
            await logUserAction(after.userId, `Job ${after.title} (${after.id}) moved to pending Marrow extraction.`, 'info', { pipeline: after.pipeline });
        }
    }
    // General Pipeline: AI Classification
    else if (after.status === 'pending_classification' && after.pipeline === 'general') {
        logger.info(`Job ${after.id}: Status is pending_classification. Starting AI classification.`);
        try {
            const prompt = `Analyze the following medical text content. Suggest a suitable General Topic Name (e.g., "Pediatric Cardiology", "General Pediatrics"), and a specific Chapter Name within that topic (e.g., "Congenital Heart Defects", "Vaccinations"). Also, estimate how many high-quality multiple-choice questions (MCQs) and flashcards could be generated from this content. Provide the output in strict JSON format like this:
            { "suggestedTopic": "Topic Name", "suggestedChapter": "Chapter Name", "estimatedMcqCount": 50, "estimatedFlashcardCount": 30 }.
            Keep topic and chapter names concise and relevant to pediatrics.
            Content: ${after.sourceText}`;

            const result = await _quickModel.generateContent(prompt); // Use quick model for classification
            const aiResponse = extractJson(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');

            await db.collection("contentGenerationJobs").doc(after.id).update({
                suggestedTopic: aiResponse.suggestedTopic || 'Uncategorized',
                suggestedChapter: aiResponse.suggestedChapter || 'Miscellaneous',
                suggestedPlan: {
                    mcqCount: aiResponse.estimatedMcqCount || 0,
                    flashcardCount: aiResponse.estimatedFlashcardCount || 0,
                },
                updatedAt: FieldValue.serverTimestamp(),
                status: 'pending_approval' // Move to admin approval after AI suggestion
            });
            logger.info(`Job ${after.id}: AI classification complete. Status updated to pending_approval.`);
            await logUserAction(after.userId, `AI classified job ${after.title} (${after.id}). Ready for approval.`, 'info', { suggestedTopic: aiResponse.suggestedTopic, suggestedChapter: aiResponse.suggestedChapter });
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Job ${after.id}: AI classification failed: ${errorMessage}`, { error });
            await db.collection("contentGenerationJobs").doc(after.id).update({
                status: 'error', errors: FieldValue.arrayUnion(`AI classification failed: ${errorMessage}`)
            });
            await logUserAction(after.userId, `AI classification failed for job ${after.title} (${after.id}): ${errorMessage}.`, 'error');
        }
    }
    // General Pipeline: Automated Batch Generation
    else if (after.status === 'generating_batch' && after.pipeline === 'general') {
        logger.info(`Job ${after.id}: Status is generating_batch. Executing automated batch generation.`);
        await logUserAction(after.userId, `Automated content generation started for job ${after.title} (${after.id}).`, 'info', { totalBatches: after.totalBatches });

        const totalBatches = after.textChunks?.length || 0;

        if (totalBatches === 0) {
            logger.warn(`Job ${after.id}: No text chunks found for batch generation. Setting to error.`);
            await db.collection("contentGenerationJobs").doc(after.id).update({ status: 'error', errors: FieldValue.arrayUnion('No text chunks for generation.') });
            await logUserAction(after.userId, `Batch generation failed for job ${after.title} (${after.id}): No text chunks.`, 'error', { batchError: 'No text chunks for generation.' }); // CRITICAL FIX: Pass error message explicitly for logging
            return;
        }

        let currentCompletedBatches = after.completedBatches || 0;
        let generationErrors: string[] = []; // Collect errors for partial failures
        let allGeneratedContent: { batchNumber: number; mcqs: Partial<types.MCQ>[]; flashcards: Partial<types.Flashcard>[]; }[] = after.generatedContent || [];

        // Loop through remaining batches to generate content
        for (let i = currentCompletedBatches; i < totalBatches; i++) {
            const chunk = after.textChunks?.[i];
            if (!chunk) continue; // Skip if chunk is undefined (shouldn't happen with correct loop)

            try {
                // Distribute MCQ/Flashcard generation targets proportionally across batches
                const mcqsPerBatch = Math.ceil((after.totalMcqCount || 0) / totalBatches);
                const flashcardsPerBatch = Math.ceil((after.totalFlashcardCount || 0) / totalBatches);

                const prompt = `Generate exactly ${mcqsPerBatch} high-quality multiple-choice questions and ${flashcardsPerBatch} informative flashcards from the following medical text chunk. Ensure MCQs have a clear question, 4 distinct options (A, B, C, D), a single correct answer letter, and a detailed explanation focusing on clinical relevance and key concepts. Make them challenging but fair, with plausible distractors. Assign 3-5 relevant, specific tags (e.g., 'anatomy', 'pathology', 'pharmacology', 'management') to each MCQ. Assign a difficulty level (easy, medium, hard). All tags should be lowercase. Provide the output in strict JSON format:
                {
                  "mcqs": [
                    { "question": "...", "options": ["...", "...", "...", "..."], "answer": "A", "explanation": "...", "tags": ["...", "..."], "difficulty": "medium" }
                  ],
                  "flashcards": [
                    { "front": "...", "back": "...", "tags": ["...", "..."], "mnemonic": "..." }
                  ]
                }.
                Use the provided chunk of source text: ${chunk}`;

                const result = await _powerfulModel.generateContent(prompt); // Use powerful model for content generation
                const generatedBatch = extractJson(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');

                const generatedMcqs = (generatedBatch.mcqs || []).map((mcq: Partial<types.MCQ>) => ({
                    ...mcq,
                    source: 'AI_Generated',
                    difficulty: mcq.difficulty || 'medium',
                    tags: (mcq.tags || []).map(tag => tag.toLowerCase()), // Ensure tags are lowercase
                }));
                const generatedFlashcards = (generatedBatch.flashcards || []).map((fc: Partial<types.Flashcard>) => ({
                    ...fc,
                    source: 'AI_Generated',
                    mnemonic: fc.mnemonic || undefined,
                    tags: (fc.tags || []).map(tag => tag.toLowerCase()), // Ensure tags are lowercase
                }));

                allGeneratedContent.push({ batchNumber: i + 1, mcqs: generatedMcqs, flashcards: generatedFlashcards });
                currentCompletedBatches++;
                logger.info(`Job ${after.id}: Batch ${i + 1}/${totalBatches} generated successfully.`);

                // Update job document after each batch to save progress
                await db.collection("contentGenerationJobs").doc(after.id).update({
                    generatedContent: allGeneratedContent,
                    completedBatches: currentCompletedBatches,
                    updatedAt: FieldValue.serverTimestamp(),
                });

            } catch (batchError: any) {
                const errorMessage = `Batch ${i + 1} failed: ${batchError.message || 'Unknown error'}`;
                logger.error(`Job ${after.id}: ${errorMessage}`, { batchError });
                generationErrors.push(errorMessage); // CRITICAL FIX: Add error to array
                // If a batch fails, update status to partial failure and break the loop
                await db.collection("contentGenerationJobs").doc(after.id).update({
                    status: 'generation_failed_partially', errors: FieldValue.arrayUnion(errorMessage)
                });
                await logUserAction(after.userId, `Batch ${i + 1} generation failed for job ${after.title} (${after.id}): ${errorMessage}.`, 'error', { batchError: errorMessage });
                break; // Stop further batch processing on first failure
            }
        }

        // After loop, check if all batches completed
        if (currentCompletedBatches === totalBatches) {
            await db.collection("contentGenerationJobs").doc(after.id).update({ status: 'pending_final_review', updatedAt: FieldValue.serverTimestamp() });
            logger.info(`Job ${after.id}: All batches processed. Status updated to pending_final_review.`);
            await logUserAction(after.userId, `All batches generated for job ${after.title} (${after.id}). Ready for final review.`, 'info');
        } else if (generationErrors.length > 0 && currentCompletedBatches < totalBatches) {
            logger.warn(`Job ${after.id}: Batch generation finished with partial failures.`);
            await logUserAction(after.userId, `Batch generation finished with partial failures for job ${after.title} (${after.id}).`, 'warn', { errors: generationErrors });
        }
    }
});

// Clears activeSessionId from user doc when a quiz session is deleted (e.g., on expiry or manual finish).
export const onSessionDeleted = onDocumentDeleted({
    document: "quizSessions/{sessionId}"
}, async (event) => {
    const sessionData = event.data?.data();
    if (!sessionData) {
        logger.warn(`onSessionDeleted trigger fired but no data found for session ${event.params.sessionId}.`);
        return;
    }

    const userId = sessionData.userId;
    const sessionId = event.params.sessionId;

    const userRef = db.collection('users').doc(userId);
    try {
        await userRef.update({
            activeSessionId: FieldValue.delete() // Remove the activeSessionId field
        });
        logger.info(`Cleared activeSessionId for user ${userId} after session ${sessionId} was deleted.`);
    }
    // CRITICAL FIX: Ensure errorMessage is correctly defined in this catch block
    catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error clearing activeSessionId for user ${userId}: ${errorMessage}`, { error });
    }
});

// --- Callable Functions (Main API Endpoints) ---

// Adds a completed quiz result and updates user's XP, Level, and daily streak.
export const addquizresult = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const quizData = Validation.validateInput(Validation.QuizResultSchema, request.data);
    const userId = ensureAuthenticated(request);

    const resultRef = db.collection('quizResults').doc();
    await resultRef.set({ ...quizData, id: resultRef.id, userId, quizDate: FieldValue.serverTimestamp() });

    const userRef = db.collection('users').doc(userId);
    await db.runTransaction(async (transaction: Transaction) => {
        const userDoc = await transaction.get(userRef);
        const userData = userDoc.data() as types.User;

        let currentStreak = userData?.currentStreak || 0;
        const lastStudiedDate = userData?.lastStudiedDate instanceof Timestamp ? userData.lastStudiedDate.toDate() : null;
        let currentXp = userData?.xp || 0;
        let currentLevel = userData?.level || 1;
        let xpEarned = quizData.xpEarned || 0; // If frontend provides XP, use it, otherwise calculate
        let streakBonus = 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today to start of day

        let newCalculatedStreak = currentStreak;
        if (lastStudiedDate) {
            const lastStudyDay = new Date(lastStudiedDate);
            lastStudyDay.setHours(0, 0, 0, 0); // Normalize last study date to start of day

            const diffTime = Math.abs(today.getTime() - lastStudyDay.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 0) { // Already studied today, streak doesn't change from this action
                // No change to streak or bonus from new quiz result if already studied today
            } else if (diffDays === 1) { // Studied yesterday, continue streak
                newCalculatedStreak++;
                streakBonus = Math.min(newCalculatedStreak * 5, 100); // Streak bonus caps at 100 XP
            } else { // More than 1 day passed, streak broken, new streak starts
                newCalculatedStreak = 1;
                streakBonus = 5; // First day of new streak gets small bonus
            }
        } else { // First time studying
            newCalculatedStreak = 1;
            streakBonus = 5;
        }
        currentStreak = newCalculatedStreak;

        currentXp += xpEarned + streakBonus; // Add calculated XP and bonus to total XP

        // Level up logic
        while (currentXp >= currentLevel * LEVEL_UP_THRESHOLD) {
            currentXp -= currentLevel * LEVEL_UP_THRESHOLD; // Deduct XP for the current level
            currentLevel++; // Increment level
            const newBadge = `Level ${currentLevel} Achiever`; // Example badge
            if (!(userData?.badges || []).includes(newBadge)) {
                transaction.update(userRef, { badges: FieldValue.arrayUnion(newBadge) });
                logger.info(`User ${userId} earned badge: ${newBadge}`);
                await logUserAction(userId, `Earned new badge: ${newBadge}.`, 'info', { badge: newBadge });
            }
            await logUserAction(userId, `Leveled up to Level ${currentLevel}!`, 'info', { newLevel: currentLevel });
        }

        // Update user document with new streak, XP, level, and last studied date
        transaction.update(userRef, {
            currentStreak: currentStreak,
            lastStudiedDate: FieldValue.serverTimestamp(),
            xp: currentXp,
            level: currentLevel,
        });

        // Update quiz result document with actual XP earned and streak bonus
        transaction.update(resultRef, { xpEarned, streakBonus });
    });

    logger.info(`Quiz result added for user ${userId}, id: ${resultRef.id}`);
    await logUserAction(userId, `Completed a quiz in ${quizData.mode} mode. Score: ${quizData.score}/${quizData.totalQuestions}.`, 'info', { quizId: resultRef.id, mode: quizData.mode });
    return { success: true, id: resultRef.id };
});

// Records an MCQ attempt and updates SM-2 (Spaced Repetition) data for the MCQ.
// Also updates user XP/Level and daily streak.
export const addattempt = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const attemptData = Validation.validateInput(Validation.AddAttemptCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const attemptedMcqRef = db.collection("users").doc(userId).collection("attemptedMCQs").doc(attemptData.mcqId);
    const userRef = db.collection('users').doc(userId);

    let mcqDocSnap;
    mcqDocSnap = await db.collection("MasterMCQ").doc(attemptData.mcqId).get();
    if (!mcqDocSnap.exists) {
        mcqDocSnap = await db.collection("MarrowMCQ").doc(attemptData.mcqId).get();
    }
    // CRITICAL FIX: Corrected variable name from mcqSnap to mcqDocSnap
    if (!mcqDocSnap.exists) {
        throw new HttpsError('not-found', `MCQ with ID ${attemptData.mcqId} not found.`);
    }
    const mcqData = mcqDocSnap.data() as types.MCQ;

    return db.runTransaction(async (transaction: Transaction) => {
        const attemptDoc = await transaction.get(attemptedMcqRef);
        const userDoc = await transaction.get(userRef);

        // Fetch current session data for validation if session ID is provided
        if (attemptData.sessionId) {
            const sessionRef = db.collection('quizSessions').doc(attemptData.sessionId);
            const sessionDoc = await transaction.get(sessionRef);
            if (!sessionDoc.exists || sessionDoc.data()?.userId !== userId) {
                throw new HttpsError('permission-denied', 'Session not found or does not belong to user.');
            }
            const sessionData = sessionDoc.data() as types.QuizSession;

            // CRITICAL FIX: Prevent submitting answers for questions already answered in this session
            // Check if the current MCQ ID has an answer recorded in the session's answers map
            const mcqIndexInSession = sessionData.mcqIds.indexOf(attemptData.mcqId);
            if (mcqIndexInSession !== -1 && sessionData.answers && sessionData.answers[mcqIndexInSession] !== undefined && sessionData.answers[mcqIndexInSession] !== null) {
                 throw new HttpsError('failed-precondition', `MCQ ${attemptData.mcqId} already answered in this session.`);
            }
            // CRITICAL FIX: Ensure mcqId matches the current question in the session.
            // This prevents out-of-order submissions if client-side state is out of sync.
            const expectedMcqId = sessionData.mcqIds[sessionData.currentIndex];
            if (expectedMcqId && expectedMcqId !== attemptData.mcqId) {
                logger.warn(`Attempted MCQ ${attemptData.mcqId} does not match expected current session MCQ ${expectedMcqId}.`);
                throw new HttpsError('failed-precondition', 'Attempted MCQ does not match current session question.');
            }
        }


        // SM-2 Algorithm variables
        let interval = 0, easeFactor = 2.5, repetitions = 0;
        let totalAttempts = 0, totalCorrect = 0, totalIncorrect = 0;
        let currentXp = userDoc.data()?.xp || 0;
        let currentLevel = userDoc.data()?.level || 1;
        let xpGainedThisAttempt = 0;

        if (attemptDoc.exists) {
            const existingAttemptDocData = attemptDoc.data() as types.AttemptedMCQDocument;
            const existingData = existingAttemptDocData.latestAttempt;
            if (existingData) {
                interval = existingData.interval || 0;
                easeFactor = existingData.easeFactor || 2.5;
                repetitions = existingData.repetitions || 0;
                totalAttempts = existingAttemptDocData.attempts || 0;
                totalCorrect = existingAttemptDocData.correct || 0;
                totalIncorrect = existingAttemptDocData.incorrect || 0;
            }
        }

        totalAttempts++;
        if (attemptData.isCorrect) {
            repetitions++;
            if (repetitions === 1) interval = 1; // First correct recall
            else if (repetitions === 2) interval = 6; // Second correct recall
            else interval = Math.round(interval * easeFactor); // Subsequent correct recalls

            // Update ease factor based on confidence rating
            // Confidence: 5=Easy, 4=Good, 3=Hard, 1=Again (incorrect)
            const quality = attemptData.confidenceRating === 'easy' ? 5 :
                            attemptData.confidenceRating === 'good' ? 4 :
                            attemptData.confidenceRating === 'hard' ? 3 :
                            attemptData.isCorrect ? 3 : 1; // Default for correct, or for 'again' / incorrect

            easeFactor += (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
            totalCorrect++;
            xpGainedThisAttempt = XP_PER_CORRECT_ANSWER;
        } else {
            repetitions = 0; // Reset repetitions on incorrect answer
            interval = 1; // Schedule for next day
            easeFactor = Math.max(1.3, easeFactor - 0.2); // Decrease ease factor, minimum 1.3
            totalIncorrect++;
            xpGainedThisAttempt = Math.floor(XP_PER_CORRECT_ANSWER * 0.2); // Less XP for incorrect
        }
        easeFactor = Math.max(1.3, easeFactor); // Ensure ease factor doesn't drop below 1.3

        const nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + interval); // Calculate next review date

        // Prepare new attempt record
        const newAttempt: types.Attempt = {
            mcqId: attemptData.mcqId, isCorrect: attemptData.isCorrect, selectedAnswer: attemptData.selectedAnswer || null, sessionId: attemptData.sessionId || '', confidenceRating: attemptData.confidenceRating,
            timestamp: FieldValue.serverTimestamp() as Timestamp, userId,
            interval, easeFactor, repetitions,
            nextReviewDate: Timestamp.fromDate(nextReviewDate),
            lastAttempted: FieldValue.serverTimestamp() as Timestamp,
            topicId: mcqData.topicId,
            chapterId: mcqData.chapterId,
        };

        // Update the attempted MCQ document in the subcollection
        const currentHistory = attemptDoc.exists ? (attemptDoc.data() as types.AttemptedMCQDocument).history : [];
        // Ensure history does not grow indefinitely - keep a reasonable number of past attempts
        const MAX_HISTORY_LENGTH = 10;
        const updatedHistory = (currentHistory.length >= MAX_HISTORY_LENGTH ? currentHistory.slice(1) : currentHistory).concat(attemptDoc.exists ? [(attemptDoc.data() as types.AttemptedMCQDocument).latestAttempt] : []);


        const newAttemptedMCQDocument: types.AttemptedMCQDocument = {
            id: attemptData.mcqId,
            latestAttempt: newAttempt,
            history: updatedHistory, // Store previous latestAttempt in history
            attempts: totalAttempts,
            correct: totalCorrect,
            incorrect: totalIncorrect,
            createdAt: attemptDoc.exists ? (attemptDoc.data() as types.AttemptedMCQDocument).createdAt : FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };

        transaction.set(attemptedMcqRef, newAttemptedMCQDocument, { merge: true });

        // Update user's XP and Level
        currentXp += xpGainedThisAttempt;
        while (currentXp >= currentLevel * LEVEL_UP_THRESHOLD) {
            currentXp -= currentLevel * LEVEL_UP_THRESHOLD;
            currentLevel++;
            const newBadge = `Level ${currentLevel} Achiever`; // Example badge logic
            if (!(userDoc.data()?.badges || []).includes(newBadge)) {
                transaction.update(userRef, { badges: FieldValue.arrayUnion(newBadge) });
                logger.info(`User ${userId} earned badge: ${newBadge}`);
                await logUserAction(userId, `Earned new badge: ${newBadge}.`, 'info', { badge: newBadge });
            }
            await logUserAction(userId, `Leveled up to Level ${currentLevel}!`, 'info', { newLevel: currentLevel });
        }

        // CRITICAL FIX: Update user's daily streak on each attempt if not already studied today
        const userData = userDoc.data() as types.User;
        let userCurrentStreak = userData?.currentStreak || 0;
        const userLastStudiedDate = userData?.lastStudiedDate instanceof Timestamp ? userData.lastStudiedDate.toDate() : null;

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today to start of day

        let streakShouldUpdate = false; // Flag to determine if streak fields need updating
        if (userLastStudiedDate) {
            const lastStudyDay = new Date(userLastStudiedDate);
            lastStudyDay.setHours(0, 0, 0, 0); // Normalize last study date to start of day

            const diffTime = Math.abs(today.getTime() - lastStudyDay.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 0) { // Already studied today
                // Streak is already counted for today, do nothing
            } else if (diffDays === 1) { // Studied yesterday, continue streak
                userCurrentStreak++;
                streakShouldUpdate = true;
            } else { // More than 1 day passed, streak broken, new streak starts
                userCurrentStreak = 1;
                streakShouldUpdate = true;
            }
        } else { // First ever study activity
            userCurrentStreak = 1;
            streakShouldUpdate = true;
        }

        // Only update lastStudiedDate and currentStreak if a new streak day is recorded
        const userUpdates: { xp: number, level: number, currentStreak?: number, lastStudiedDate?: FieldValue } = { xp: currentXp, level: currentLevel };
        if (streakShouldUpdate) {
            userUpdates.currentStreak = userCurrentStreak;
            userUpdates.lastStudiedDate = FieldValue.serverTimestamp();
        }

        transaction.update(userRef, userUpdates);

        logger.info(`MCQ attempt recorded for user ${userId} on MCQ ${attemptData.mcqId}. Correct: ${attemptData.isCorrect}. XP gained: ${xpGainedThisAttempt}.`);
        await logUserAction(userId, `Attempted MCQ ${attemptData.mcqId}: ${attemptData.isCorrect ? 'Correct' : 'Incorrect'}. XP: ${xpGainedThisAttempt}.`, 'info', { mcqId: attemptData.mcqId, isCorrect: attemptData.isCorrect, xpGained: xpGainedThisAttempt });
    });
    return { success: true };
});

// Records a Flashcard attempt and updates SM-2 data for the Flashcard.
// Also updates user XP/Level and daily streak.
export const addFlashcardAttempt = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const flashcardAttemptData = Validation.validateInput(Validation.AddFlashcardAttemptCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const attemptedFlashcardRef = db.collection("users").doc(userId).collection("attemptedFlashcards").doc(flashcardAttemptData.flashcardId);
    const userRef = db.collection('users').doc(userId);

    return db.runTransaction(async (transaction: Transaction) => {
        const attemptDoc = await transaction.get(attemptedFlashcardRef);
        const userDoc = await transaction.get(userRef);

        // SM-2 Algorithm variables
        let interval = 0, easeFactor = 2.5, repetitions = 0, reviews = 0;
        let currentXp = userDoc.data()?.xp || 0;
        let currentLevel = userDoc.data()?.level || 1;
        let xpGainedThisAttempt = 0;

        if (attemptDoc.exists) {
            const existingData = attemptDoc.data() as types.FlashcardAttempt;
            interval = existingData.interval || 0;
            easeFactor = existingData.easeFactor || 2.5;
            repetitions = existingData.repetitions || 0;
            reviews = existingData.reviews || 0;
        }

        reviews++;
        if (flashcardAttemptData.rating === 'again') {
            repetitions = 0; // Reset repetitions on 'again' (incorrect)
            interval = 1; // Schedule for next day
            easeFactor = Math.max(1.3, easeFactor - 0.2); // Decrease ease factor, minimum 1.3
            xpGainedThisAttempt = Math.floor(XP_PER_CORRECT_ANSWER * 0.1); // Less XP for 'again'
        } else {
            repetitions++;
            if (repetitions === 1) interval = 1; // First correct recall
            else if (repetitions === 2) interval = 6; // Second correct recall
            else interval = Math.round(interval * easeFactor); // Subsequent correct recalls

            // Update ease factor based on confidence rating
            // Confidence: 5=Easy, 4=Good, 3=Hard (incorrect in context of SM-2)
            const quality = flashcardAttemptData.rating === 'easy' ? 5 :
                            flashcardAttemptData.rating === 'good' ? 4 :
                            flashcardAttemptData.rating === 'hard' ? 3 : 1; // Default for other cases (e.g., if rating is not recognized)


            easeFactor += (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
            xpGainedThisAttempt = XP_PER_CORRECT_ANSWER * (quality / 5); // XP scales with quality
        }
        easeFactor = Math.max(1.3, easeFactor); // Ensure ease factor doesn't drop below 1.3

        const nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + interval); // Calculate next review date

        // Prepare new attempt record
        const newAttempt: types.FlashcardAttempt = {
            flashcardId: flashcardAttemptData.flashcardId, rating: flashcardAttemptData.rating, timestamp: FieldValue.serverTimestamp() as Timestamp,
            interval, easeFactor, repetitions, reviews,
            nextReviewDate: Timestamp.fromDate(nextReviewDate),
            lastAttempted: FieldValue.serverTimestamp() as Timestamp,
        };
        transaction.set(attemptedFlashcardRef, newAttempt, { merge: true });

        // Update user's XP and Level
        currentXp += xpGainedThisAttempt;
        while (currentXp >= currentLevel * LEVEL_UP_THRESHOLD) {
            currentXp -= currentLevel * LEVEL_UP_THRESHOLD;
            currentLevel++;
            const newBadge = `Level ${currentLevel} Achiever`; // Example badge logic
            if (!(userDoc.data()?.badges || []).includes(newBadge)) {
                transaction.update(userRef, { badges: FieldValue.arrayUnion(newBadge) });
                logger.info(`User ${userId} earned badge: ${newBadge}`);
                await logUserAction(userId, `Earned new badge: ${newBadge}.`, 'info', { badge: newBadge });
            }
            await logUserAction(userId, `Leveled up to Level ${currentLevel}!`, 'info', { newLevel: currentLevel });
        }

        // CRITICAL FIX: Update user's daily streak on each attempt if not already studied today
        const userData = userDoc.data() as types.User;
        let userCurrentStreak = userData?.currentStreak || 0;
        const userLastStudiedDate = userData?.lastStudiedDate instanceof Timestamp ? userData.lastStudiedDate.toDate() : null;

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today to start of day

        let streakShouldUpdate = false; // Flag to determine if streak fields need updating
        if (userLastStudiedDate) {
            const lastStudyDay = new Date(userLastStudiedDate);
            lastStudyDay.setHours(0, 0, 0, 0); // Normalize last study date to start of day

            const diffTime = Math.abs(today.getTime() - lastStudyDay.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 0) { // Already studied today
                // Streak is already counted for today, do nothing
            } else if (diffDays === 1) { // Studied yesterday, continue streak
                userCurrentStreak++;
                streakShouldUpdate = true;
            } else { // More than 1 day passed, streak broken, new streak starts
                userCurrentStreak = 1;
                streakShouldUpdate = true;
            }
        } else { // First ever study activity
            userCurrentStreak = 1;
            streakShouldUpdate = true;
        }

        // Only update lastStudiedDate and currentStreak if a new streak day is recorded
        const userUpdates: { xp: number, level: number, currentStreak?: number, lastStudiedDate?: FieldValue } = { xp: currentXp, level: currentLevel };
        if (streakShouldUpdate) {
            userUpdates.currentStreak = userCurrentStreak;
            userUpdates.lastStudiedDate = FieldValue.serverTimestamp();
        }

        transaction.update(userRef, userUpdates);

        logger.info(`Flashcard attempt recorded for user ${userId} on Flashcard ${flashcardAttemptData.flashcardId} with rating ${flashcardAttemptData.rating}. XP gained: ${xpGainedThisAttempt}.`);
        await logUserAction(userId, `Attempted Flashcard ${flashcardAttemptData.flashcardId}. Rating: ${flashcardAttemptData.rating}. XP: ${xpGainedThisAttempt}.`, 'info', { flashcardId: flashcardAttemptData.flashcardId, rating: flashcardAttemptData.rating, xpGained: xpGainedThisAttempt });
    });
    return { success: true };
});

// Toggles bookmark status for an MCQ or Flashcard.
export const togglebookmark = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const bookmarkData = Validation.validateInput(Validation.ToggleBookmarkCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const userRef = db.collection("users").doc(userId);

    // Determine which field to update based on content type
    const fieldToUpdate = bookmarkData.contentType === 'mcq' ? 'bookmarkedMcqs' : 'bookmarkedFlashcards';

    const userDoc = await userRef.get();
    const currentBookmarks = userDoc.data()?.[fieldToUpdate] || [];
    let bookmarkedStatus = false;
    let logMessage = "";

    if (currentBookmarks.includes(bookmarkData.contentId)) {
        // If content is already bookmarked, remove it
        await userRef.update({ [fieldToUpdate]: FieldValue.arrayRemove(bookmarkData.contentId) });
        bookmarkedStatus = false;
        logMessage = `Removed bookmark for ${bookmarkData.contentType} ${bookmarkData.contentId}.`;
        logger.info(logMessage);
    } else {
        // If content is not bookmarked, add it
        await userRef.update({ [fieldToUpdate]: FieldValue.arrayUnion(bookmarkData.contentId) });
        bookmarkedStatus = true;
        logMessage = `Added bookmark for ${bookmarkData.contentType} ${bookmarkData.contentId}.`;
        logger.info(logMessage);
    }

    await logUserAction(userId, logMessage, 'info', { contentId: bookmarkData.contentId, contentType: bookmarkData.contentType, bookmarked: bookmarkedStatus });

    // Return the updated arrays for frontend reconciliation
    const updatedUserDoc = await userRef.get();
    return {
        bookmarked: bookmarkedStatus,
        bookmarkedMcqs: updatedUserDoc.data()?.bookmarkedMcqs || [],
        bookmarkedFlashcards: updatedUserDoc.data()?.bookmarkedFlashcards || []
    };
});

// Archives (soft-deletes) an MCQ or Flashcard and cleans up related user references.
export const deletecontentitem = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const deleteItemData = Validation.validateInput(Validation.DeleteContentItemCallableDataSchema, request.data);
    const userId = await ensureAdmin(request); // Ensure only admins can call this

    // Determine the collection to modify
    const contentRef = db.collection(deleteItemData.collectionName).doc(deleteItemData.id);
    const contentDoc = await contentRef.get();

    if (!contentDoc.exists) {
        throw new HttpsError('not-found', `${deleteItemData.type.toUpperCase()} not found.`);
    }

    // Get content metadata to update topic/chapter counts and identify related user data
    const contentData = contentDoc.data() as types.MCQ | types.Flashcard;
    const topicId = normalizeId(contentData.topicId || contentData.topicName);
    const chapterId = normalizeId(contentData.chapterId || contentData.chapterName);
    const source = contentData.source?.startsWith('Marrow') ? 'Marrow' : 'General';
    const contentId = deleteItemData.id;

    try {
        await db.runTransaction(async (transaction) => {
            // CRITICAL FIX: Change from delete() to update({status: 'archived'})
            transaction.update(contentRef, { status: 'archived', updatedAt: FieldValue.serverTimestamp() });

            // Update topic/chapter counts
            const topicCollectionRef = source === 'Marrow' ? db.collection('MarrowTopics') : db.collection('Topics');
            const topicRef = topicCollectionRef.doc(topicId);
            const topicDocSnap = await transaction.get(topicRef);

            if (topicDocSnap.exists) {
                const currentTopicData = topicDocSnap.data() as types.Topic;

                let mcqDelta = (deleteItemData.type === 'mcq') ? -1 : 0;
                let flashcardDelta = (deleteItemData.type === 'flashcard') ? -1 : 0;

                if (source === 'Marrow') {
                    // For Marrow topics, chapters are objects with counts
                    let chapters: types.Chapter[] = (currentTopicData.chapters as types.Chapter[] || []).filter(ch => ch && typeof ch === 'object');
                    chapters = chapters.map(ch => {
                        if (normalizeId(ch.name) === chapterId) {
                            return { ...ch, mcqCount: Math.max(0, (ch.mcqCount || 0) + mcqDelta), flashcardCount: Math.max(0, (ch.flashcardCount || 0) + flashcardDelta) };
                        }
                        return ch;
                    });
                    transaction.update(topicRef, { chapters: chapters });
                } else { // General topics, chapters are strings, counts are only on topic level
                    // No chapter-specific updates needed for string arrays.
                    // The overall topic counts will be decremented.
                }

                // Update total topic counts regardless of chapter type
                transaction.update(topicRef, {
                    totalMcqCount: FieldValue.increment(mcqDelta),
                    totalFlashcardCount: FieldValue.increment(flashcardDelta),
                    updatedAt: FieldValue.serverTimestamp()
                });
            } else {
                logger.warn(`Topic ${topicId} not found when trying to update counts for archived item ${deleteItemData.id}.`);
            }

            // CRITICAL FIX: Remove orphaned references from user bookmarks and attemptedMCQs/Flashcards
            // Remove from user bookmarks (array-remove from user doc)
            const usersWithBookmarkQuery = db.collection('users')
                .where(deleteItemData.type === 'mcq' ? 'bookmarkedMcqs' : 'bookmarkedFlashcards', 'array-contains', contentId);
            const usersSnapshot = await usersWithBookmarkQuery.get();
            usersSnapshot.docs.forEach(userDoc => {
                const userRef = userDoc.ref;
                transaction.update(userRef, {
                    [deleteItemData.type === 'mcq' ? 'bookmarkedMcqs' : 'bookmarkedFlashcards']: FieldValue.arrayRemove(contentId)
                });
            });

            // Remove from user's attempted MCQs/Flashcards subcollections (hard delete records)
            if (deleteItemData.type === 'mcq') {
                const attemptedMcqSnap = await db.collectionGroup('attemptedMCQs').where(FieldPath.documentId(), '==', contentId).get();
                attemptedMcqSnap.docs.forEach(doc => transaction.delete(doc.ref));
            } else { // flashcard
                const attemptedFlashcardSnap = await db.collectionGroup('attemptedFlashcards').where(FieldPath.documentId(), '==', contentId).get();
                attemptedFlashcardSnap.docs.forEach(doc => transaction.delete(doc.ref));
            }
        });

        await logUserAction(userId, `Archived ${deleteItemData.type} ${deleteItemData.id} from ${deleteItemData.collectionName}.`, 'warn', { contentId: deleteItemData.id, type: deleteItemData.type, collectionName: deleteItemData.collectionName });
        return { success: true, message: `${deleteItemData.type.toUpperCase()} archived.` };
    } catch (error: any) {
        // CRITICAL FIX: Corrected variable name from errorMessage
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error archiving ${deleteItemData.type} ${deleteItemData.id}:`, { error });
        await logUserAction(userId, `Failed to archive ${deleteItemData.type} ${deleteItemData.id}: ${errorMessage}.`, 'error', { contentId: deleteItemData.id, type: deleteItemData.type, error: errorMessage });
        throw new HttpsError('internal', `Failed to archive content: ${errorMessage}`);
    }
});


// Allows users to chat with an AI assistant.
export const chatWithAssistant = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const chatData = Validation.validateInput(Validation.ChatWithAssistantCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    // Construct chat history for the AI model
    const chatHistoryForAI: Content[] = chatData.history.map((message: types.ChatMessage) => ({ role: message.sender === 'user' ? 'user' : 'model', parts: [{ text: message.text }] }));

    // Add context if provided (e.g., specific MCQ/Chapter notes)
    let contextPrompt = '';
    if (chatData.context?.mcqId) {
        // Fetch MCQ content (question, explanation)
        const mcqDoc = await db.collection('MasterMCQ').doc(chatData.context.mcqId).get();
        const mcqData = mcqDoc.exists ? mcqDoc.data() : null;
        if (mcqData) contextPrompt += `\n\nContext: This conversation is about the MCQ "${mcqData.question}". Explanation: "${mcqData.explanation || ''}".`;
    } else if (chatData.context?.chapterId && chatData.context?.chapterNotes) {
        contextPrompt += `\n\nContext: This conversation is about chapter notes for chapter ${chatData.context.chapterId}. Notes: "${chatData.context.chapterNotes}".`;
    }


    // Initialize chat session with history and send the current prompt
    const chat = _powerfulModel.startChat({ history: chatHistoryForAI });
    const result = await chat.sendMessage(chatData.prompt + contextPrompt);
    const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";
    logger.info(`AI chat response generated. Prompt: "${chatData.prompt.substring(0, Math.min(chatData.prompt.length, 50))}..."`);
    await logUserAction(userId, `Chatted with AI assistant.`, 'info', { prompt: chatData.prompt.substring(0, Math.min(chatData.prompt.length, 100)) });
    return { response: responseText };
});

// Expands a search query into related terms using AI.
export const getExpandedSearchTerms = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const searchData = Validation.validateInput(Validation.GetExpandedSearchTermsCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const prompt = `Expand the medical search query "${searchData.query}" into up to 5 highly relevant and clinically related terms or synonyms. Focus on terms that would broaden search results effectively for medical content (e.g., if "heart failure" -> "congestive heart failure", "cardiac decompensation"). Respond with a JSON array of strings, e.g., ["term1", "term2"]. If no highly relevant terms, return an empty array. Do not return the original query as an expanded term.`;
    try {
        const result = await _quickModel.generateContent(prompt); // Use quick model for term expansion
        const terms = extractJson(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]') as string[];
        logger.info(`Expanded search terms for "${searchData.query}": ${terms.join(', ')}`);
        // Filter out empty strings and limit to 5 terms
        return { terms: terms.filter(t => typeof t === 'string' && t.trim().length > 0).slice(0, 5) };
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error expanding search terms for "${searchData.query}":`, { error });
        await logUserAction(userId, `Failed to expand search terms for "${searchData.query}".`, 'error', { error: errorMessage });
        // Return original query as a fallback to ensure search can proceed
        return { terms: [searchData.query] };
    }
});

// Performs a content search across MCQs and Flashcards.
export const searchContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const searchData = Validation.validateInput(Validation.SearchContentCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    // CRITICAL FIX: Implement actual search functionality (was unimplemented placeholder)
    ensureClientsInitialized();

    const queryText = searchData.query.toLowerCase();
    const searchTerms = (searchData.terms || []).map(term => term.toLowerCase());

    // Use a Set to ensure all terms are unique
    const allTerms = Array.from(new Set([queryText, ...searchTerms]));

    const mcqs: types.MCQ[] = [];
    const flashcards: types.Flashcard[] = [];

    // Helper function to fetch and filter content from a collection
    const fetchContent = async (collectionName: string) => {
        const content: (types.MCQ | types.Flashcard)[] = [];
        for (const term of allTerms) {
            // Firestore does not support full-text search directly.
            // This is a basic approach: fetch all approved content (limited for performance)
            // and then filter in memory by checking if text fields contain the term.
            // For scalable production search, integrate a dedicated search service (e.g., Algolia, Elasticsearch, Meilisearch).
            const snapshot = await db.collection(collectionName)
                .where('status', '==', 'approved')
                .limit(50) // Limit results per term to avoid large reads
                .get();

            snapshot.forEach(doc => {
                const data = doc.data();
                // Combine relevant text fields for search matching
                const itemText = `${data.question || data.front || ''} ${data.explanation || data.back || ''} ${data.topicName || ''} ${data.chapterName || ''} ${data.tags ? data.tags.join(' ') : ''}`.toLowerCase();
                if (itemText.includes(term)) {
                    // Prevent duplicates if multiple terms match the same item
                    if (!content.some(existing => existing.id === doc.id)) {
                        content.push({ id: doc.id, ...data } as types.MCQ | types.Flashcard);
                    }
                }
            });
        }
        return content;
    };

    try {
        // Fetch and filter MCQs from both MasterMCQ and MarrowMCQ
        const masterMcqs = await fetchContent('MasterMCQ');
        const marrowMcqs = await fetchContent('MarrowMCQ');
        mcqs.push(...masterMcqs as types.MCQ[], ...marrowMcqs as types.MCQ[]);

        // Fetch and filter Flashcards
        const fetchedFlashcards = await fetchContent('Flashcards');
        flashcards.push(...fetchedFlashcards as types.Flashcard[]);

        logger.info(`Search completed for "${queryText}". Found ${mcqs.length} MCQs and ${flashcards.length} Flashcards.`);
        await logUserAction(userId, `Performed search for "${queryText}". Found ${mcqs.length} MCQs, ${flashcards.length} Flashcards.`, 'info', { query: queryText, searchTerms: allTerms, mcqCount: mcqs.length, flashcardCount: flashcards.length });
        return { mcqs, flashcards };

    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error during searchContent for "${queryText}": ${errorMessage}`, { error });
        await logUserAction(userId, `Search failed for "${queryText}": ${errorMessage}.`, 'error', { query: queryText, error: errorMessage });
        throw new HttpsError('internal', `Search failed: ${errorMessage}`);
    }
});


// Updates chapter summary notes (Admin only).
export const updateChapterNotes = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const updateNotesData = Validation.validateInput(Validation.UpdateChapterNotesCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const { topicId, chapterId, newSummary, source } = updateNotesData;

    if (source === 'General') {
        // For General topics, notes are in a subcollection
        const chapterNotesRef = db.collection('Topics').doc(topicId).collection('ChapterNotes').doc(chapterId);
        await chapterNotesRef.set({ summaryNotes: newSummary, updatedAt: FieldValue.serverTimestamp(), updatedBy: userId }, { merge: true });
        logger.info(`Admin ${userId} updated General chapter notes for topic ${topicId}, chapter ${chapterId}.`);
        await logUserAction(userId, `Updated notes for General chapter ${chapterId} in topic ${topicId}.`, 'info', { topicId, chapterId, source });
    } else if (source === 'Marrow') {
        // For Marrow topics, notes are embedded within the chapter object in the topic document
        const topicRef = db.collection('MarrowTopics').doc(topicId);
        const topicDoc = await topicRef.get();
        if (!topicDoc.exists) throw new HttpsError("not-found", "Topic not found.");

        let chapters = (topicDoc.data()?.chapters || []) as types.Chapter[];
        const chapterIndex = chapters.findIndex((ch: types.Chapter) => ch.id === chapterId);
        if (chapterIndex === -1) throw new HttpsError("not-found", "Chapter not found.");

        // Update the summaryNotes and updatedAt for the specific chapter object
        chapters[chapterIndex].summaryNotes = newSummary;
        chapters[chapterIndex].updatedAt = FieldValue.serverTimestamp() as Timestamp;

        await topicRef.update({ chapters, updatedAt: FieldValue.serverTimestamp() }); // Update the whole chapters array
        logger.info(`Admin ${userId} updated Marrow chapter notes for topic ${topicId}, chapter ${chapterId}.`);
        await logUserAction(userId, `Updated notes for Marrow chapter ${chapterId} in topic ${topicId}.`, 'info', { topicId, chapterId, source });
    } else {
        throw new HttpsError("invalid-argument", "Invalid source provided.");
    }
    return { success: true, message: "Chapter notes updated." };
});

// Processes manual text input from an admin to create a content generation job.
export const processManualTextInput = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const processData = Validation.validateInput(Validation.ProcessManualTextInputCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const { fileName, rawText, isMarrow } = processData;
    const pipeline: types.ContentGenerationJob['pipeline'] = isMarrow ? 'marrow' : 'general';
    const jobRef = db.collection("contentGenerationJobs").doc();
    const newJob: Partial<types.ContentGenerationJob> = {
        id: jobRef.id, userId, fileName, createdAt: FieldValue.serverTimestamp(), pipeline, sourceText: rawText, title: fileName,
        status: 'processed' // Direct text input starts at 'processed' status
    };
    await jobRef.set(newJob);
    logger.info(`Admin ${userId} submitted manual text input. Job ID: ${jobRef.id}.`);
    await logUserAction(userId, `Manually submitted content: ${fileName}.`, 'info', { jobId: jobRef.id, pipeline });
    return { success: true, uploadId: jobRef.id, message: `Content submitted. Job ID: ${jobRef.id}` };
});

// Extracts MCQs and orphan explanations from raw Marrow content using AI.
export const extractMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const extractData = Validation.validateInput(Validation.ExtractMarrowContentCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const jobRef = db.collection("contentGenerationJobs").doc(extractData.uploadId);
    const jobDoc = await jobRef.get();
    // Validate job state
    if (!jobDoc.exists || jobDoc.data()?.pipeline !== 'marrow' || jobDoc.data()?.status !== 'pending_marrow_extraction') {
        throw new HttpsError('failed-precondition', 'Job not found or not in "pending_marrow_extraction" state.');
    }
    const sourceText = jobDoc.data()?.sourceText;
    if (!sourceText) throw new HttpsError('not-found', 'Source text not found in job.');

    ensureClientsInitialized();
    try {
        const prompt = `From the following Marrow content, extract all distinct high-yield multiple-choice questions (MCQs) and all distinct standalone explanation paragraphs. For each MCQ, precisely identify the question, its 4 options (A, B, C, D), and the single correct answer letter. For explanations, ensure each paragraph is complete and self-contained, representing a key concept. Return a strict JSON object with two arrays: 'mcqs' and 'orphanExplanations'.
        Example MCQ format: { "question": "...", "options": ["A.", "B.", "C.", "D."], "answer": "A", "explanation": "..." }
        Example Explanation format: "Paragraph of text explaining a concept."
        Content: ${sourceText}`;

        const result = await _powerfulModel.generateContent(prompt); // Use powerful model for extraction
        const aiResponse = extractJson(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
        const extractedMcqs = aiResponse.mcqs || [];
        const orphanExplanations = aiResponse.orphanExplanations || [];

        await jobRef.update({
            stagedContent: { extractedMcqs, orphanExplanations },
            suggestedNewMcqCount: orphanExplanations.length, // Suggest generating MCQs from all orphan explanations by default
            updatedAt: FieldValue.serverTimestamp(),
            status: 'pending_generation_decision' // Move to decision step
        });
        logger.info(`Admin ${userId} triggered Marrow extraction for job ${extractData.uploadId}. MCQs: ${extractedMcqs.length}, Explanations: ${orphanExplanations.length}.`);
        await logUserAction(userId, `Marrow content extracted for job ${extractData.uploadId}.`, 'info', { jobId: extractData.uploadId, mcqCount: extractedMcqs.length, explanationCount: orphanExplanations.length });
        return { mcqCount: extractedMcqs.length, explanationCount: orphanExplanations.length };
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Marrow extraction callable failed for job ${extractData.uploadId}: ${errorMessage}`, { error });
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion(`Marrow extraction failed: ${errorMessage}`) });
        await logUserAction(userId, `Marrow extraction failed for job ${extractData.uploadId}: ${errorMessage}.`, 'error', { jobId: extractData.uploadId, error: errorMessage });
        throw new HttpsError('internal', `Marrow extraction failed: ${errorMessage}`);
    }
});

// Generates new MCQs from orphan explanations and analyzes topics for Marrow content.
export const generateAndAnalyzeMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const generateData = Validation.validateInput(Validation.GenerateAndAnalyzeMarrowContentCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const jobRef = db.collection("contentGenerationJobs").doc(generateData.uploadId);
    const jobDoc = await jobRef.get();
    // Validate job state
    if (!jobDoc.exists || jobDoc.data()?.pipeline !== 'marrow' || jobDoc.data()?.status !== 'pending_generation_decision') {
        throw new HttpsError('failed-precondition', 'Job not found or not in "pending_generation_decision" state.');
    }
    const orphanExplanations = jobDoc.data()?.stagedContent?.orphanExplanations || [];
    if (generateData.count > orphanExplanations.length) throw new HttpsError('invalid-argument', 'Count exceeds available orphan explanations.');

    ensureClientsInitialized();
    try {
        const explanationsToGenerateFrom = orphanExplanations.slice(0, generateData.count).join('\n\n');
        let generatedMcqs: Partial<types.MCQ>[] = [];
        if (explanationsToGenerateFrom) {
            const prompt = `Generate exactly ${generateData.count} high-quality multiple-choice questions from the following medical explanations provided from Marrow content. For each MCQ, provide a clear question, 4 distinct options (A, B, C, D), the single correct answer letter, and a detailed explanation. Ensure the MCQs are challenging but fair, with plausible distractors. Assign 3-5 relevant, specific tags (e.g., 'anatomy', 'diagnosis', 'treatment') to each MCQ. Assign a difficulty level (easy, medium, hard). All tags should be lowercase. Provide the output in strict JSON format:
            [{"question": "...", "options": ["...", "...", "...", "..."], "answer": "A", "explanation": "...", "tags": ["...", "..."], "difficulty": "medium"}]
            Explanations: ${explanationsToGenerateFrom}`;

            const result = await _powerfulModel.generateContent(prompt); // Use powerful model for MCQ generation
            generatedMcqs = extractJson(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]') as Partial<types.MCQ>[];
            generatedMcqs = generatedMcqs.map(mcq => ({
                ...mcq,
                source: 'Marrow_AI_Generated',
                difficulty: mcq.difficulty || 'medium',
                tags: (mcq.tags || []).map(tag => tag.toLowerCase()), // Ensure tags are lowercase
            }));
        }

        const currentStagedMcqs = jobDoc.data()?.stagedContent?.extractedMcqs || [];
        const combinedMcqs = [...currentStagedMcqs, ...generatedMcqs];

        // Classify and suggest key topics for the combined content
        const classificationPrompt = `Analyze the main themes, key topics, and clinical relevance from the following combined Marrow MCQs. Suggest the single most suitable existing Marrow Topic Name (e.g., "General Medicine", "Pediatrics") and a specific Chapter Name within that topic (e.g., "Cardiology", "Nephrology") for these questions. Also, list 5-8 comprehensive key topics/tags that cover the entire content. All key topics should be lowercase. Provide the output in strict JSON format:
        {"suggestedTopic": "Topic Name", "suggestedChapter": "Chapter Name", "keyTopics": ["tag1", "tag2", "..."]}.
        If a new topic/chapter is absolutely necessary, explicitly state it, but prioritize existing.
        MCQ content excerpts (questions only, for brevity): ${combinedMcqs.map(mcq => mcq.question).join('\n')}`;

        const classificationResult = await _quickModel.generateContent(classificationPrompt); // Use quick model for classification
        const classificationResponse = extractJson(classificationResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');

        await jobRef.update({
            stagedContent: {
                extractedMcqs: currentStagedMcqs,
                generatedMcqs: generatedMcqs,
                // Remove explanations that were used for generation
                orphanExplanations: orphanExplanations.slice(generateData.count)
            },
            suggestedTopic: classificationResponse.suggestedTopic || 'Uncategorized',
            suggestedChapter: classificationResponse.suggestedChapter || 'Miscellaneous',
            suggestedKeyTopics: (classificationResponse.keyTopics || []).map((tag: string) => tag.toLowerCase()), // Ensure tags are lowercase
            updatedAt: FieldValue.serverTimestamp(),
            status: 'pending_assignment' // Move to admin assignment step
        });
        logger.info(`Admin ${userId} generated ${generatedMcqs.length} new MCQs for job ${generateData.uploadId}. Status updated to pending_assignment.`);
        await logUserAction(userId, `Generated ${generatedMcqs.length} Marrow MCQs for job ${generateData.uploadId}.`, 'info', { jobId: generateData.uploadId, generatedCount: generatedMcqs.length });
        return { success: true, message: `Generated ${generatedMcqs.length} new MCQs and analyzed topics.` };
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Marrow generation and analysis callable failed for job ${generateData.uploadId}: ${errorMessage}`, { error });
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion(`Marrow generation/analysis failed: ${errorMessage}`) });
        await logUserAction(userId, `Marrow generation/analysis failed for job ${generateData.uploadId}: ${errorMessage}.`, 'error', { jobId: generateData.uploadId, error: errorMessage });
        throw new HttpsError('internal', `Marrow generation/analysis failed: ${errorMessage}`);
    }
});

// Approves and saves Marrow content (extracted + generated MCQs) to the database.
export const approveMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const approveMarrowData = Validation.validateInput(Validation.ApproveMarrowContentCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const { uploadId, topicName, chapterName, keyTopics } = approveMarrowData;
    const jobRef = db.collection("contentGenerationJobs").doc(uploadId);
    const jobDoc = await jobRef.get();
    // Validate job state
    if (!jobDoc.exists || jobDoc.data()?.pipeline !== 'marrow' || jobDoc.data()?.status !== 'pending_assignment') {
        throw new HttpsError('failed-precondition', 'Job not found or not in "pending_assignment" state.');
    }

    const stagedContent = jobDoc.data()?.stagedContent;
    if (!stagedContent) throw new HttpsError('failed-precondition', 'No staged content found for approval.');

    const normalizedTopicId = normalizeId(topicName);
    const normalizedChapterId = normalizeId(chapterName);

    // Combine extracted and generated MCQs
    const allApprovedMcqs: types.MCQ[] = [...(stagedContent.extractedMcqs || []), ...(stagedContent.generatedMcqs || [])].map((mcq: Partial<types.MCQ>) => ({
        id: db.collection('MarrowMCQ').doc().id, // Generate new Firestore ID
        question: mcq.question || '',
        options: mcq.options || [],
        answer: mcq.answer || '',
        correctAnswer: mcq.correctAnswer || (mcq.answer && mcq.options?.[mcq.answer.charCodeAt(0) - 'A'.charCodeAt(0)]) || mcq.answer || '',
        explanation: mcq.explanation || '',
        topicName: topicName,
        topicId: normalizedTopicId,
        chapterName: chapterName,
        chapterId: normalizedChapterId,
        creatorId: userId,
        createdAt: FieldValue.serverTimestamp() as Timestamp,
        source: mcq.source || 'Marrow_Extracted', // Retain original source if available
        status: 'approved', // Mark as approved
        uploadId: uploadId, // Link back to the original upload job
        tags: keyTopics.map(tag => tag.toLowerCase()), // Ensure all tags are lowercase
        difficulty: mcq.difficulty || 'medium',
        type: 'mcq',
    }));

    await db.runTransaction(async (transaction) => {
        const marrowTopicRef = db.collection('MarrowTopics').doc(normalizedTopicId);
        const topicDoc = await transaction.get(marrowTopicRef);

        let chapters: types.Chapter[] = [];

        if (topicDoc.exists) {
            // Update existing topic
            chapters = (topicDoc.data()?.chapters || []) as types.Chapter[];
            const existingChapterIndex = chapters.findIndex(c => c.id === normalizedChapterId);
            if (existingChapterIndex === -1) {
                // Add new chapter to existing topic
                chapters.push({ id: normalizedChapterId, name: chapterName, mcqCount: allApprovedMcqs.length, flashcardCount: 0, topicId: normalizedTopicId, topicName: topicName, source: 'Marrow', createdAt: FieldValue.serverTimestamp() as Timestamp });
            } else {
                // Update existing chapter counts
                chapters[existingChapterIndex].mcqCount = (chapters[existingChapterIndex].mcqCount || 0) + allApprovedMcqs.length;
                chapters[existingChapterIndex].updatedAt = FieldValue.serverTimestamp() as Timestamp;
            }
            // Update topic document
            transaction.update(marrowTopicRef, {
                chapters: chapters,
                totalMcqCount: (topicDoc.data()?.totalMcqCount || 0) + allApprovedMcqs.length,
                updatedAt: FieldValue.serverTimestamp(),
            });

        } else {
            // Create new topic and chapter
            chapters.push({ id: normalizedChapterId, name: chapterName, mcqCount: allApprovedMcqs.length, flashcardCount: 0, topicId: normalizedTopicId, topicName: topicName, source: 'Marrow', createdAt: FieldValue.serverTimestamp() as Timestamp });
            transaction.set(marrowTopicRef, {
                id: normalizedTopicId, name: topicName, source: 'Marrow',
                createdAt: FieldValue.serverTimestamp(),
                chapters: chapters,
                chapterCount: chapters.length,
                totalMcqCount: allApprovedMcqs.length,
                totalFlashcardCount: 0,
                updatedAt: FieldValue.serverTimestamp(),
            });
        }
        logger.info(`Admin ${userId} ensured Marrow topic ${topicName} and chapter ${chapterName} exist/created.`);

        // Add all MCQs to MarrowMCQ collection
        const mcqCollectionRef = db.collection('MarrowMCQ');
        allApprovedMcqs.forEach(mcq => {
            transaction.set(mcqCollectionRef.doc(mcq.id), mcq);
        });

        // Add key topics to KeyClinicalTopics collection (if they don't exist)
        const keyClinicalTopicsRef = db.collection('KeyClinicalTopics');
        for (const topicTag of keyTopics) {
            const tagId = normalizeId(topicTag);
            const tagDocRef = keyClinicalTopicsRef.doc(tagId);
            const tagDoc = await tagDocRef.get(); // Need to fetch directly, can't use transaction.get for non-updated docs if not in transaction scope initially
            if (!tagDoc.exists) {
                await tagDocRef.set({ name: topicTag.toLowerCase(), createdAt: FieldValue.serverTimestamp() });
            }
        }

        // Update the job status to 'completed'
        transaction.update(jobRef, {
            status: 'completed',
            updatedAt: FieldValue.serverTimestamp(),
            finalAwaitingReviewData: null, // Clear staged content
            approvedTopic: topicName,
            approvedChapter: chapterName,
            totalMcqCount: (jobDoc.data()?.totalMcqCount || 0) + allApprovedMcqs.length, // Update job's own total counts
            totalFlashcardCount: (jobDoc.data()?.totalFlashcardCount || 0),
        });
        logger.info(`Job ${uploadId} completed and content approved.`);
    });
    await logUserAction(userId, `Approved and added Marrow content for job ${uploadId}. ${allApprovedMcqs.length} MCQs added.`, 'info', { jobId: uploadId, mcqCount: allApprovedMcqs.length, topicName, chapterName });
    return { success: true, message: `Marrow content approved and added: ${allApprovedMcqs.length} MCQs.` };
});

// Approves and saves General content (MCQs and Flashcards) to the database based on assignments.
export const approveContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const approveData = Validation.validateInput(Validation.ApproveContentCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const { uploadId, assignments } = approveData;
    const jobRef = db.collection("contentGenerationJobs").doc(uploadId);
    const jobDoc = await jobRef.get();
    // Validate job state
    if (!jobDoc.exists || jobDoc.data()?.pipeline !== 'general' || jobDoc.data()?.status !== 'pending_assignment_review') {
        throw new HttpsError('failed-precondition', 'Job not found or not in "pending_assignment_review" state.');
    }

    const generatedContent = jobDoc.data()?.generatedContent;
    if (!generatedContent || generatedContent.length === 0) throw new HttpsError('failed-precondition', 'No generated content found for approval.');

    const mcqsToSave: types.MCQ[] = [];
    const flashcardsToSave: types.Flashcard[] = [];
    // Use a map to track topic/chapter counts that need updating in a single transaction
    const chapterUpdatesMap = new Map<string, { topicRef: FirebaseFirestore.DocumentReference, topicName: string, mcqCount: number, flashcardCount: number, chaptersToUpdate: Set<string> }>();

    const keyClinicalTopicsRef = db.collection('KeyClinicalTopics'); // Reference for new tags

    for (const assignment of assignments) {
        const normalizedTopicId = normalizeId(assignment.topicName);
        const normalizedChapterId = normalizeId(assignment.chapterName);
        const topicRef = db.collection('Topics').doc(normalizedTopicId); // General topics are in 'Topics' collection

        const chapterKey = `${normalizedTopicId}_${normalizedChapterId}`;
        if (!chapterUpdatesMap.has(chapterKey)) {
            chapterUpdatesMap.set(chapterKey, { topicRef, topicName: assignment.topicName, mcqCount: 0, flashcardCount: 0, chaptersToUpdate: new Set() });
        }
        const currentChapterUpdate = chapterUpdatesMap.get(chapterKey)!;

        // Process MCQs for this assignment
        (assignment.mcqs || []).forEach((partialMcq: Partial<types.MCQ>) => {
            const newMcq: types.MCQ = {
                id: db.collection('MasterMCQ').doc().id, // Generate new Firestore ID for MasterMCQ
                question: partialMcq.question || '',
                options: partialMcq.options || [],
                answer: partialMcq.answer || '',
                correctAnswer: partialMcq.correctAnswer || (partialMcq.answer && partialMcq.options?.[partialMcq.answer.charCodeAt(0) - 'A'.charCodeAt(0)]) || partialMcq.answer || '',
                explanation: partialMcq.explanation || '',
                topicName: assignment.topicName,
                topicId: normalizedTopicId,
                chapterName: assignment.chapterName,
                chapterId: normalizedChapterId,
                creatorId: userId,
                createdAt: FieldValue.serverTimestamp() as Timestamp,
                source: partialMcq.source || 'AI_Generated', // Retain source or default
                status: 'approved', // Mark as approved
                uploadId: uploadId, // Link back to original upload job
                tags: (partialMcq.tags || []).map(tag => tag.toLowerCase()), // Ensure tags are lowercase
                difficulty: partialMcq.difficulty || 'medium',
                type: 'mcq',
            };
            mcqsToSave.push(newMcq);
            currentChapterUpdate.mcqCount++;
            currentChapterUpdate.chaptersToUpdate.add(assignment.chapterName); // Track chapters to add to topic.chapters array
        });

        // Process Flashcards for this assignment
        (assignment.flashcards || []).forEach((partialFlashcard: Partial<types.Flashcard>) => {
            const newFlashcard: types.Flashcard = {
                id: db.collection('Flashcards').doc().id, // Generate new Firestore ID for Flashcards
                front: partialFlashcard.front || '',
                back: partialFlashcard.back || '',
                topicName: assignment.topicName,
                topicId: normalizedTopicId,
                chapterName: assignment.chapterName,
                chapterId: normalizedChapterId,
                creatorId: userId,
                createdAt: FieldValue.serverTimestamp() as Timestamp,
                source: partialFlashcard.source || 'AI_Generated', // Retain source or default
                status: 'approved', // Mark as approved
                uploadId: uploadId, // Link back to original upload job
                tags: (partialFlashcard.tags || []).map(tag => tag.toLowerCase()), // Ensure tags are lowercase
                mnemonic: partialFlashcard.mnemonic || undefined,
                type: 'flashcard',
            };
            flashcardsToSave.push(newFlashcard);
            currentChapterUpdate.flashcardCount++;
            currentChapterUpdate.chaptersToUpdate.add(assignment.chapterName); // Track chapters to add to topic.chapters array
        });

        // Add all unique tags from this assignment's content to KeyClinicalTopics collection
        const allTagsInAssignment = new Set<string>();
        (assignment.mcqs || []).forEach(mcq => (mcq.tags || []).forEach(tag => allTagsInAssignment.add(tag.toLowerCase())));
        (assignment.flashcards || []).forEach(fc => (fc.tags || []).forEach(tag => allTagsInAssignment.add(tag.toLowerCase())));

        for (const tag of Array.from(allTagsInAssignment)) {
            const tagId = normalizeId(tag);
            const tagDocRef = keyClinicalTopicsRef.doc(tagId);
            // Check if tag exists, if not, add it
            // Using a simple set here, if needed in a transaction, this needs to be fetched
            // inside the transaction or collected and updated at the end.
            const tagDoc = await tagDocRef.get();
            if (!tagDoc.exists) {
                await tagDocRef.set({ name: tag, createdAt: FieldValue.serverTimestamp() });
            }
        }
    }

    await db.runTransaction(async (transaction: Transaction) => {
        // Process updates for each unique topic/chapter pair
        for (const [key, { topicRef, topicName, mcqCount, flashcardCount, chaptersToUpdate }] of chapterUpdatesMap.entries()) {
            const [normalizedTopicId] = key.split('_');

            const topicDocSnap = await transaction.get(topicRef);
            // General topics store chapters as an array of strings
            let chapters: string[] = (topicDocSnap.exists && topicDocSnap.data()?.chapters) ? topicDocSnap.data()?.chapters as string[] : [];
            // Use a Set to avoid duplicates and correctly merge new chapter names
            let updatedChaptersSet = new Set(chapters);
            chaptersToUpdate.forEach(chapterName => updatedChaptersSet.add(chapterName));

            const currentTotalMcqCount = (topicDocSnap.exists && topicDocSnap.data()?.totalMcqCount) ? topicDocSnap.data()?.totalMcqCount : 0;
            const currentTotalFlashcardCount = (topicDocSnap.exists && topicDocSnap.data()?.totalFlashcardCount) ? topicDocSnap.data()?.totalFlashcardCount : 0;

            // Update the Topic document
            transaction.set(topicRef, {
                id: normalizedTopicId,
                name: topicName,
                chapters: Array.from(updatedChaptersSet).sort((a, b) => a.localeCompare(b)), // Convert Set back to sorted Array
                chapterCount: updatedChaptersSet.size,
                totalMcqCount: currentTotalMcqCount + mcqCount,
                totalFlashcardCount: currentTotalFlashcardCount + flashcardCount,
                source: 'General', // General topics are always 'General' source
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
        }

        // Add all MCQs to MasterMCQ collection
        mcqsToSave.forEach(mcq => transaction.set(db.collection('MasterMCQ').doc(mcq.id), mcq));
        // Add all Flashcards to Flashcards collection
        flashcardsToSave.forEach(flashcard => transaction.set(db.collection('Flashcards').doc(flashcard.id), flashcard));

        // Update the job status to 'completed'
        transaction.update(jobRef, {
            status: 'completed',
            updatedAt: FieldValue.serverTimestamp(),
            finalAwaitingReviewData: null, // Clear staged content
            assignmentSuggestions: [], // Clear suggestions
            totalMcqCount: (jobDoc.data()?.totalMcqCount || 0) + mcqsToSave.length, // Update job's own total counts
            totalFlashcardCount: (jobDoc.data()?.totalFlashcardCount || 0) + flashcardsToSave.length,
        });
    });

    logger.info(`Admin ${userId} approved content for job ${uploadId}. Saved ${mcqsToSave.length} MCQs and ${flashcardsToSave.length} Flashcards.`);
    await logUserAction(userId, `Approved and added General content for job ${uploadId}. ${mcqsToSave.length} MCQs, ${flashcardsToSave.length} Flashcards added.`, 'info', { jobId: uploadId, mcqCount: mcqsToSave.length, flashcardCount: flashcardsToSave.length });
    return { success: true, message: `Content approved: ${mcqsToSave.length} MCQs, ${flashcardsToSave.length} Flashcards.` };
});


// Resets a content generation job, deleting associated content and clearing job progress.
export const resetUpload = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const resetData = Validation.validateInput(Validation.ResetUploadCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const jobRef = db.collection("contentGenerationJobs").doc(resetData.uploadId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) throw new HttpsError('not-found', 'Job not found.');

    // Prepare a batch write to delete all associated content
    const batch = db.batch();

    let deletedMcqCount = 0;
    let deletedFlashcardCount = 0;
    // Map to track changes to topic/chapter counts
    const topicsToUpdate = new Map<string, { mcqDelta: number, flashcardDelta: number, source: 'General' | 'Marrow' }>();

    // Collect all content items linked to this upload job
    const collectionsToProcess = ['MasterMCQ', 'MarrowMCQ', 'Flashcards'];
    for (const colName of collectionsToProcess) {
        const snapshot = await db.collection(colName).where('uploadId', '==', resetData.uploadId).get();
        snapshot.forEach(docSnap => {
            batch.delete(docSnap.ref); // Add delete operation to batch
            const data = docSnap.data();
            const topicId = normalizeId(data.topicId || data.topicName);
            const chapterId = normalizeId(data.chapterId || data.chapterName);

            const key = `${topicId}_${chapterId}`;
            if (!topicsToUpdate.has(key)) {
                topicsToUpdate.set(key, { mcqDelta: 0, flashcardDelta: 0, source: data.source?.startsWith('Marrow') ? 'Marrow' : 'General' });
            }
            const delta = topicsToUpdate.get(key)!;

            // Increment appropriate delta for topic/chapter count update
            if (colName === 'MasterMCQ' || colName === 'MarrowMCQ') {
                delta.mcqDelta--;
                deletedMcqCount++;
            } else if (colName === 'Flashcards') {
                delta.flashcardDelta--;
                deletedFlashcardCount++;
            }
        });
    }

    // Execute topic/chapter count updates within a transaction to ensure atomicity
    await db.runTransaction(async (transaction) => {
        for (const [key, { mcqDelta, flashcardDelta, source }] of topicsToUpdate.entries()) {
            const [topicId, chapterId] = key.split('_'); // Split key back into topic and chapter IDs
            const collectionRef = source === 'Marrow' ? db.collection('MarrowTopics') : db.collection('Topics');
            const topicRef = collectionRef.doc(topicId);
            const topicDocSnap = await transaction.get(topicRef);

            if (topicDocSnap.exists) {
                const currentTopicData = topicDocSnap.data() as types.Topic;

                if (source === 'Marrow') {
                    // For Marrow topics, chapters are objects with counts
                    let chapters: types.Chapter[] = (currentTopicData.chapters as types.Chapter[] || []).filter(ch => ch && typeof ch === 'object');
                    chapters = chapters.map(ch => {
                        if (normalizeId(ch.name) === chapterId) {
                            return { ...ch, mcqCount: Math.max(0, (ch.mcqCount || 0) + mcqDelta), flashcardCount: Math.max(0, (ch.flashcardCount || 0) + flashcardDelta) };
                        }
                        return ch;
                    });
                    transaction.update(topicRef, { chapters: chapters });
                } else {
                    // For General topics, chapters are strings, no specific chapter object updates needed for counts.
                    // The main topic counts will reflect the deletion.
                }

                // Calculate new total counts for the topic
                const newTotalMcqCount = Math.max(0, (currentTopicData.totalMcqCount || 0) + mcqDelta);
                const newTotalFlashcardCount = Math.max(0, (currentTopicData.totalFlashcardCount || 0) + flashcardDelta);

                transaction.update(topicRef, {
                    totalMcqCount: newTotalMcqCount,
                    totalFlashcardCount: newTotalFlashcardCount,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        }
    });
    logger.info(`Admin ${userId} updated topic/chapter counts for content associated with job ${resetData.uploadId}.`);

    // Commit the batch deletion of content items
    await batch.commit();
    logger.info(`Admin ${userId} deleted ${deletedMcqCount} MCQs and ${deletedFlashcardCount} Flashcards associated with job ${resetData.uploadId}.`);
    await logUserAction(userId, `Reset job ${resetData.uploadId}. Deleted ${deletedMcqCount} MCQs and ${deletedFlashcardCount} Flashcards.`, 'warn', { jobId: resetData.uploadId, deletedMcqCount, deletedFlashcardCount });

    // Reset the job document itself to 'processed' status and clear all intermediate data
    await jobRef.update({
        status: 'processed',
        errors: FieldValue.delete(),
        suggestedTopic: FieldValue.delete(),
        suggestedChapter: FieldValue.delete(),
        suggestedPlan: FieldValue.delete(),
        batchSize: FieldValue.delete(),
        totalBatches: FieldValue.delete(),
        completedBatches: FieldValue.delete(),
        textChunks: FieldValue.delete(),
        generatedContent: FieldValue.delete(),
        finalAwaitingReviewData: FieldValue.delete(),
        assignmentSuggestions: FieldValue.delete(),
        stagedContent: FieldValue.delete(),
        suggestedKeyTopics: FieldValue.delete(),
        suggestedNewMcqCount: FieldValue.delete(),
        totalMcqCount: FieldValue.delete(), // Clear job-level total counts as content is deleted
        totalFlashcardCount: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
    });
    logger.info(`Job ${resetData.uploadId} reset by admin ${userId}.`);

    return { success: true, message: `Upload ${resetData.uploadId} reset successfully.` };
});

// Archives a content generation job, marking it as inactive.
export const archiveUpload = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const archiveData = Validation.validateInput(Validation.ArchiveUploadCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const jobRef = db.collection("contentGenerationJobs").doc(archiveData.uploadId);
    // Simply update the status to 'archived'
    await jobRef.update({ status: 'archived', updatedAt: FieldValue.serverTimestamp() });
    logger.info(`Job ${archiveData.uploadId} archived by admin ${userId}.`);
    await logUserAction(userId, `Archived job ${archiveData.uploadId}.`, 'info', { jobId: archiveData.uploadId });
    return { success: true, message: `Upload ${archiveData.uploadId} archived.` };
});

// Reassigns content from a previously processed job, allowing for new assignment.
export const reassignContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const reassignData = Validation.validateInput(Validation.ReassignContentCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const jobRef = db.collection("contentGenerationJobs").doc(reassignData.uploadId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) throw new HttpsError('not-found', 'Job not found.');
    // Only allow re-assignment from certain final or errored states
    const validStatesForReassign: types.ContentGenerationJob['status'][] = ['pending_assignment_review', 'completed', 'error', 'generation_failed_partially', 'archived'];
    if (!validStatesForReassign.includes(jobDoc.data()?.status as types.ContentGenerationJob['status'])) {
        throw new HttpsError('failed-precondition', 'Job is not in a state that allows re-assignment.');
    }

    // Reset assignment-related fields and set status back to 'pending_final_review'
    await jobRef.update({ status: 'pending_final_review', assignmentSuggestions: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    logger.info(`Job ${reassignData.uploadId} set for re-assignment by admin ${userId}.`);
    await logUserAction(userId, `Job ${reassignData.uploadId} marked for re-assignment.`, 'info', { jobId: reassignData.uploadId });
    return { success: true, message: `Upload ${reassignData.uploadId} ready for re-assignment.` };
});

// Prepares a job for regeneration, clearing previous generated content.
export const prepareForRegeneration = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const prepareData = Validation.validateInput(Validation.PrepareForRegenerationCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const jobRef = db.collection("contentGenerationJobs").doc(prepareData.uploadId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) throw new HttpsError('not-found', 'Job not found.');
    // Only allow regeneration from states where content exists or was attempted to be generated
    const validStatesForRegen: types.ContentGenerationJob['status'][] = ['generating_batch', 'generation_failed_partially', 'pending_final_review', 'completed', 'error', 'archived'];
    if (!validStatesForRegen.includes(jobDoc.data()?.status as types.ContentGenerationJob['status'])) {
        throw new HttpsError('failed-precondition', 'Job is not in a state that allows regeneration preparation.');
    }

    // Clear generated content, reset batch progress, and set status back to 'batch_ready'
    await jobRef.update({
        generatedContent: [],
        completedBatches: 0,
        status: 'batch_ready',
        errors: FieldValue.delete(), // Clear previous errors
        updatedAt: FieldValue.serverTimestamp(),
    });
    logger.info(`Job ${prepareData.uploadId} prepared for regeneration by admin ${userId}.`);
    await logUserAction(userId, `Job ${prepareData.uploadId} prepared for regeneration.`, 'info', { jobId: prepareData.uploadId });
    return { success: true, message: `Upload ${prepareData.uploadId} prepared for regeneration.` };
});

// Asks AI to suggest classification (topic/chapter) for general content.
export const suggestClassification = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const suggestData = Validation.validateInput(Validation.SuggestClassificationCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const jobRef = db.collection("contentGenerationJobs").doc(suggestData.uploadId);
    const jobDoc = await jobRef.get();
    // Validate job state
    if (!jobDoc.exists || jobDoc.data()?.status !== 'pending_classification' || jobDoc.data()?.pipeline !== 'general') {
        throw new HttpsError('failed-precondition', 'Job not found or not in "pending_classification" state.');
    }
    const sourceText = jobDoc.data()?.sourceText;
    if (!sourceText) throw new HttpsError('not-found', 'Source text not found in job.');

    ensureClientsInitialized();
    try {
        const prompt = `Analyze the following medical text content. Suggest a suitable General Topic Name (e.g., "Pediatric Cardiology", "General Pediatrics"), and a specific Chapter Name within that topic (e.g., "Congenital Heart Defects", "Vaccinations"). Also, estimate how many high-quality multiple-choice questions (MCQs) and flashcards could be generated from this content. Provide the output in strict JSON format like this:
        {"suggestedTopic": "Topic Name", "suggestedChapter": "Chapter Name", "estimatedMcqCount": 50, "estimatedFlashcardCount": 30 }.
        Keep topic and chapter names concise and relevant to pediatrics.
        Content: ${sourceText}`;
        const result = await _quickModel.generateContent(prompt); // Use quick model for classification
        const aiResponse = extractJson(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');

        await db.collection("contentGenerationJobs").doc(suggestData.uploadId).update({
            suggestedTopic: aiResponse.suggestedTopic || 'Uncategorized',
            suggestedChapter: aiResponse.suggestedChapter || 'Miscellaneous',
            suggestedPlan: {
                mcqCount: aiResponse.estimatedMcqCount || 0,
                flashcardCount: aiResponse.estimatedFlashcardCount || 0,
            },
            updatedAt: FieldValue.serverTimestamp(),
            status: 'pending_approval' // Move to admin approval step
        });
        logger.info(`Admin ${userId} triggered classification for job ${suggestData.uploadId}. Status updated to pending_approval.`);
        await logUserAction(userId, `AI classified job ${suggestData.uploadId}.`, 'info', { jobId: suggestData.uploadId, suggestedTopic: aiResponse.suggestedTopic, suggestedChapter: aiResponse.suggestedChapter });
        return { success: true, suggestedTopic: aiResponse.suggestedTopic, suggestedChapter: aiResponse.suggestedChapter };
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`AI classification callable failed for job ${suggestData.uploadId}: ${errorMessage}`, { error });
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion(`AI classification failed: ${errorMessage}`) });
        await logUserAction(userId, `AI classification failed for job ${suggestData.uploadId}: ${errorMessage}.`, 'error', { jobId: suggestData.uploadId, error: errorMessage });
        throw new HttpsError('internal', `AI classification failed: ${errorMessage}`);
    }
});

// Prepares a general content generation job for batch processing by chunking text.
export const prepareBatchGeneration = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const prepareBatchData = Validation.validateInput(Validation.PrepareBatchGenerationCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const jobRef = db.collection("contentGenerationJobs").doc(prepareBatchData.uploadId);
    const jobDoc = await jobRef.get();
    // Validate job state
    if (!jobDoc.exists || jobDoc.data()?.status !== 'pending_approval' || jobDoc.data()?.pipeline !== 'general') {
        throw new HttpsError('failed-precondition', 'Job not found or not in "pending_approval" state.');
    }
    const sourceText = jobDoc.data()?.sourceText;
    if (!sourceText) throw new HttpsError('not-found', 'Source text not found in job.');

    const totalContentCount = prepareBatchData.totalMcqCount + prepareBatchData.totalFlashcardCount;
    if (totalContentCount === 0) throw new HttpsError('invalid-argument', 'Must request at least one MCQ or Flashcard to generate.');
    if (prepareBatchData.batchSize <= 0) throw new HttpsError('invalid-argument', 'Batch size must be positive.');

    // Split source text into smaller chunks for batch processing by AI
    const sentences = sourceText.split(/(?<=[.!?])\s+/); // Split by sentence-ending punctuation followed by space
    const maxCharsPerChunk = 2000; // Max characters per text chunk sent to AI
    let currentChunk = '';
    const textChunks: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        if ((currentChunk + (currentChunk ? ' ' : '') + sentence).length > maxCharsPerChunk && currentChunk.length > 0) {
            textChunks.push(currentChunk.trim());
            currentChunk = sentence;
        } else {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
    }
    if (currentChunk) textChunks.push(currentChunk.trim()); // Add any remaining text as the last chunk

    const actualTotalBatches = textChunks.length;

    // Update job document with planning details and text chunks
    await jobRef.update({
        totalMcqCount: prepareBatchData.totalMcqCount, totalFlashcardCount: prepareBatchData.totalFlashcardCount, batchSize: prepareBatchData.batchSize,
        approvedTopic: prepareBatchData.approvedTopic, approvedChapter: prepareBatchData.approvedChapter,
        totalBatches: actualTotalBatches,
        textChunks, // Store chunks for subsequent batch generation
        completedBatches: 0, // Reset completed batches
        generatedContent: [], // Clear previously generated content
        errors: FieldValue.delete(), // Clear previous errors
        updatedAt: FieldValue.serverTimestamp(),
        status: 'batch_ready' // Move to batch ready status
    });
    logger.info(`Admin ${userId} prepared job ${prepareBatchData.uploadId} for batch generation. Total batches: ${actualTotalBatches}.`);
    await logUserAction(userId, `Job ${prepareBatchData.uploadId} prepared for batch generation. Total batches: ${actualTotalBatches}.`, 'info', { jobId: prepareBatchData.uploadId, totalBatches: actualTotalBatches });
    return { success: true, totalBatches: actualTotalBatches };
});

// Starts the automated batch content generation process for a job.
export const startAutomatedBatchGeneration = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const startData = Validation.validateInput(Validation.StartAutomatedBatchGenerationCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const jobRef = db.collection("contentGenerationJobs").doc(startData.uploadId);
    const jobDoc = await jobRef.get();
    // Validate job state
    if (!jobDoc.exists || jobDoc.data()?.status !== 'batch_ready' || jobDoc.data()?.pipeline !== 'general') {
        throw new HttpsError('failed-precondition', 'Job not found or not in "batch_ready" state.');
    }

    // Simply update status; the onJobStatusChange trigger will handle the actual generation loop
    await jobRef.update({ status: 'generating_batch', updatedAt: FieldValue.serverTimestamp() });
    logger.info(`Admin ${userId} started automated batch generation for job ${startData.uploadId}.`);
    return { success: true, message: "Automated batch generation initiated." };
});


// Automatically assigns generated content to existing or new topics/chapters using AI.
export const autoAssignContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const autoAssignData = Validation.validateInput(Validation.AutoAssignContentCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const { uploadId, existingTopics, scopeToTopicName } = autoAssignData;
    const jobRef = db.collection("contentGenerationJobs").doc(uploadId);
    const jobDoc = await jobRef.get();
    // Validate job state
    if (!jobDoc.exists || jobDoc.data()?.status !== 'pending_final_review' || jobDoc.data()?.pipeline !== 'general') {
        throw new HttpsError('failed-precondition', 'Job not found or not in "pending_final_review" state.');
    }

    const generatedContent = jobDoc.data()?.generatedContent;
    if (!generatedContent || generatedContent.length === 0) throw new HttpsError('failed-precondition', 'No generated content to assign.');

    ensureClientsInitialized();
    try {
        const allContent: Array<Partial<types.MCQ | types.Flashcard>> = [];
        // Flatten all generated MCQs and Flashcards from batches
        generatedContent.forEach((batchItem: { mcqs: Partial<types.MCQ>[], flashcards: Partial<types.Flashcard>[] }) => {
            (batchItem.mcqs || []).forEach((mcq: Partial<types.MCQ>) => allContent.push({ ...mcq, type: 'mcq' }));
            (batchItem.flashcards || []).forEach((flashcard: Partial<types.Flashcard>) => allContent.push({ ...flashcard, type: 'flashcard' }));
        });

        // Create a summary of content texts for AI to process
        const contentTexts = allContent.map(item =>
            (item as types.MCQ).question || (item as types.Flashcard).front || '' // Use question or front as content summary
        ).filter(Boolean).join('\n---\n'); // Join with a separator

        // Construct existing topic names string for AI context
        const existingTopicNames = existingTopics.map((t: types.PediaquizTopicType) => t.name).join(', ');

        const prompt = `Review the following medical content (MCQs and Flashcards) and suggest assignments to **existing topics and chapters** from the provided list. Your primary goal is to find the best fit.
        If a suitable chapter does not exist within an *existing topic*, suggest creating a new chapter *within that existing topic*.
        If content absolutely does not fit any existing topics, suggest a new topic and chapter.
        
        Provide the output as a strict JSON array of assignment suggestions. Each suggestion object MUST include:
        - topicName (string): The suggested topic name.
        - chapterName (string): The suggested chapter name.
        - isNewChapter (boolean): True if this chapter is new, false if existing.
        - mcqs (array of original MCQ objects with question, options, answer, explanation, tags, source, difficulty): The MCQs assigned to this chapter.
        - flashcards (array of original Flashcard objects with front, back, tags, source, mnemonic): The Flashcards assigned to this chapter.
        
        Example JSON format:
        [
          {"topicName": "Cardiology", "chapterName": "Congenital Heart Disease", "isNewChapter": false, "mcqs": [{"question": "...", "options": ["..."], "answer": "...", "explanation": "...", "tags": ["..."], "source": "...", "difficulty": "medium"}], "flashcards": []},
          {"topicName": "New Topic", "chapterName": "New Chapter", "isNewChapter": true, "mcqs": [], "flashcards": [{"front": "...", "back": "...", "tags": ["..."], "source": "...", "mnemonic": "..."}]}
        ]
        
        Existing Topics: ${existingTopicNames}.
        ${scopeToTopicName ? `IMPORTANT: Focus assignment primarily to within the topic "${scopeToTopicName}" if at all possible.` : ''}
        
        Content to assign:
        ${contentTexts}`;

        const result = await _powerfulModel.generateContent(prompt); // Use powerful model for auto-assignment
        const aiResponse = extractJson(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]');
        const suggestions: types.AssignmentSuggestion[] = aiResponse;

        // Filter out empty suggestions and ensure tags are lowercase
        const finalSuggestions = suggestions.map(sugg => ({
            ...sugg,
            mcqs: (sugg.mcqs || []).filter(mcq => mcq.question).map(mcq => ({...mcq, tags: (mcq.tags || []).map(tag => tag.toLowerCase())})),
            flashcards: (sugg.flashcards || []).filter(fc => fc.front).map(fc => ({...fc, tags: (fc.tags || []).map(tag => tag.toLowerCase())})),
        }) as types.AssignmentSuggestion);

        await jobRef.update({
            assignmentSuggestions: finalSuggestions,
            updatedAt: FieldValue.serverTimestamp(),
            status: 'pending_assignment_review' // Move to admin review of AI assignments
        });
        logger.info(`Admin ${userId} received AI auto-assignment suggestions for job ${uploadId}.`);
        await logUserAction(userId, `AI auto-assigned content for job ${uploadId}.`, 'info', { jobId: uploadId, suggestionCount: finalSuggestions.length });
        return { success: true, suggestions: finalSuggestions };
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`AI auto-assignment callable failed for job ${uploadId}: ${errorMessage}`, { error });
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion(`AI auto-assignment failed: ${errorMessage}`) });
        await logUserAction(userId, `AI auto-assignment failed for job ${uploadId}: ${errorMessage}.`, 'error', { jobId: uploadId, error: errorMessage });
        throw new HttpsError('internal', `Failed to generate error: ${errorMessage}`);
    }
});

// Generates a chapter summary from source text using AI and saves it to the chapter.
export const generateChapterSummary = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const summaryData = Validation.validateInput(Validation.GenerateChapterSummaryCallableDataSchema, request.data);
    const userId = await ensureAdmin(request);

    const { uploadIds, topicId, chapterId, source } = summaryData;

    const sourceTexts: string[] = [];
    for (const uploadId of uploadIds) {
        // Fetch source text from ContentGenerationJob documents
        const uploadDoc = await db.collection('contentGenerationJobs').doc(uploadId).get();
        if (uploadDoc.exists && uploadDoc.data()?.sourceText) { // Use sourceText field
            sourceTexts.push(uploadDoc.data()!.sourceText);
        } else {
            logger.warn(`Source text not found for upload ID: ${uploadId}. Skipping this upload for summary.`);
        }
    }

    if (sourceTexts.length === 0) {
        throw new HttpsError('invalid-argument', 'No source text available from provided upload IDs for summary generation.');
    }

    const combinedText = sourceTexts.join('\n\n');
    const MAX_SUMMARY_CONTEXT = 25000; // Max characters to send to AI model
    const truncatedText = combinedText.length > MAX_SUMMARY_CONTEXT ? combinedText.substring(0, MAX_SUMMARY_CONTEXT) + "..." : combinedText; // CRITICAL FIX: Changed MAX_CRAM_SHEET_CONTEXT to MAX_SUMMARY_CONTEXT

    ensureClientsInitialized();
    try {
        const prompt = `Summarize the following medical text into concise, high-yield notes suitable for a pediatric medical student's study. Organize the summary with clear, logical headings, bullet points, and numbered lists where appropriate. Highlight key clinical concepts, important definitions, and relevant diagnostic/management principles. Make sure to use emojis frequently where appropriate to enhance readability and engagement (e.g., 🩺, 💊, 👶, 🔬, ❤️, ✨). Respond strictly in professional Markdown format.
        Text: ${truncatedText}`;
        const result = await _powerfulModel.generateContent(prompt); // Use powerful model for summary generation
        const summary = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "No summary could be generated.";
        logger.info(`AI generated chapter summary from ${summaryData.uploadIds.length} uploads.`);

        // If topic and chapter are provided, attempt to save the summary directly to the chapter
        if (topicId && chapterId && source) {
            const collectionRef = source === 'Marrow' ? db.collection('MarrowTopics') : db.collection('Topics');
            const topicRef = collectionRef.doc(topicId);

            if (source === 'General') {
                // For General topics, summary notes are in a subcollection
                const chapterNotesRef = topicRef.collection('ChapterNotes').doc(chapterId);
                await chapterNotesRef.set({ summaryNotes: summary, updatedAt: FieldValue.serverTimestamp(), updatedBy: userId }, { merge: true });
                logger.info(`Admin ${userId} saved AI summary for General chapter ${chapterId}.`);
            } else {
                // For Marrow topics, summary notes are embedded within the chapter object
                const topicDoc = await topicRef.get();
                if (!topicDoc.exists) throw new HttpsError("not-found", "Topic not found for summary save.");
                let chapters = (topicDoc.data()?.chapters || []) as types.Chapter[];
                const chapterIndex = chapters.findIndex((ch: types.Chapter) => ch.id === chapterId);
                if (chapterIndex === -1) throw new HttpsError("not-found", "Chapter not found for summary save.");
                chapters[chapterIndex].summaryNotes = summary;
                chapters[chapterIndex].updatedAt = FieldValue.serverTimestamp() as Timestamp;
                await topicRef.update({ chapters, updatedAt: FieldValue.serverTimestamp() });
                logger.info(`Admin ${userId} saved AI summary for Marrow chapter ${chapterId}.`);
            }
            await logUserAction(userId, `Generated and saved AI summary for chapter ${chapterId} in topic ${topicId}.`, 'info', { topicId, chapterId, source, uploadIds: summaryData.uploadIds });
        } else {
            logger.info(`AI summary generated but not saved (missing topic/chapter/source info in request).`);
            await logUserAction(userId, `Generated AI summary for upload IDs: ${summaryData.uploadIds.join(', ')}. Not saved to chapter notes.`, 'info', { uploadIds: summaryData.uploadIds });
        }

        return { summary };
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`AI chapter summary generation failed: ${errorMessage}`, { error });
        await logUserAction(userId, `AI chapter summary generation failed for upload IDs: ${summaryData.uploadIds.join(', ')}: ${errorMessage}.`, 'error', { uploadIds: summaryData.uploadIds, error: errorMessage });
        throw new HttpsError('internal', `Failed to generate summary: ${errorMessage}`);
    }
});

// Generates a weakness-based test for a user.
export const generateWeaknessBasedTest = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const generateData = Validation.validateInput(Validation.GenerateWeaknessBasedTestCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const { allMcqs, testSize } = generateData; // allMcqs now contains only IDs and metadata from frontend

    // Fetch user's detailed attempt history
    const attemptedMcqsSnapshot = await db.collection('users').doc(userId).collection('attemptedMCQs').get();
    const userAttempts: Record<string, types.AttemptedMCQDocument> = {};
    attemptedMcqsSnapshot.docs.forEach(doc => {
        const data = doc.data() as types.AttemptedMCQDocument;
        if (data.latestAttempt) {
            userAttempts[doc.id] = data;
        }
    });

    // 1. Prioritize recently incorrect questions
    const relevantWeakMcqIds = allMcqs.filter(mcq =>
        userAttempts[mcq.id] && userAttempts[mcq.id].latestAttempt.isCorrect === false &&
        (userAttempts[mcq.id].latestAttempt.lastAttempted as Timestamp).toDate() > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Incorrect in last 30 days
    ).map(mcq => mcq.id);

    // 2. Prioritize questions due for review (SM-2)
    const reviewDueMcqIds = allMcqs.filter(mcq => {
        const attemptDoc = userAttempts[mcq.id];
        return attemptDoc && attemptDoc.latestAttempt.nextReviewDate && (attemptDoc.latestAttempt.nextReviewDate as Timestamp).toDate() <= new Date();
    }).map(mcq => mcq.id);

    // Combine and shuffle the high-priority pools
    let pool = Array.from(new Set([...relevantWeakMcqIds, ...reviewDueMcqIds])).sort(() => 0.5 - Math.random());

    // 3. Fill remaining slots with medium difficulty unattempted questions
    const remainingToFill = testSize - pool.length;
    if (remainingToFill > 0) {
        const mediumDifficultyMcqs = allMcqs
            .filter(mcq => mcq.difficulty === 'medium' && !pool.includes(mcq.id) && !userAttempts[mcq.id]) // Not already in pool and not attempted
            .sort(() => 0.5 - Math.random()) // Randomize selection
            .slice(0, remainingToFill)
            .map(mcq => mcq.id);
        pool.push(...mediumDifficultyMcqs);
    }

    // 4. If still not enough, fill with any random unattempted or long-ago correctly answered questions
    if (pool.length < testSize) {
        const randomSupplement = allMcqs
            .filter(mcq => !pool.includes(mcq.id)) // Not already in pool
            .sort(() => 0.5 - Math.random()) // Randomize selection
            .slice(0, testSize - pool.length) // Take only what's needed
            .map(mcq => mcq.id);
        pool.push(...randomSupplement);
    }

    // Final shuffle and trim to testSize
    const finalMcqIds = pool.sort(() => 0.5 - Math.random()).slice(0, testSize);
    logger.info(`Generated weakness-based test for user ${userId} with ${finalMcqIds.length} MCQs.`);
    await logUserAction(userId, `Generated AI Weakness Test with ${finalMcqIds.length} questions.`, 'info', { testSize: finalMcqIds.length });
    return { mcqIds: finalMcqIds };
});

// Generates a small daily warmup quiz for a user.
export const getDailyWarmupQuiz = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const warmupData = Validation.validateInput(Validation.GetDailyWarmupQuizCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    // Fetch up to 200 approved MCQs across both collections for a diverse pool
    const allMasterMcqsSnapshot = await db.collection('MasterMCQ')
        .where('status', '==', 'approved')
        .limit(100)
        .get();
    const allMarrowMcqsSnapshot = await db.collection('MarrowMCQ')
        .where('status', '==', 'approved')
        .limit(100)
        .get();

    const allApprovedMcqs: types.MCQ[] = [
        ...allMasterMcqsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as types.MCQ)),
        // CRITICAL FIX: Corrected variable name from marrowMcqSnapshot to allMarrowMcqsSnapshot
        ...allMarrowMcqsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as types.MCQ))
    ];

    if (allApprovedMcqs.length === 0) {
        logger.info(`No approved MCQs found for daily warmup quiz.`);
        return { mcqIds: [] };
    }

    // Fetch user's detailed attempt history
    const attemptedMcqsSnapshot = await db.collection('users').doc(userId).collection('attemptedMCQs').get();
    const userAttempts: Record<string, types.AttemptedMCQDocument> = {};
    attemptedMcqsSnapshot.docs.forEach(doc => {
        const data = doc.data() as types.AttemptedMCQDocument;
        if (data.latestAttempt) {
            userAttempts[doc.id] = data;
        }
    });

    // Prioritization for Daily Warmup (mix of new, review, and recent mistakes)
    const candidateMcqIds: string[] = [];

    // 1. Questions due for review today (SM-2 algorithm) - highest priority
    const reviewDue = allApprovedMcqs.filter(mcq => {
        const attemptDoc = userAttempts[mcq.id];
        return attemptDoc && attemptDoc.latestAttempt.nextReviewDate && (attemptDoc.latestAttempt.nextReviewDate as Timestamp).toDate() <= new Date();
    }).map(mcq => mcq.id);
    const shuffledReviewDue = reviewDue.sort(() => 0.5 - Math.random());
    candidateMcqIds.push(...shuffledReviewDue.slice(0, 5)); // Up to 5 review questions

    // 2. Recently incorrect questions not yet due for review
    const recentlyIncorrect = allApprovedMcqs.filter(mcq =>
        userAttempts[mcq.id]?.latestAttempt.isCorrect === false && !candidateMcqIds.includes(mcq.id)
    ).map(mcq => mcq.id);
    const shuffledIncorrect = recentlyIncorrect.sort(() => 0.5 - Math.random());
    if (candidateMcqIds.length < 10) {
        candidateMcqIds.push(...shuffledIncorrect.filter(id => !candidateMcqIds.includes(id)).slice(0, Math.min(3, 10 - candidateMcqIds.length))); // Up to 3 recent incorrect
    }

    // 3. Unattempted questions
    const unattempted = allApprovedMcqs.filter(mcq =>
        !userAttempts[mcq.id] && !candidateMcqIds.includes(mcq.id)
    ).map(mcq => mcq.id);
    const shuffledUnattempted = unattempted.sort(() => 0.5 - Math.random());
    if (candidateMcqIds.length < 10) {
        candidateMcqIds.push(...shuffledUnattempted.slice(0, 10 - candidateMcqIds.length)); // Fill with unattempted
    }

    // 4. Fill remaining slots with random questions from any source
    if (candidateMcqIds.length < 10) {
        const randomFill = allApprovedMcqs.filter(mcq => !candidateMcqIds.includes(mcq.id))
            .sort(() => 0.5 - Math.random())
            .slice(0, 10 - candidateMcqIds.length)
            .map(mcq => mcq.id);
        candidateMcqIds.push(...randomFill);
    }

    const finalMcqIds = candidateMcqIds.slice(0, 10); // Ensure exactly 10 questions or fewer if not enough exist
    logger.info(`Generated daily warmup quiz for user ${userId} with ${finalMcqIds.length} MCQs.`);
    await logUserAction(userId, `Generated Daily Warm-up Quiz with ${finalMcqIds.length} questions.`, 'info', { quizSize: finalMcqIds.length });
    return { mcqIds: finalMcqIds };
});

// Generates performance advice for a user based on their study stats.
export const generatePerformanceAdvice = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const adviceData = Validation.validateInput(Validation.GeneratePerformanceAdviceCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const { overallAccuracy, strongTopics, weakTopics } = adviceData;

    const prompt = `Generate personalized study advice and encouragement for a dedicated medical student based on their quiz performance. Frame it positively to motivate continued learning.
    Overall Accuracy: ${overallAccuracy.toFixed(1)}%
    Strong Topics: ${strongTopics.join(', ') || 'N/A'}
    Weak Topics: ${weakTopics.join(', ') || 'N/A'}

    Provide actionable tips, effective study strategies, and strong encouragement to keep them engaged. Include phrases like "You're close to mastery," "Keep up the fantastic work!" or "Every question is a step forward." Conclude with a strong call to action to continue studying. Suggest reviewing specific incorrect questions or starting a weakness test. Use emojis where appropriate to make it more engaging.`;

    try {
        const result = await _powerfulModel.generateContent(prompt); // Use powerful model for advice generation
        const advice = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "I'm unable to generate advice at this moment. Please try again later.";
        logger.info(`Generated performance advice. Accuracy: ${overallAccuracy.toFixed(1)}%.`);
        await logUserAction(userId, `Generated AI performance advice. Accuracy: ${overallAccuracy.toFixed(1)}%.`, 'info', { overallAccuracy, strongTopics, weakTopics });
        return { advice };
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error generating performance advice: ${errorMessage}`, { error });
        await logUserAction(userId, `Failed to generate AI performance advice: ${errorMessage}.`, 'error', { error: errorMessage });
        throw new HttpsError('internal', `Failed to generate advice: ${errorMessage}`);
    }
});

// Generates quiz session feedback based on a completed quiz result.
export const getQuizSessionFeedback = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const feedbackData = Validation.validateInput(Validation.GetQuizSessionFeedbackCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const { quizResultId } = feedbackData;

    const quizResultDoc = await db.collection('quizResults').doc(quizResultId).get();
    if (!quizResultDoc.exists) {
        throw new HttpsError('not-found', 'Quiz result not found.');
    }
    const quizResultData = quizResultDoc.data() as types.QuizResult;

    // Fetch the actual MCQ content for detailed feedback
    const mcqIds = quizResultData.mcqAttempts.map(a => a.mcqId);
    const mcqs: types.MCQ[] = [];
    if (mcqIds.length > 0) {
        const chunks = [];
        for (let i = 0; i < mcqIds.length; i += 10) { // Chunking for 'in' query limit
            chunks.push(mcqIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
            const masterSnap = await db.collection('MasterMCQ').where(FieldPath.documentId(), 'in', chunk).get();
            masterSnap.forEach(doc => mcqs.push({ ...doc.data(), id: doc.id } as types.MCQ));
            const marrowSnap = await db.collection('MarrowMCQ').where(FieldPath.documentId(), 'in', chunk).get();
            marrowSnap.forEach(doc => mcqs.push({ ...doc.data(), id: doc.id } as types.MCQ));
        }
    }

    const correctCount = quizResultData.score;
    const totalCount = quizResultData.totalQuestions;
    const incorrectAttempts = quizResultData.mcqAttempts.filter(a => !a.isCorrect);

    let incorrectQuestionsSummary = "";
    if (incorrectAttempts.length > 0) {
        incorrectQuestionsSummary = "Questions answered incorrectly:\n";
        incorrectAttempts.forEach(attempt => {
            const mcq = mcqs.find(m => m.id === attempt.mcqId);
            if (mcq) {
                incorrectQuestionsSummary += `- ${mcq.question.substring(0, Math.min(mcq.question.length, 100))}... (Your answer: ${attempt.selectedAnswer || 'N/A'}, Correct: ${attempt.correctAnswer})\n`;
            }
        });
    }

    const prompt = `Provide constructive feedback on a medical quiz performance. Focus on motivating the user to continue learning and improving.
    Quiz Mode: ${quizResultData.mode}
    Total Questions: ${totalCount}
    Correct Answers: ${correctCount}
    Incorrect Answers: ${totalCount - correctCount}
    Duration: ${quizResultData.durationSeconds ? `${quizResultData.durationSeconds} seconds` : 'N/A'}

    ${incorrectQuestionsSummary}

    Give actionable advice and highlight areas for improvement. Use encouraging language. For example, if there are incorrect answers, suggest reviewing those specific concepts or topics. If accuracy is low, suggest a more focused study approach. Always end with a positive, forward-forward-looking statement to encourage the next study session. Suggest reviewing specific incorrect questions or starting a weakness test. Use emojis frequently to make the feedback engaging.`;

    try {
        const result = await _powerfulModel.generateContent(prompt); // Use powerful model for feedback generation
        const feedback = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "No detailed feedback could be generated.";
        logger.info(`Generated quiz session feedback for result ${quizResultId}.`);
        await logUserAction(userId, `Generated AI feedback for quiz ${quizResultId}.`, 'info', { quizId: quizResultId, score: quizResultData.score, totalQuestions: quizResultData.totalQuestions });
        return { feedback };
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error generating quiz session feedback for result ${quizResultId}: ${errorMessage}`, { error });
        await logUserAction(userId, `Failed to generate AI feedback for quiz ${quizResultId}: ${errorMessage}.`, 'error', { quizId: quizResultId, error: errorMessage });
        throw new HttpsError('internal', `Failed to generate feedback: ${errorMessage}`);
    }
});

// Generates a concise hint for an MCQ.
export const getHint = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const hintData = Validation.validateInput(Validation.GetHintCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    let mcqData: types.MCQ | undefined;
    const masterMcqDoc = await db.collection('MasterMCQ').doc(hintData.mcqId).get();
    if (masterMcqDoc.exists) {
        mcqData = masterMcqDoc.data() as types.MCQ;
    } else {
        const marrowMcqDoc = await db.collection('MarrowMCQ').doc(hintData.mcqId).get();
        if (marrowMcqDoc.exists) {
            mcqData = marrowMcqDoc.data() as types.MCQ;
        }
    }
    if (!mcqData) {
        throw new HttpsError('not-found', 'MCQ not found.');
    }

    const correctAnswerText = mcqData.correctAnswer || (mcqData.answer && mcqData.options?.[mcqData.answer.charCodeAt(0) - 'A'.charCodeAt(0)]) || mcqData.answer;

    const prompt = `Provide a very concise, one-sentence hint for the following medical multiple-choice question. The hint should subtly nudge the user towards the correct answer without directly revealing it, making it feel like a puzzle they can solve. Do not mention specific options A, B, C, D.
    Question: ${mcqData.question}
    Options: ${mcqData.options.join(', ')}
    Explanation (for context only): ${mcqData.explanation || 'N/A'}`;

    try {
        const result = await _quickModel.generateContent(prompt); // Use quick model for hints
        const hint = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I can't provide a hint right now.";
        logger.info(`Generated hint for MCQ ${hintData.mcqId}.`);
        await logUserAction(userId, `Requested hint for MCQ ${hintData.mcqId}.`, 'info', { mcqId: hintData.mcqId });
        return { hint };
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error generating hint for MCQ ${hintData.mcqId}: ${errorMessage}`, { error });
        await logUserAction(userId, `Failed to generate hint for MCQ ${hintData.mcqId}: ${errorMessage}.`, 'error', { mcqId: hintData.mcqId, error: errorMessage });
        throw new HttpsError('internal', `Failed to generate hint: ${errorMessage}`);
    }
});

// Evaluates a user's free text answer against an MCQ's correct answer using AI.
export const evaluateFreeTextAnswer = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const evaluateData = Validation.validateInput(Validation.EvaluateFreeTextAnswerCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    let mcqData: types.MCQ | undefined;
    const masterMcqDoc = await db.collection('MasterMCQ').doc(evaluateData.mcqId).get();
    if (masterMcqDoc.exists) {
        mcqData = masterMcqDoc.data() as types.MCQ;
    } else {
        const marrowMcqDoc = await db.collection('MarrowMCQ').doc(evaluateData.mcqId).get();
        if (marrowMcqDoc.exists) {
            mcqData = marrowMcqDoc.data() as types.MCQ;
        }
    }
    if (!mcqData) {
        throw new HttpsError('not-found', 'MCQ not found.');
    }

    const correctAnswerText = mcqData.correctAnswer || (mcqData.answer && mcqData.options?.[mcqData.answer.charCodeAt(0) - 'A'.charCodeAt(0)]) || mcqData.answer;

    const prompt = `Given the medical question, the precise correct answer, and the user's free text answer, determine if the user's answer is correct (true/false) and provide concise feedback. Focus on conceptual correctness, allowing for minor phrasing variations.
    Question: ${mcqData.question}
    Correct Answer: ${correctAnswerText}
    User Answer: ${evaluateData.userAnswer}
    Explanation (for context only): ${mcqData.explanation || 'N/A'}
    
    Respond with a JSON object: {"isCorrect": true/false, "feedback": "Why it's correct/incorrect."}.`;

    try {
        const result = await _powerfulModel.generateContent(prompt); // Use powerful model for evaluation
        const aiResponse = extractJson(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
        logger.info(`Evaluated free text answer for MCQ ${evaluateData.mcqId}. Correct: ${aiResponse.isCorrect}.`);
        await logUserAction(userId, `Evaluated free text answer for MCQ ${evaluateData.mcqId}. Result: ${aiResponse.isCorrect ? 'Correct' : 'Incorrect'}.`, 'info', { mcqId: evaluateData.mcqId, isCorrect: aiResponse.isCorrect });
        return { isCorrect: aiResponse.isCorrect || false, feedback: aiResponse.feedback || "Evaluation failed." };
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error evaluating free text answer for MCQ ${evaluateData.mcqId}: ${errorMessage}`, { error });
        await logUserAction(userId, `Failed to evaluate free text answer for MCQ ${evaluateData.mcqId}: ${errorMessage}.`, 'error', { mcqId: evaluateData.mcqId, error: errorMessage });
        throw new HttpsError('internal', `Failed to evaluate answer: ${errorMessage}`);
    }
});

// Creates a Flashcard from an existing MCQ using AI (Admin only).
export const createFlashcardFromMcq = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const createFcData = Validation.validateInput(Validation.CreateFlashcardFromMcqCallableDataSchema, request.data);
    const userId = await ensureAdmin(request); // Only admin can create new content

    let mcqData: types.MCQ | undefined;
    const masterMcqDoc = await db.collection('MasterMCQ').doc(createFcData.mcqId).get();
    if (masterMcqDoc.exists) {
        mcqData = masterMcqDoc.data() as types.MCQ;
    } else {
        const marrowMcqDoc = await db.collection('MarrowMCQ').doc(createFcData.mcqId).get();
        if (marrowMcqDoc.exists) {
            mcqData = marrowMcqDoc.data() as types.MCQ;
        }
    }
    if (!mcqData) throw new HttpsError('not-found', 'MCQ not found.');

    const prompt = `Convert the following medical multiple-choice question and its explanation into a single, highly memorable flashcard.
    The 'front' should be a concise question or a cloze deletion statement (fill-in-the-blank).
    The 'back' should contain the precise answer and a brief, high-yield explanation. If possible and relevant, also include a short mnemonic or a memorable clinical pearl.
    
    Question: ${mcqData.question}
    Options: ${mcqData.options.join(', ')}
    Answer: ${mcqData.correctAnswer || (mcqData.answer && mcqData.options?.[mcqData.answer.charCodeAt(0) - 'A'.charCodeAt(0)]) || mcqData.answer}
    Explanation: ${mcqData.explanation || ''}

    Provide the output in strict JSON format: {"front": "Flashcard Question/Cloze", "back": "Flashcard Answer/Concept", "mnemonic": "Optional Mnemonic or Clinical Pearl"}. If no mnemonic is generated, omit the field.`;

    try {
        const result = await _powerfulModel.generateContent(prompt); // Use powerful model for flashcard creation
        const flashcardData = extractJson(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');

        if (!flashcardData.front || !flashcardData.back) {
            throw new Error("AI failed to generate valid flashcard content (missing front or back).");
        }

        const newFlashcard: types.Flashcard = {
            id: db.collection('Flashcards').doc().id,
            front: flashcardData.front,
            back: flashcardData.back,
            topicName: mcqData.topicName,
            topicId: mcqData.topicId,
            chapterName: mcqData.chapterName,
            chapterId: mcqData.chapterId,
            creatorId: userId,
            createdAt: FieldValue.serverTimestamp() as Timestamp,
            source: 'AI_Generated_From_MCQ', // Indicate origin
            status: 'approved', // Mark as approved
            tags: (mcqData.tags || []).map(tag => tag.toLowerCase()), // Inherit and normalize tags
            uploadId: mcqData.uploadId,
            mnemonic: flashcardData.mnemonic || undefined,
            type: 'flashcard',
        };

        await db.collection('Flashcards').doc(newFlashcard.id).set(newFlashcard);
        logger.info(`Admin ${userId} created flashcard ${newFlashcard.id} from MCQ ${createFcData.mcqId}.`);
        await logUserAction(userId, `Generated Flashcard ${newFlashcard.id} from MCQ ${createFcData.mcqId}.`, 'info', { flashcardId: newFlashcard.id, mcqId: createFcData.mcqId });

        // Update topic/chapter flashcard counts in a transaction
        const topicCollectionName = mcqData.source?.startsWith('Marrow') ? 'MarrowTopics' : 'Topics';
        const topicRef = db.collection(topicCollectionName).doc(mcqData.topicId);

        await db.runTransaction(async (transaction) => {
            const topicDoc = await transaction.get(topicRef);
            if (topicDoc.exists) {
                let chapters: types.Chapter[] | string[] = topicDoc.data()?.chapters || [];

                if (topicCollectionName === 'MarrowTopics') {
                    // For Marrow: chapters are objects
                    let marrowChapters = chapters as types.Chapter[];
                    const chapterIndex = marrowChapters.findIndex(ch => ch.id === mcqData.chapterId);
                    if (chapterIndex !== -1) {
                        marrowChapters[chapterIndex].flashcardCount = (marrowChapters[chapterIndex].flashcardCount || 0) + 1;
                        marrowChapters[chapterIndex].updatedAt = FieldValue.serverTimestamp() as Timestamp;
                    } else {
                        logger.warn(`Chapter ${mcqData.chapterId} not found in Marrow topic ${mcqData.topicId} during flashcard count update.`);
                        // Potentially add the chapter if it's truly missing, or throw an error.
                    }
                    transaction.update(topicRef, {
                        chapters: marrowChapters,
                        totalFlashcardCount: FieldValue.increment(1),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                } else {
                    // For General: chapters are strings. Only update totalFlashcardCount
                    transaction.update(topicRef, {
                        totalFlashcardCount: FieldValue.increment(1),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                    // Ensure the chapter string exists in the topic's chapters array if it's a new association
                    const chapterName = mcqData.chapterName;
                    // CRITICAL FIX: Ensure chapterName is treated as string for arrayUnion
                    if (chapterName && !(chapters as string[]).includes(chapterName)) {
                        transaction.update(topicRef, { chapters: FieldValue.arrayUnion(chapterName as string) });
                    }
                }
            } else {
                logger.warn(`Topic ${mcqData.topicId} not found during flashcard count update.`);
            }
        });

        return { flashcardId: newFlashcard.id, message: "Flashcard created successfully." };

    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error creating flashcard from MCQ ${createFcData.mcqId}: ${errorMessage}`, { error });
        await logUserAction(userId, `Failed to generate Flashcard from MCQ ${createFcData.mcqId}: ${errorMessage}.`, 'error', { mcqId: createFcData.mcqId, error: errorMessage });
        throw new HttpsError('internal', `Failed to create flashcard: ${errorMessage}`);
    }
});

// Creates a custom test based on selected chapters.
export const createCustomTest = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const customTestData = Validation.validateInput(Validation.CreateCustomTestCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const { title, questions } = customTestData; // 'questions' are chapter IDs here

    const testRef = db.collection('customTests').doc();
    const testId = testRef.id;

    // Filter MCQs based on provided chapter IDs and approved status
    const mcqsInSelectedChapters: types.MCQ[] = [];
    // Firestore 'in' query supports up to 10 items. Chunking is required for more chapterIds.
    const chapterIdChunks = [];
    for (let i = 0; i < questions.length; i += 10) {
        chapterIdChunks.push(questions.slice(i, i + 10));
    }

    for (const chunk of chapterIdChunks) {
        const masterMcqSnapshot = await db.collection('MasterMCQ')
            .where('chapterId', 'in', chunk)
            .where('status', '==', 'approved')
            .get();
        masterMcqSnapshot.forEach(doc => mcqsInSelectedChapters.push(doc.data() as types.MCQ));

        const marrowMcqSnapshot = await db.collection('MarrowMCQ')
            .where('chapterId', 'in', chunk)
            .where('status', '==', 'approved')
            .get();
        marrowMcqSnapshot.forEach(doc => mcqsInSelectedChapters.push(doc.data() as types.MCQ));
    }


    // Shuffle the collected MCQs to randomize the test order
    const shuffledMcqIds = mcqsInSelectedChapters
        .map(mcq => mcq.id)
        .sort(() => 0.5 - Math.random());

    const newCustomTest = {
        id: testId,
        userId: userId,
        title: title,
        mcqIds: shuffledMcqIds, // Store the actual MCQ IDs selected for the test
        chapterIds: questions, // Store the original chapter IDs that informed selection
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    };

    await testRef.set(newCustomTest);
    logger.info(`Custom test ${testId} created by user ${userId}.`);
    await logUserAction(userId, `Created custom test "${title}" with ${shuffledMcqIds.length} questions from ${questions.length} chapters.`, 'info', { testId, title, questionCount: shuffledMcqIds.length });
    return { success: true, testId: testId, questions: shuffledMcqIds }; // Return the actual MCQ IDs selected
});

// Fetches user activity logs.
export const getUserLogs = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request); // Logs are user-specific

    const logsRef = db.collection('logs');
    // Query for logs belonging to the current user, ordered by timestamp descending
    const q = logsRef.where('userId', '==', userId).orderBy('timestamp', 'desc').limit(100);

    try {
        const snapshot = await q.get();
        const logs = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                message: data.message,
                timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : data.timestamp,
                type: data.type,
                context: data.context
            } as types.LogEntry;
        });
        logger.info(`Fetched ${logs.length} logs for user ${userId}.`);
        return { logs: logs };
    } catch (error: any) {
        logger.error(`Error fetching user logs for ${userId}:`, { error });
        throw new HttpsError('internal', `Failed to retrieve logs: ${error.message}`);
    }
});


// Sets a new goal for a user.
export const setGoal = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const goalData = Validation.validateInput(Validation.SetGoalCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const goalRef = db.collection('users').doc(userId).collection('goals').doc();
    const goalId = goalRef.id;

    const newGoal: types.Goal = {
        id: goalId,
        userId: userId,
        title: goalData.title,
        targetDate: Timestamp.fromDate(goalData.targetDate as Date), // Convert date string to Timestamp
        progress: goalData.progress || 0,
        type: goalData.type,
        targetValue: goalData.targetValue,
        currentValue: goalData.currentValue || 0,
        chapterId: goalData.chapterId,
        topicId: goalData.topicId,
        isCompleted: goalData.isCompleted || false,
        reward: goalData.reward || undefined,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    };

    await goalRef.set(newGoal);
    logger.info(`Goal ${goalId} created for user ${userId}.`);
    await logUserAction(userId, `Created new goal: "${goalData.title}".`, 'info', { goalId, title: goalData.title });
    return { success: true, goalId: goalId };
});

// Updates an existing goal for a user.
export const updateGoal = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const updateGoalData = Validation.validateInput(Validation.UpdateGoalCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const { id: goalId, ...rest } = updateGoalData;

    const goalRef = db.collection('users').doc(userId).collection('goals').doc(goalId);

    // Prepare updates, converting targetDate to Timestamp if it's a Date object
    const updatesToApply: Partial<types.Goal> = {
        title: rest.title,
        progress: rest.progress,
        type: rest.type,
        targetValue: rest.targetValue,
        currentValue: rest.currentValue,
        chapterId: rest.chapterId,
        topicId: rest.topicId,
        isCompleted: rest.isCompleted,
        reward: rest.reward,
    };

    if (rest.targetDate instanceof Date) {
        updatesToApply.targetDate = Timestamp.fromDate(rest.targetDate);
    }

    // Special handling for goal completion
    if (updatesToApply.isCompleted === true) {
        updatesToApply.progress = 100; // Force progress to 100% on completion
        const currentGoal = await goalRef.get();
        // Check if goal was just completed and if it has a reward
        if (currentGoal.exists && !currentGoal.data()?.isCompleted && updatesToApply.reward) {
            logger.info(`User ${userId} completed goal ${goalId} and earned reward: ${updatesToApply.reward}`);
            await logUserAction(userId, `Completed goal "${currentGoal.data()?.title}". Reward: ${updatesToApply.reward}.`, 'info', { goalId, reward: updatesToApply.reward });
            // Potentially add reward to user's profile here (e.g., add to badges array, unlock theme)
        }
    }

    await goalRef.update({ ...updatesToApply, updatedAt: FieldValue.serverTimestamp() });
    logger.info(`Goal ${goalId} updated for user ${userId}.`);
    await logUserAction(userId, `Updated goal "${goalId}".`, 'info', { goalId, updates: rest });
    return { success: true, message: `Goal ${goalId} updated.` };
});

// Deletes a goal for a user.
export const deleteGoal = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const deleteGoalData = Validation.validateInput(Validation.DeleteGoalCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const { goalId } = deleteGoalData;

    const goalRef = db.collection('users').doc(userId).collection('goals').doc(goalId);
    await goalRef.delete();
    logger.info(`Goal ${goalId} deleted for user ${userId}.`);
    await logUserAction(userId, `Deleted goal "${goalId}".`, 'warn', { goalId });
    return { success: true, message: `Goal ${goalId} deleted.` };
});

// Fetches or generates a user's daily goal.
export const getDailyGoal = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const dailyGoalData = Validation.validateInput(Validation.GetDailyGoalCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    // Check for an active daily goal for today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const activeDailyGoalSnapshot = await db.collection('users').doc(userId).collection('goals')
        .where('type', '==', 'daily')
        .where('isCompleted', '==', false) // Only fetch incomplete goals
        .where('targetDate', '>=', Timestamp.fromDate(startOfToday)) // Target date is today or in the future
        .limit(1)
        .get();

    if (!activeDailyGoalSnapshot.empty) {
        const existingGoal = activeDailyGoalSnapshot.docs[0].data() as types.Goal;
        logger.info(`User ${userId} fetched existing daily goal: ${existingGoal.id}.`);
        return { success: true, goal: existingGoal };
    }

    // If no active daily goal, generate a new one
    const goalOptions = [
        { title: "Complete 10 MCQs", type: "mcq_count", targetValue: 10, reward: "100 bonus XP", sourceTopic: "General Pediatrics", sourceChapter: "Vaccinations" },
        { title: "Review 5 Flashcards", type: "mcq_count", targetValue: 5, reward: "50 bonus XP", sourceTopic: "Pediatric Cardiology", sourceChapter: "Congenital Heart Defects" },
        { title: "Study 15 minutes", type: "study_time", targetValue: 0.25, reward: "75 bonus XP" }, // 0.25 hours = 15 minutes
    ];

    const randomGoal = goalOptions[Math.floor(Math.random() * goalOptions.length)];

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999); // Set target date to end of today

    const newGoalData: Omit<types.GoalInput, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
        title: randomGoal.title,
        targetDate: endOfToday,
        progress: 0,
        type: randomGoal.type as 'chapter' | 'mcq_count' | 'study_time',
        targetValue: randomGoal.targetValue,
        currentValue: 0,
        reward: randomGoal.reward,
        chapterId: randomGoal.sourceChapter ? normalizeId(randomGoal.sourceChapter) : undefined, // Normalized chapter ID
        topicId: randomGoal.sourceTopic ? normalizeId(randomGoal.sourceTopic) : undefined, // Normalized topic ID
    };

    const goalRef = db.collection('users').doc(userId).collection('goals').doc();
    const newGoalId = goalRef.id;

    const newGoal: types.Goal = {
        id: newGoalId,
        userId: userId,
        title: newGoalData.title,
        targetDate: Timestamp.fromDate(newGoalData.targetDate as Date),
        progress: newGoalData.progress || 0,
        type: newGoalData.type,
        targetValue: newGoalData.targetValue,
        currentValue: newGoalData.currentValue || 0,
        reward: newGoalData.reward,
        isCompleted: false, // Newly created daily goal is incomplete
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    };

    await goalRef.set(newGoal);
    logger.info(`Generated new daily goal ${newGoalId} for user ${userId}: ${newGoal.title}.`);
    await logUserAction(userId, `Generated new daily goal: "${newGoal.title}".`, 'info', { goalId: newGoalId, title: newGoal.title });
    return { success: true, goal: newGoal };
});

// Generates a Quick Fire test with a specified number of MCQs.
export const generateQuickFireTest = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const quickFireData = Validation.validateInput(Validation.GenerateQuickFireTestCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const { testSize } = quickFireData;

    // Fetch a pool of medium to hard approved MCQs
    const masterMcqQuery = db.collection('MasterMCQ')
        .where('status', '==', 'approved')
        .where('difficulty', 'in', ['medium', 'hard'])
        .limit(testSize * 5); // Fetch more than needed to ensure variety

    const marrowMcqQuery = db.collection('MarrowMCQ')
        .where('status', '==', 'approved')
        .where('difficulty', 'in', ['medium', 'hard'])
        .limit(testSize * 5);

    const [masterSnapshot, marrowSnapshot] = await Promise.all([masterMcqQuery.get(), marrowMcqQuery.get()]);

    const allCandidateMcqs: types.MCQ[] = [
        ...masterSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as types.MCQ)),
        ...marrowSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as types.MCQ))
    ];

    if (allCandidateMcqs.length === 0) {
        throw new HttpsError('not-found', 'No suitable MCQs found for a Quick Fire test. Please add more content.');
    }

    // Randomly select MCQs up to testSize
    const selectedMcqIds = allCandidateMcqs
        .sort(() => 0.5 - Math.random()) // Shuffle
        .slice(0, testSize) // Take the requested size
        .map(mcq => mcq.id);

    if (selectedMcqIds.length === 0) {
        throw new HttpsError('not-found', 'Could not assemble a Quick Fire test with the requested size. Try a smaller size or add more content.');
    }

    logger.info(`Generated Quick Fire test for user ${userId} with ${selectedMcqIds.length} MCQs.`);
    await logUserAction(userId, `Generated Quick Fire Test with ${selectedMcqIds.length} questions.`, 'info', { testSize: selectedMcqIds.length });
    return { mcqIds: selectedMcqIds };
});

// Updates user's preferred theme.
export const updateTheme = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const themeData = Validation.validateInput(Validation.UpdateThemeCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const { themeName } = themeData;

    const userRef = db.collection('users').doc(userId);
    await userRef.update({ theme: themeName, updatedAt: FieldValue.serverTimestamp() });

    logger.info(`User ${userId} updated theme to ${themeName}.`);
    await logUserAction(userId, `Updated theme to "${themeName}".`, 'info', { theme: themeName });
    return { success: true, message: `Theme updated to ${themeName}.` };
});

// Sends a push notification to a user's device. (Requires Firebase Messaging setup)
export const sendPushNotification = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    // CRITICAL FIX: Re-enable Zod validation
    const notificationData = Validation.validateInput(Validation.SendPushNotificationCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request); // User must be authenticated to send notifications on their behalf

    const { token, title, body, data } = notificationData;

    try {
        const message = {
            notification: { title, body },
            token: token, // FCM registration token
            data: data || {}, // Optional custom data
        };
        const response = await admin.messaging().send(message);
        logger.info(`Successfully sent message to token ${token}: ${response}`);
        await logUserAction(userId, `Sent push notification: "${title}".`, 'info', { title, token, messagingResponse: response });
        return { success: true, message: `Notification sent successfully: ${response}` };
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error sending message to token ${token}: ${error}`);
        await logUserAction(userId, `Failed to send push notification: "${title}".`, 'error', { title, token, error: errorMessage });
        throw new HttpsError('internal', `Error sending notification: ${errorMessage}`);
    }
});

// NEW FEATURE: Generate Cram Sheet (Feature #10)
export const generateCramSheet = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const cramSheetData = Validation.validateInput(Validation.GenerateCramSheetCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request); // Ensure user is authenticated

    ensureClientsInitialized();

    const { chapterIds, topicIds, content, title } = cramSheetData;

    let sourceText = content || '';

    // If content is not provided directly, fetch from specified chapters/topics
    if (!sourceText && ((chapterIds && chapterIds.length > 0) || (topicIds && topicIds.length > 0))) {
        let textChunks: string[] = [];

        // Fetch text from chapters if chapterIds are provided
        if (chapterIds && chapterIds.length > 0) {
            for (const chapterId of chapterIds) {
                // Try fetching from General Topic subcollection notes
                const generalChapterNotesSnap = await db.collection('Topics').doc('general').collection('ChapterNotes').doc(chapterId).get();
                if (generalChapterNotesSnap.exists) {
                    textChunks.push(generalChapterNotesSnap.data()?.summaryNotes || '');
                }
                // Also check Marrow chapters (notes are embedded)
                const marrowTopicsSnap = await db.collection('MarrowTopics').get();
                marrowTopicsSnap.docs.forEach(topicDoc => {
                    const marrowChapters = topicDoc.data()?.chapters as types.Chapter[] || [];
                    const foundMarrowChapter = marrowChapters.find(ch => ch.id === chapterId);
                    if (foundMarrowChapter?.summaryNotes) {
                        textChunks.push(foundMarrowChapter.summaryNotes);
                    }
                });
            }
        }
        // If topicIds are provided as a fallback or augmentation for content
        if (topicIds && topicIds.length > 0 && textChunks.length === 0) { // Only try if no chapter text found
            // This part is more complex as topics don't directly store large text bodies.
            // Would need to fetch all chapters for those topics, then potentially their sourceUploadIds to get sourceText.
            // For initial implementation, we'll keep it simple and focus on chapter notes or direct content.
            logger.warn(`Cram sheet requested by topicId but no direct notes found for chapters. Consider adding logic to fetch sourceUploadIds.`);
        }

        sourceText = textChunks.filter(Boolean).join('\n\n');
    }

    if (!sourceText.trim()) {
        throw new HttpsError('invalid-argument', 'No content provided or found for cram sheet generation. Please provide direct content or valid chapter/topic IDs with existing notes.');
    }

    const MAX_CRAM_SHEET_CONTEXT = 30000; // CRITICAL FIX: Defined MAX_CRAM_SHEET_CONTEXT here
    const truncatedText = sourceText.length > MAX_CRAM_SHEET_CONTEXT ? sourceText.substring(0, MAX_CRAM_SHEET_CONTEXT) + "..." : sourceText;

    try {
        const prompt = `Generate a highly concise, high-yield cram sheet from the following medical text. Focus on essential facts, mnemonics, and clinical pearls. Use bullet points, short phrases, and bolding for readability. Aim for a dense, single-page summary suitable for quick review before an exam. Use relevant emojis to enhance memorability and engagement (e.g., 💡, 🔑, 🚨, ⛔️, 💯). Respond strictly in professional Markdown format.
    Content: ${truncatedText}`;

        const result = await _powerfulModel.generateContent(prompt);
        const cramSheetContent = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "No cram sheet could be generated.";

        const cramSheetRef = db.collection('cramSheets').doc(); // Store in a new top-level collection
        const newCramSheet: types.CramSheet = {
            id: cramSheetRef.id,
            userId: userId,
            title: title,
            content: cramSheetContent,
            topicId: topicIds?.[0], // Store first topic ID if available
            chapterId: chapterIds?.[0], // Store first chapter ID if available
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };
        await cramSheetRef.set(newCramSheet);

        logger.info(`User ${userId} generated cram sheet ${cramSheetRef.id} for title: ${title}.`);
        await logUserAction(userId, `Generated cram sheet: "${title}".`, 'info', { cramSheetId: cramSheetRef.id, title });
        return { success: true, cramSheetId: cramSheetRef.id };
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error generating cram sheet for user ${userId}: ${errorMessage}`, { error });
        await logUserAction(userId, `Failed to generate cram sheet for title "${title}": ${errorMessage}.`, 'error', { title, error: errorMessage });
        throw new HttpsError('internal', `Failed to generate cram sheet: ${errorMessage}`);
    }
});

// NEW FEATURE: Get Daily Grind Spaced Repetition Playlist (Feature #7)
export const getDailyGrindPlaylist = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const dailyGrindData = Validation.validateInput(Validation.GetDailyGrindPlaylistCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const { mcqCount, flashcardCount } = dailyGrindData;

    const mcqIds: string[] = [];
    const flashcardIds: string[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today for filtering nextReviewDate

    // Fetch MCQs due for review, ordered by earliest review date
    const mcqReviewQuery = db.collection(`users/${userId}/attemptedMCQs`)
        .where('latestAttempt.nextReviewDate', '<=', Timestamp.fromDate(today))
        .orderBy('latestAttempt.nextReviewDate', 'asc') // Prioritize older reviews
        .limit(mcqCount); // Limit to requested count
    const mcqReviewSnap = await mcqReviewQuery.get();
    mcqReviewSnap.docs.forEach(doc => mcqIds.push(doc.id));

    // Fetch Flashcards due for review, ordered by earliest review date
    const flashcardReviewQuery = db.collection(`users/${userId}/attemptedFlashcards`)
        .where('nextReviewDate', '<=', Timestamp.fromDate(today))
        .orderBy('nextReviewDate', 'asc') // Prioritize older reviews
        .limit(flashcardCount); // Limit to requested count
    const flashcardReviewSnap = await flashcardReviewQuery.get();
    flashcardReviewSnap.docs.forEach(doc => flashcardIds.push(doc.id));

    logger.info(`User ${userId} generated Daily Grind playlist with ${mcqIds.length} MCQs and ${flashcardIds.length} Flashcards.`);
    await logUserAction(userId, `Generated Daily Grind playlist: ${mcqIds.length} MCQs, ${flashcardIds.length} Flashcards.`, 'info', { mcqCount: mcqIds.length, flashcardCount: flashcardIds.length });

    return { mcqIds, flashcardIds };
});

// NEW FEATURE: Get Mock Exam Questions (Feature #8)
export const getMockExamQuestions = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const mockExamData = Validation.validateInput(Validation.GetMockExamQuestionsCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    const { topicIds, chapterIds, questionCount } = mockExamData;

    if (questionCount <= 0) throw new HttpsError('invalid-argument', 'Question count must be positive.');
    if ((!topicIds || topicIds.length === 0) && (!chapterIds || chapterIds.length === 0)) {
        throw new HttpsError('invalid-argument', 'At least one topic or chapter must be selected for a mock exam.');
    }

    let allMcqCandidates: types.MCQ[] = [];

    // Function to fetch from a specific collection based on filters
    const fetchMcqsFromCollection = async (collectionName: string) => {
        let queryRef: FirebaseFirestore.Query = db.collection(collectionName)
            .where('status', '==', 'approved');

        if (topicIds && topicIds.length > 0) {
            // Firestore 'in' query limit is 10
            if (topicIds.length > 10) {
                logger.warn(`Mock exam: More than 10 topicIds provided. Only first 10 will be used for 'in' query.`);
            }
            queryRef = queryRef.where('topicId', 'in', topicIds.slice(0, 10));
        }
        if (chapterIds && chapterIds.length > 0) {
            // Firestore 'in' query limit is 10
            if (chapterIds.length > 10) {
                logger.warn(`Mock exam: More than 10 chapterIds provided. Only first 10 will be used for 'in' query.`);
            }
            queryRef = queryRef.where('chapterId', 'in', chapterIds.slice(0, 10));
        }

        // Fetch more than needed to ensure enough questions after shuffling
        const snapshot = await queryRef.limit(questionCount * 2).get();
        return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as types.MCQ));
    };

    // Fetch from MasterMCQ
    const masterMcqs = await fetchMcqsFromCollection('MasterMCQ');
    allMcqCandidates.push(...masterMcqs);

    // Fetch from MarrowMCQ
    const marrowMcqs = await fetchMcqsFromCollection('MarrowMCQ');
    allMcqCandidates.push(...marrowMcqs);


    // Shuffle and select the exact number of questions
    const finalMcqIds = Array.from(new Set(allMcqCandidates.map(mcq => mcq.id))) // Ensure uniqueness
        .sort(() => 0.5 - Math.random()) // Randomize order
        .slice(0, questionCount); // Take the exact count requested

    if (finalMcqIds.length === 0) {
        throw new HttpsError('not-found', 'No suitable questions found for the mock exam with the selected criteria. Try broader criteria or add more content.');
    }

    logger.info(`User ${userId} generated a mock exam with ${finalMcqIds.length} questions.`);
    await logUserAction(userId, `Generated Mock Exam with ${finalMcqIds.length} questions.`, 'info', { questionCount: finalMcqIds.length, topicIds, chapterIds });

    return { mcqIds: finalMcqIds };
});

// NEW FEATURE: Evaluate Differential Diagnosis (DDx) (Feature #9)
export const evaluateDDx = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const ddxData = Validation.validateInput(Validation.EvaluateDDxCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    ensureClientsInitialized();

    const { clinicalFindings, userAnswer } = ddxData;

    const prompt = `You are a highly experienced pediatric clinician. Given the following clinical findings, evaluate the user's proposed differential diagnoses.
    1. State if the user's answer is good, acceptable, or needs significant improvement.
    2. Provide concise, high-yield feedback:
       - If correct/acceptable, briefly explain why the user's answers are strong.
       - If incorrect/needs improvement, provide the top 3 most likely diagnoses and briefly explain why.
       - Also, provide 1-2 critical distinguishing features for the top diagnoses.
       - Use relevant emojis frequently (e.g., 🔬, 🩺, 💊, 👶, ❤️‍🩹, 🧠).
    3. Respond with a JSON object: {"success": true/false, "feedback": "Your markdown feedback string."}. The success field should be true if the user's answer is good or acceptable, false otherwise.
    
    Clinical Findings: ${clinicalFindings}
    User's Differential Diagnoses: ${userAnswer}`;

    try {
        const result = await _powerfulModel.generateContent(prompt);
        const aiResponse = extractJson(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');

        // Ensure success field is boolean and feedback is string
        const successStatus = typeof aiResponse.success === 'boolean' ? aiResponse.success : false;
        const feedbackMessage = typeof aiResponse.feedback === 'string' ? aiResponse.feedback : "Could not generate feedback.";


        logger.info(`User ${userId} submitted DDx for "${clinicalFindings.substring(0, 50)}...". AI response: ${successStatus}`);
        await logUserAction(userId, `Submitted DDx: "${clinicalFindings.substring(0, 50)}...". Result: ${successStatus ? 'Success' : 'Needs Work'}.`, 'info', { findings: clinicalFindings, userAnswer, aiSuccess: successStatus });

        return { success: successStatus, feedback: feedbackMessage };
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error evaluating DDx for user ${userId}: ${errorMessage}`, { error });
        await logUserAction(userId, `DDx evaluation failed for "${clinicalFindings.substring(0, 50)}...": ${errorMessage}.`, 'error', { findings: clinicalFindings, error: errorMessage });
        throw new HttpsError('internal', `Failed to evaluate DDx: ${errorMessage}`);
    }
});

// NEW FEATURE: Suggest New Goal (Feature #18)
export const suggestNewGoal = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const suggestGoalData = Validation.validateInput(Validation.SuggestNewGoalCallableDataSchema, request.data);
    const userId = ensureAuthenticated(request);

    ensureClientsInitialized();

    const { type, accuracy, weakTopics } = suggestGoalData;

    // Default suggestions if specific data isn't provided or sufficient
    const defaultGoalOptions = [
        { title: "Master 'General Pediatrics' Basics", type: "chapter", chapterId: normalizeId("General Pediatrics"), topicId: normalizeId("General Pediatrics"), reward: "150 Bonus XP" },
        { title: "Complete 25 MCQs Today", type: "mcq_count", targetValue: 25, reward: "50 Bonus XP" },
        { title: "Review 5 Flashcards", type: "mcq_count", targetValue: 5, reward: "50 bonus XP", sourceTopic: "Pediatric Cardiology", sourceChapter: "Congenital Heart Defects" },
        { title: "Study 15 minutes", type: "study_time", targetValue: 0.25, reward: "75 bonus XP" }, // 0.25 hours = 15 minutes
    ];

    let suggestedGoal = defaultGoalOptions[Math.floor(Math.random() * defaultGoalOptions.length)];

    // If weak topics are provided, try to suggest a goal based on one of them
    if (weakTopics && weakTopics.length > 0) {
        const targetWeakTopic = weakTopics[Math.floor(Math.random() * weakTopics.length)];
        // Try to find a chapter within that weak topic
        // We need to query for a topic that matches the weak topic name
        const topicsSnapshot = await db.collection('Topics').where('name', '==', targetWeakTopic).limit(1).get();
        let targetChapterName: string | undefined;
        let targetTopicId: string | undefined;

        if (!topicsSnapshot.empty) {
            const topicData = topicsSnapshot.docs[0].data() as types.Topic;
            targetTopicId = normalizeId(topicData.name);
            if (topicData.chapters && topicData.chapters.length > 0) {
                // Pick a random chapter from the weak topic
                const chapter = (topicData.chapters as string[])[Math.floor(Math.random() * topicData.chapters.length)];
                targetChapterName = chapter;
            }
        }

        if (targetChapterName && targetTopicId) {
            suggestedGoal = {
                title: `Master '${targetChapterName}' in '${targetWeakTopic}'`,
                type: "chapter",
                chapterId: normalizeId(targetChapterName),
                topicId: targetTopicId,
                reward: "200 Bonus XP & 'Topic Deep Dive' Badge" // More substantial reward for weakness
            };
        } else {
            // Fallback to general MCQ goal if no specific chapter found for weak topic
            suggestedGoal = { title: `Practice 50 MCQs on '${targetWeakTopic}'`, type: "mcq_count", targetValue: 50, reward: "150 Bonus XP" };
        }
    } else if (accuracy !== undefined && accuracy < 70) {
        // If overall accuracy is low, suggest a general MCQ goal
        suggestedGoal = { title: "Boost Accuracy: Complete 30 MCQs", type: "mcq_count", targetValue: 30, reward: "75 Bonus XP" };
    }

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const newGoalData: Omit<types.GoalInput, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
        title: suggestedGoal.title,
        targetDate: endOfToday, // Default suggested goals are for today
        progress: 0,
        type: suggestedGoal.type as 'chapter' | 'mcq_count' | 'study_time',
        targetValue: suggestedGoal.targetValue,
        currentValue: 0,
        reward: suggestedGoal.reward,
        chapterId: suggestedGoal.chapterId,
        topicId: suggestedGoal.topicId,
    };

    logger.info(`User ${userId} requested goal suggestion. AI suggested: "${suggestedGoal.title}".`);
    await logUserAction(userId, `AI suggested a new goal: "${newGoalData.title}".`, 'info', { suggestedGoal: newGoalData.title });

    // Note: This function only *suggests* a goal. The frontend will then call `setGoal` to save it.
    // So, we return the structured goal data.
    return { success: true, goal: newGoalData };
});