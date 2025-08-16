// workspaces/functions/src/index.ts
import * as admin from "firebase-admin";
import { FieldValue, Transaction, QueryDocumentSnapshot, Timestamp as FirestoreTimestamp, UpdateData } from "firebase-admin/firestore";
import { onCall, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as functionsV1 from "firebase-functions";
import * as logger from "firebase-functions/logger";
import { VertexAI, GenerativeModel, Content } from "@google-cloud/vertexai";
import { ImageAnnotatorClient, protos } from "@google-cloud/vision";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import {
  MCQ, Flashcard, Chapter, QuizResult, Attempt, AttemptedMCQs, FlashcardAttempt,
  ToggleBookmarkCallableData, DeleteContentItemCallableData,
  ContentGenerationJob, AddAttemptCallableData, AddFlashcardAttemptCallableData, ConfidenceRating,
  GetDailyWarmupQuizCallableData, GetExpandedSearchTermsCallableData, GetHintCallableData,
  EvaluateFreeTextAnswerCallableData, CreateFlashcardFromMcqCallableData, PediaquizTopicType, AssignmentSuggestion,
  SuggestAssignmentCallableData, GenerateChapterSummaryCallableData, ExecuteContentGenerationCallableData, ApproveGeneratedContentCallableData, UpdateChapterNotesCallableData, PlanContentGenerationCallableData, UploadStatus, GenerateWeaknessBasedTestCallableData
} from "@pediaquiz/types";
import { 
    validateInput, 
    PlanContentGenerationSchema, 
    ExecuteContentGenerationSchema, 
    ApproveGeneratedContentSchema, 
    AddFlashcardAttemptCallableDataSchema, 
    ToggleBookmarkSchema, 
    DeleteContentSchema, 
    ProcessManualTextInputSchema,
    AddAttemptCallableDataSchema, 
    BaseQuizResultSchema, 
    SuggestAssignmentCallableDataSchema,
    GenerateChapterSummaryCallableDataSchema,
    GetDailyWarmupQuizCallableDataSchema,
    GetExpandedSearchTermsCallableDataSchema,
    GetHintCallableDataSchema,
    EvaluateFreeTextAnswerCallableDataSchema,
    CreateFlashcardFromMcqCallableDataSchema,
    UpdateChapterNotesCallableDataSchema,
    GenerateWeaknessBasedTestSchema,
    GenerateStagedContentSchema 
} from "./utils/validation";

admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();
const LOCATION = "us-central1";
const PROJECT_ID = "pediaquizapp";

setGlobalOptions({ region: LOCATION, memory: "1GiB", timeoutSeconds: 540 });

let _vertexAI: VertexAI, _quickModel: GenerativeModel, _powerfulModel: GenerativeModel, _visionClient: ImageAnnotatorClient;

function ensureClientsInitialized() {
  if (!_vertexAI) {
    _vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
    _powerfulModel = _vertexAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    _quickModel = _vertexAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
    _visionClient = new ImageAnnotatorClient();
    logger.info("AI and Vision clients initialized.");
  }
}

function extractJson(rawText: string | undefined): any { 
    const textToParse = rawText || ''; 
    const jsonMatch = textToParse.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
        try { return JSON.parse(jsonMatch[1]); }
        catch (e: unknown) {
            logger.error("Failed to parse extracted JSON from markdown block.", { jsonString: jsonMatch[1], error: (e as Error).message });
            throw new HttpsError("internal", "Invalid JSON from AI model (in markdown block).");
        }
    }
    // Attempt to parse if no markdown block is found, as AI sometimes omits it
    try { return JSON.parse(textToParse); }
    catch (e: unknown) {
        logger.error("Failed to parse raw text as JSON.", { rawText: textToParse, error: (e as Error).message }); 
        throw new HttpsError("internal", "Invalid JSON from AI model (raw text).");
    }
}

function calculateSM2(rating: ConfidenceRating, lastAttempt?: Pick<Attempt, 'easeFactor' | 'interval' | 'repetitions'>) {
    let easeFactor = lastAttempt?.easeFactor || 2.5;
    let interval = lastAttempt?.interval || 0;
    let repetitions = lastAttempt?.repetitions || 0;

    const quality = { again: 0, hard: 2, good: 4, easy: 5 }[rating];

    if (quality < 3) {
        repetitions = 0;
        interval = 1;
    } else {
        repetitions++;
        if (repetitions === 1) {
            interval = 1;
        } else if (repetitions === 2) {
            interval = 6;
        } else {
            interval = Math.round(interval * easeFactor);
        }
    }

    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    return { easeFactor, interval, repetitions };
}

const COLLECTIONS = {
    USERS: "users",
    JOBS: "contentGenerationJobs",
    MASTER_MCQ: "MasterMCQ",
    MARROW_MCQ: "MarrowMCQ",
    FLASHCARDS: "Flashcards",
    KEY_CLINICAL_TOPICS: "KeyClinicalTopics",
    QUIZ_RESULTS: "quizResults",
    QUIZ_SESSIONS: "quizSessions",
    TOPICS: "Topics",
    MARROW_TOPICS: "MarrowTopics"
} as const;

export const onUserCreate = functionsV1.region(LOCATION).auth.user().onCreate(async (user: admin.auth.UserRecord) => {
  logger.info(`v1 Auth Trigger: New user created: ${user.uid}`, { email: user.email });
  const userRef = db.collection(COLLECTIONS.USERS).doc(user.uid);
  try {
    await userRef.set({
      uid: user.uid, email: user.email, displayName: user.displayName || "PediaQuiz User",
      createdAt: FieldValue.serverTimestamp(), lastLogin: FieldValue.serverTimestamp(), isAdmin: false,
      bookmarkedMcqs: [],
      bookmarkedFlashcards: [],
      currentStreak: 0
    });
    logger.log(`Firestore: User document created for ${user.uid}`);
  } catch (error: unknown) {
    logger.error(`Error creating user document for ${user.uid}:`, error);
  }
});

export const onFileUploaded = functionsV1.region(LOCATION).storage.object().onFinalize(async (object) => {
  ensureClientsInitialized();
  const fileBucket = object.bucket;
  const filePath = object.name;
  const contentType = object.contentType;
  const userId = filePath?.split('/')[1];

  if (!filePath || !filePath.startsWith("uploads/") || filePath.endsWith('/') || !userId) {
    return logger.log("Not a user upload file or invalid path, skipping.");
  }

  const fileName = path.basename(filePath);
  const userUploadRef = db.collection(COLLECTIONS.JOBS).doc();
  const jobId = userUploadRef.id;

  const initialUploadData: Omit<ContentGenerationJob, 'createdAt' | 'updatedAt'> = { 
    id: jobId, 
    userId: userId, 
    title: fileName, 
    pipeline: fileName.startsWith('MARROW_') ? 'marrow' : 'general', 
    status: 'processing_ocr',
  };
  
  await userUploadRef.set({
      ...initialUploadData,
      createdAt: FieldValue.serverTimestamp(), 
      updatedAt: FieldValue.serverTimestamp()
  });

  try {
    if (contentType === "application/pdf") {
      const gcsSourceUri = `gs://${fileBucket}/${filePath}`;
      const outputPrefix = `ocr_results/${jobId}`; 
      const gcsDestinationUri = `gs://${fileBucket}/${outputPrefix}/`;

      const request: protos.google.cloud.vision.v1.IAsyncAnnotateFileRequest = {
        inputConfig: { gcsSource: { uri: gcsSourceUri }, mimeType: 'application/pdf' },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        outputConfig: { gcsDestination: { uri: gcsDestinationUri }, batchSize: 100 },
      };

      const [operation] = await _visionClient.asyncBatchAnnotateFiles({ requests: [request] });
      
      await operation.promise(); 
      logger.info(`OCR operation for file ${filePath} completed.`);

      const [files] = await storage.bucket(fileBucket).getFiles({ prefix: outputPrefix });
      let combinedFullText = "";
      files.sort((a: any, b: any) => a.name.localeCompare(b.name));
      for (const file of files) {
        const [contents] = await file.download();
        const output = JSON.parse(contents.toString());
        (output.responses || []).forEach((pageResponse: protos.google.cloud.vision.v1.IAnnotateImageResponse) => {
          if (pageResponse.fullTextAnnotation?.text) {
            combinedFullText += pageResponse.fullTextAnnotation.text + "\n\n";
          }
        });
      }
      
      await storage.bucket(fileBucket).deleteFiles({ prefix: outputPrefix });

      if (!combinedFullText.trim()) {
          throw new Error("OCR could not extract any readable text from the PDF.");
      }

      await userUploadRef.update({ sourceText: combinedFullText.trim(), status: "pending_planning", updatedAt: FieldValue.serverTimestamp() });
      logger.info(`OCR results saved for job ${jobId}. Status updated to pending_planning.`);

    } else if (contentType && contentType.startsWith("text/")) {
      const tempFilePath = path.join(os.tmpdir(), fileName);
      await storage.bucket(fileBucket).file(filePath).download({ destination: tempFilePath });
      const extractedText = fs.readFileSync(tempFilePath, "utf8");
      fs.unlinkSync(tempFilePath);
      if (!extractedText.trim()) throw new Error("The uploaded text file is empty.");
      await userUploadRef.update({ sourceText: extractedText, status: 'pending_planning', updatedAt: FieldValue.serverTimestamp() });
      logger.info(`Text file content saved for job ${jobId}. Status updated to pending_planning.`);
    } else {
        throw new HttpsError("invalid-argument", `Unsupported file type: ${contentType}.`);
    }
  } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await userUploadRef.update({ status: "error", errors: FieldValue.arrayUnion(`OCR failed: ${errorMessage}`), updatedAt: FieldValue.serverTimestamp() }).catch(() => {});
      logger.error(`OCR failed for file ${filePath} (Job ID: ${jobId}):`, error);
  }
});

export const addAttempt = onCall(async (request: CallableRequest<AddAttemptCallableData>) => {
    const data = validateInput(AddAttemptCallableDataSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    const userId = request.auth.uid;
    const { mcqId, isCorrect, selectedAnswer, sessionId, confidenceRating } = data;

    const attemptDocRef = db.collection(COLLECTIONS.USERS).doc(userId).collection("attemptedMCQs").doc(mcqId);
    const userRef = db.collection(COLLECTIONS.USERS).doc(userId);

    return db.runTransaction(async (transaction: Transaction) => {
        const attemptDoc = await transaction.get(attemptDocRef);
        const sessionDoc = await transaction.get(db.collection(COLLECTIONS.QUIZ_SESSIONS).doc(sessionId));

        if (!sessionDoc.exists) {
            throw new HttpsError("not-found", "The specified session is invalid or does not exist.");
        }
        const sessionData = sessionDoc.data();
        if (sessionData?.userId !== userId) {
            throw new HttpsError("permission-denied", "The specified session does not belong to you.");
        }

        const currentMcqInSession = sessionData?.mcqIds?.[sessionData.currentIndex];
        
        if (mcqId !== currentMcqInSession) {
             throw new HttpsError("failed-precondition", "This attempt is not for the current question in your session.");
        }
        if (sessionData.answers[sessionData.currentIndex] != null) {
            throw new HttpsError("failed-precondition", "This question has already been answered in this session.");
        }

        const attemptData = attemptDoc.exists ? attemptDoc.data() : undefined;
        
        const history: Attempt[] = (attemptData?.history || []);
        const lastAttempt = history.length > 0 ? history[history.length - 1] : undefined;

        const { easeFactor, interval, repetitions } = calculateSM2(confidenceRating, lastAttempt);
        
        const nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + interval);

        const currentAttempt: Attempt = {
            mcqId, selectedAnswer, isCorrect, sessionId, timestamp: new Date(), userId, confidenceRating,
            interval, easeFactor, repetitions, nextReviewDate,
        };
        
        transaction.set(attemptDocRef, { history: FieldValue.arrayUnion(currentAttempt), latestAttempt: currentAttempt }, { merge: true });
        
        await updateUserStreak(transaction, userRef);
        return { success: true }; 
    });
});

export const addFlashcardAttempt = onCall(async (request: CallableRequest<AddFlashcardAttemptCallableData>) => {
    const data = validateInput(AddFlashcardAttemptCallableDataSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    const userId = request.auth.uid;
    const { flashcardId, rating } = data;

    const attemptRef = db.collection(COLLECTIONS.USERS).doc(userId).collection("attemptedFlashcards").doc(flashcardId);
    const userRef = db.collection(COLLECTIONS.USERS).doc(userId);

    return db.runTransaction(async (transaction: Transaction) => {
        const doc = await transaction.get(attemptRef);
        
        const lastAttempt = doc.exists ? doc.data() as FlashcardAttempt : undefined;

        const { easeFactor, interval, repetitions } = calculateSM2(rating, lastAttempt);

        const nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + interval);

        const currentAttempt: FlashcardAttempt = {
            flashcardId, rating, timestamp: new Date(),
            interval, easeFactor, repetitions, nextReviewDate,
        };
        
        transaction.set(attemptRef, currentAttempt, { merge: true });

        await updateUserStreak(transaction, userRef);
        return { success: true }; 
    });
});

export const getDueReviewItems = onCall(async (request: CallableRequest<void>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    const userId = request.auth.uid;
    const now = new Date();

    const mcqQuery = db.collection(`${COLLECTIONS.USERS}/${userId}/attemptedMCQs`).where('latestAttempt.nextReviewDate', '<=', now);
    const flashcardQuery = db.collection(`${COLLECTIONS.USERS}/${userId}/attemptedFlashcards`).where('nextReviewDate', '<=', now);

    const [mcqSnapshot, flashcardSnapshot] = await Promise.all([mcqQuery.get(), flashcardQuery.get()]);

    const dueMcqIds = mcqSnapshot.docs.map(doc => doc.id);
    const dueFlashcardIds = flashcardSnapshot.docs.map(doc => doc.id);

    return { dueMcqIds, dueFlashcardIds };
});

export const getActiveSession = onCall(async (request: CallableRequest<void>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const userDocRef = db.collection(COLLECTIONS.USERS).doc(request.auth.uid);
    const userDoc = await userDocRef.get();
    const activeSessionId = userDoc.data()?.activeSessionId;

    if (activeSessionId) {
        const sessionDoc = await db.collection(COLLECTIONS.QUIZ_SESSIONS).doc(activeSessionId).get();
        if (sessionDoc.exists && !sessionDoc.data()?.isFinished) {
            const expiresAt = (sessionDoc.data()?.expiresAt as FirestoreTimestamp)?.toDate();
            if (expiresAt && new Date() < expiresAt) {
                return { sessionId: activeSessionId, sessionMode: sessionDoc.data()?.mode };
            } else {
                await userDocRef.update({ activeSessionId: FieldValue.delete() });
            }
        } else {
            await userDocRef.update({ activeSessionId: FieldValue.delete() });
        }
    }
    return { sessionId: null };
});

export const toggleBookmark = onCall(async (request: CallableRequest<ToggleBookmarkCallableData>) => {
    validateInput(ToggleBookmarkSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    const userId = request.auth.uid;
    const { contentId, contentType, action } = request.data;

    const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
    
    const bookmarkField = contentType === 'mcq' ? 'bookmarkedMcqs' : 'bookmarkedFlashcards';

    if (action === 'add') {
        await userRef.update({ [bookmarkField]: FieldValue.arrayUnion(contentId) });
        return { success: true, bookmarked: true, bookmarks: [] }; 
    } else {
        await userRef.update({ [bookmarkField]: FieldValue.arrayRemove(contentId) });
        return { success: true, bookmarked: false, bookmarks: [] }; 
    }
});

export const deleteContentItem = onCall(async (request: CallableRequest<DeleteContentItemCallableData>) => {
    validateInput(DeleteContentSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required."); 
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { id, type, collectionName } = request.data;
    const allowedCollections: readonly ['MasterMCQ', 'MarrowMCQ', 'Flashcards'] = [COLLECTIONS.MASTER_MCQ, COLLECTIONS.MARROW_MCQ, COLLECTIONS.FLASHCARDS];
    if (!(allowedCollections as readonly string[]).includes(collectionName)) {
        throw new HttpsError("invalid-argument", "Invalid collection name provided.");
    }
    
    await db.collection(collectionName).doc(id).update({ status: 'archived' as UploadStatus, updatedAt: FieldValue.serverTimestamp() });
    
    return { success: true, message: `${type.toUpperCase()} archived.` };
});

export const addQuizResult = onCall(async (request: CallableRequest<Omit<QuizResult, 'id' | 'userId' | 'quizDate'>>) => {
    const data = validateInput(BaseQuizResultSchema, request.data); 
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const authUserId = request.auth.uid;
    
    const resultRef = db.collection(COLLECTIONS.USERS).doc(authUserId).collection(COLLECTIONS.QUIZ_RESULTS).doc();
    await resultRef.set({ 
        ...data, 
        id: resultRef.id, 
        userId: authUserId, 
        quizDate: FieldValue.serverTimestamp() 
    });
    return { success: true, id: resultRef.id };
});

export const chatWithAssistant = onCall(async (request: CallableRequest<{ prompt: string, history: Content[] }>) => { // FIX: Use Content[] for history type
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required to chat with the assistant.");
    const { prompt, history } = request.data;

    if (!Array.isArray(history) || history.length > 20) { 
      throw new HttpsError("invalid-argument", "Chat history is too long or invalid.");
    }
    // FIX: history is already in Content[] format if the frontend sends it correctly. No need to re-map.
    const chatHistoryForAI: Content[] = history; 
    
    ensureClientsInitialized();
    try {
        const result = await _powerfulModel.generateContent({
            contents: [...chatHistoryForAI, { role: 'user', parts: [{ text: prompt }] }]
        });
        const modelResponse = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";
        return { response: modelResponse };
    }
    catch (error: unknown) {
        logger.error(`Error during AI chat for user ${request.auth?.uid}:`, error);
        throw new HttpsError("internal", `AI chat failed: ${(error as Error).message}`);
    }
});

export const generatePerformanceAdvice = onCall(async (request: CallableRequest<{ overallAccuracy: number, strongTopics: string[], weakTopics: string[] }>) => { // FIX: Explicit type
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const { overallAccuracy, strongTopics, weakTopics } = request.data;

    ensureClientsInitialized();
    try {
        const prompt = `You are an AI academic advisor for a postgraduate medical student. Analyze the following performance data and provide actionable, professional advice: Overall Accuracy: ${overallAccuracy.toFixed(1)}%. Strongest Topics: ${strongTopics.join(", ")}. Weakest Topics: ${weakTopics.join(", ")}. Your advice should: 1. Congratulate them on strengths. 2. Identify weak areas gently. 3. Provide a brief, actionable study plan. Suggest specific strategies for tackling the weak topics (e.g., "Focus on flashcards for definitions in [Weak Topic 1]"). 4. End on a motivating note. Format your response using basic markdown.`;
        const result = await _powerfulModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        return { advice: responseText || "Could not generate advice." };
    }
    catch (error: unknown) {
        logger.error(`Error generating performance advice for user ${request.auth?.uid}:`, error);
        throw new HttpsError("internal", `Performance advice generation failed: ${(error as Error).message}`);
    }
});

export const generateWeaknessBasedTest = onCall(async (request: CallableRequest<GenerateWeaknessBasedTestCallableData>) => {
    const data = validateInput(GenerateWeaknessBasedTestSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const userId = request.auth.uid;
    const { testSize } = data;

    const masterMcqSnapshot = await db.collection(COLLECTIONS.MASTER_MCQ).where("status", "==", "approved").limit(500).get(); 
    const marrowMcqSnapshot = await db.collection(COLLECTIONS.MARROW_MCQ).where("status", "==", "approved").limit(500).get(); 
    const allApprovedMcqs: MCQ[] = [
        ...masterMcqSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MCQ)),
        ...marrowMcqSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MCQ)),
    ];

    const attemptedMcqsSnapshot = await db.collection(COLLECTIONS.USERS).doc(userId).collection("attemptedMCQs").get();
    const attempted: AttemptedMCQs = {};
    attemptedMcqsSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
        const data = doc.data();
        attempted[doc.id] = (data || {}) as AttemptedMCQs[string];
    });

    const relevantMcqIds = allApprovedMcqs.filter((mcq: MCQ) => 
        attempted[mcq.id] && attempted[mcq.id].latestAttempt && !attempted[mcq.id].latestAttempt.isCorrect
    ).map((mcq: MCQ) => mcq.id);

    const remainingMcqIds = allApprovedMcqs.filter((mcq: MCQ) => 
        !attempted[mcq.id] || (attempted[mcq.id].latestAttempt && !attempted[mcq.id].latestAttempt.isCorrect)
    ).map((mcq: MCQ) => mcq.id);
    
    let selectedMcqIds: string[] = [];

    selectedMcqIds = relevantMcqIds.sort(() => 0.5 - Math.random()).slice(0, testSize);

    if (selectedMcqIds.length < testSize) {
        const numNeeded = testSize - selectedMcqIds.length;
        const additionalMcqs = remainingMcqIds.filter(id => !selectedMcqIds.includes(id)).sort(() => 0.5 - Math.random()).slice(0, numNeeded);
        selectedMcqIds = [...selectedMcqIds, ...additionalMcqs];
    }
    
    selectedMcqIds = selectedMcqIds.slice(0, testSize).sort(() => 0.5 - Math.random());

    return { mcqIds: selectedMcqIds };
});


export const getDailyWarmupQuiz = onCall(async (request: CallableRequest<GetDailyWarmupQuizCallableData>) => {
    // FIX: Removed userId from data as it's correctly derived from auth.
    const data = validateInput(GetDailyWarmupQuizCallableDataSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const { count } = data;
    const userId = request.auth.uid; 

    try {
        const masterMcqSnapshot = await db.collection(COLLECTIONS.MASTER_MCQ).where("status", "==", "approved").limit(200).get(); 
        const marrowMcqSnapshot = await db.collection(COLLECTIONS.MARROW_MCQ).where("status", "==", "approved").limit(200).get(); 
        const allApprovedMcqs: MCQ[] = [
            ...masterMcqSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MCQ)),
            ...marrowMcqSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MCQ)),
        ];

        const attemptedMcqsSnapshot = await db.collection(COLLECTIONS.USERS).doc(userId).collection("attemptedMCQs").get();
        const attempted: AttemptedMCQs = {};
        attemptedMcqsSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
            const data = doc.data();
            attempted[doc.id] = (data || {}) as AttemptedMCQs[string];
        });

        const unseenMcqs = allApprovedMcqs.filter((mcq: MCQ) => !attempted[mcq.id]);
        const seenButNeedsReviewMcqs = allApprovedMcqs.filter((mcq: MCQ) => 
            attempted[mcq.id] && attempted[mcq.id].latestAttempt && 
            (attempted[mcq.id].latestAttempt.nextReviewDate as FirestoreTimestamp)?.toDate() <= new Date() // FIX: Cast timestamp to date for comparison
        );
        
        let selectedMcqIds: string[] = [];

        selectedMcqIds.push(...seenButNeedsReviewMcqs.map((mcq: MCQ) => mcq.id).sort(() => 0.5 - Math.random()));
        selectedMcqIds.push(...unseenMcqs.map((mcq: MCQ) => mcq.id).sort(() => 0.5 - Math.random()));
        
        selectedMcqIds = selectedMcqIds.slice(0, count);
        selectedMcqIds.sort(() => 0.5 - Math.random());

        return { mcqIds: selectedMcqIds };

    } catch (error: unknown) {
        logger.error(`Error generating daily warmup quiz for user ${userId}:`, error);
        throw new HttpsError("internal", `Failed to generate daily warmup quiz: ${(error as Error).message}`);
    }
});


export const getQuizSessionFeedback = onCall(async (request: CallableRequest<{ quizResultId: string }>) => { // FIX: Explicit type
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const { quizResultId } = request.data;

    try {
        const quizResultDoc = await db.collection(COLLECTIONS.USERS).doc(request.auth.uid).collection(COLLECTIONS.QUIZ_RESULTS).doc(quizResultId).get();
        if (!quizResultDoc.exists || quizResultDoc.data()?.userId !== request.auth.uid) {
            throw new HttpsError("permission-denied", "Quiz result not found or unauthorized.");
        }
        const quizResult = quizResultDoc.data() as QuizResult;

        const mcqIds = quizResult.mcqAttempts.map((r: QuizResult['mcqAttempts'][0]) => r.mcqId);
        // Fetch MCQs from both MasterMCQ and MarrowMCQ collections
        const [masterMcqsSnapshot, marrowMcqsSnapshot] = await Promise.all([
            db.collection(COLLECTIONS.MASTER_MCQ).where(admin.firestore.FieldPath.documentId(), 'in', mcqIds).get(),
            db.collection(COLLECTIONS.MARROW_MCQ).where(admin.firestore.FieldPath.documentId(), 'in', mcqIds).get()
        ]);

        const allMcqsMap = new Map<string, MCQ>();
        masterMcqsSnapshot.forEach(doc => allMcqsMap.set(doc.id, doc.data() as MCQ));
        marrowMcqsSnapshot.forEach(doc => allMcqsMap.set(doc.id, doc.data() as MCQ));

        const quizContext = quizResult.mcqAttempts.map((result: QuizResult['mcqAttempts'][0]) => {
            const mcq = allMcqsMap.get(result.mcqId);
            return {
                question: mcq?.question,
                correctAnswer: mcq?.correctAnswer,
                selectedAnswer: result.selectedAnswer,
                isCorrect: result.isCorrect,
                topic: mcq?.topicName,
                chapter: mcq?.chapterName,
            };
        });

        const prompt = `You are an AI medical tutor. Analyze the following quiz session results and provide personalized, constructive feedback to the student. Highlight strengths, identify specific areas of weakness (e.g., particular topics or types of questions), and suggest actionable study strategies. Provide a general motivational closing. Format your response using clear paragraphs and basic markdown.
        Quiz Results (correct answers given):
        Overall Score: ${quizResult.score} out of ${quizResult.totalQuestions}
        Questions: ${JSON.stringify(quizContext, null, 2)}`;

        ensureClientsInitialized();
        const result = await _powerfulModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        const feedback = result.response.candidates?.[0]?.content.parts?.[0]?.text;

        return { feedback: feedback || "Could not generate feedback." };

    } catch (error: unknown) {
        logger.error(`Error getting quiz session feedback for result ${quizResultId}:`, error);
        throw new HttpsError("internal", `Failed to get AI feedback: ${(error as Error).message}`);
    }
});

export const getExpandedSearchTerms = onCall(async (request: CallableRequest<GetExpandedSearchTermsCallableData>) => { // FIX: Explicit type
    validateInput(GetExpandedSearchTermsCallableDataSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const { query } = request.data;
    const prompt = `You are an AI medical search assistant. For the given search query, generate up to 5 related or synonymous medical terms to broaden the search. Return ONLY a valid JSON array of strings. Example: ["term1", "term2"]. QUERY: "${query}"`;

    ensureClientsInitialized();
    try {
        const result = await _quickModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) {
            return { terms: [] };
        }
        const terms = extractJson(responseText);
        return { terms: Array.isArray(terms) ? terms : [] };
    } catch (error: unknown) {
        logger.error(`Error expanding search terms for query "${query}":`, error);
        throw new HttpsError("internal", `Failed to expand search terms: ${(error as Error).message}`);
    }
});

export const getHint = onCall(async (request: CallableRequest<GetHintCallableData>) => { // FIX: Explicit type
    validateInput(GetHintCallableDataSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const { mcqId } = request.data;
    const masterMcqDoc = await db.collection(COLLECTIONS.MASTER_MCQ).doc(mcqId).get();
    const marrowMcqDoc = await db.collection(COLLECTIONS.MARROW_MCQ).doc(mcqId).get();
    let mcqData: MCQ | undefined;

    if (masterMcqDoc.exists) {
        mcqData = masterMcqDoc.data() as MCQ;
    } else if (marrowMcqDoc.exists) {
        mcqData = marrowMcqDoc.data() as MCQ;
    }

    if (!mcqData) throw new HttpsError("not-found", "MCQ not found.");

    const prompt = `For the following MCQ, provide a single, subtle hint that guides the user toward the correct answer without giving it away. Do not mention the correct option letter. MCQ: """${mcqData.question} Options: ${mcqData.options.join(", ")}"""`;
    ensureClientsInitialized();
    try {
        const result = await _quickModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        return { hint: result.response.candidates?.[0]?.content.parts?.[0]?.text || "No hint could be generated." };
    } catch (error: unknown) {
        logger.error(`Error generating hint for MCQ ${mcqId}:`, error);
        throw new HttpsError("internal", `Hint generation failed: ${(error as Error).message}`);
    }
});

export const evaluateFreeTextAnswer = onCall(async (request: CallableRequest<EvaluateFreeTextAnswerCallableData>) => { // FIX: Explicit type
    validateInput(EvaluateFreeTextAnswerCallableDataSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const { mcqId, userAnswer } = request.data;
    const masterMcqDoc = await db.collection(COLLECTIONS.MASTER_MCQ).doc(mcqId).get();
    const marrowMcqDoc = await db.collection(COLLECTIONS.MARROW_MCQ).doc(mcqId).get();
    let mcqData: MCQ | undefined;

    if (masterMcqDoc.exists) {
        mcqData = masterMcqDoc.data() as MCQ;
    } else if (marrowMcqDoc.exists) {
        mcqData = marrowMcqDoc.data() as MCQ;
    }

    if (!mcqData) throw new HttpsError("not-found", "MCQ not found.");

    const prompt = `Compare the user's answer to the correct answer for the given question. Is the user's answer substantially correct? Respond with ONLY a valid JSON object: {"isCorrect": boolean, "feedback": "string"}. Question: """${mcqData.question}""" Correct Answer & Explanation: """${mcqData.correctAnswer}, ${mcqData.explanation}""" User's Answer: """${userAnswer}"""`;
    ensureClientsInitialized();
    try {
        const result = await _quickModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        const response = extractJson(result.response.candidates?.[0]?.content.parts?.[0]?.text);
        if (typeof response.isCorrect !== 'boolean' || typeof response.feedback !== 'string') {
            throw new Error("AI response format for evaluation is incorrect.");
        }
        return response;
    } catch (error: unknown) {
        logger.error(`Error evaluating free text answer for MCQ ${mcqId}:`, error);
        throw new HttpsError("internal", `Free text evaluation failed: ${(error as Error).message}`);
    }
});

export const createFlashcardFromMcq = onCall(async (request: CallableRequest<CreateFlashcardFromMcqCallableData>) => { // FIX: Explicit type
    validateInput(CreateFlashcardFromMcqCallableDataSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const { mcqId } = request.data;
    const masterMcqDoc = await db.collection(COLLECTIONS.MASTER_MCQ).doc(mcqId).get();
    const marrowMcqDoc = await db.collection(COLLECTIONS.MARROW_MCQ).doc(mcqId).get();
    let mcqData: MCQ | undefined;

    if (masterMcqDoc.exists) {
        mcqData = masterMcqDoc.data() as MCQ;
    } else if (marrowMcqDoc.exists) {
        mcqData = marrowMcqDoc.data() as MCQ;
    }

    if (!mcqData) throw new HttpsError("not-found", "MCQ not found.");
    
    const newFlashcard: Omit<Flashcard, 'id' | 'createdAt' | 'status' | 'uploadId' | 'creatorId'> = {
        front: mcqData.question,
        back: mcqData.explanation || mcqData.correctAnswer,
        topicId: mcqData.topicId,
        chapterId: mcqData.chapterId,
        topicName: mcqData.topicName,
        chapterName: mcqData.chapterName,
        tags: mcqData.tags,
        source: 'User_Generated_From_MCQ',
    };
    
    const flashcardRef = await db.collection(COLLECTIONS.FLASHCARDS).add({
        ...newFlashcard,
        createdAt: FieldValue.serverTimestamp(),
        creatorId: request.auth.uid,
        status: 'approved',
    });

    return { success: true, flashcardId: flashcardRef.id };
});

export const suggestAssignment = onCall(async (request: CallableRequest<SuggestAssignmentCallableData>) => { // FIX: Explicit type
    validateInput(SuggestAssignmentCallableDataSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { jobId, existingTopics, scopeToTopicName } = request.data;
    const docRef = db.collection(COLLECTIONS.JOBS).doc(jobId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) throw new HttpsError("not-found", "Job not found.");
    const jobData = docSnap.data() as ContentGenerationJob; // FIX: Cast jobDoc.data()
    const allGeneratedContent = jobData.generatedContent?.[0]?.mcqs && jobData.generatedContent?.[0]?.flashcards ? {
        mcqs: jobData.generatedContent[0].mcqs,
        flashcards: jobData.generatedContent[0].flashcards,
    } : null;

    if (!allGeneratedContent) throw new HttpsError("failed-precondition", "No generated content to assign.");
    
    const contentToCategorize = {
        mcqs: (allGeneratedContent.mcqs || []).map((m: Partial<MCQ>, index: number) => ({ index, question: m.question, options: m.options, explanation: m.explanation })),
        flashcards: (allGeneratedContent.flashcards || []).map((f: Partial<Flashcard>, index: number) => ({ index, front: f.front, back: f.back }))
    };

    let existingTopicFilter = '';
    if (scopeToTopicName) {
        existingTopicFilter = `Only assign to existing topics that closely match "${scopeToTopicName}".`;
    }

    const prompt = `You are a curriculum architect. Your goal is to categorize new educational content (MCQs and Flashcards) into an existing topic and chapter structure.
    Existing Library Topics & Chapters: ${JSON.stringify(existingTopics.map((t: PediaquizTopicType) => ({ name: t.name, chapters: t.chapters.map(c => c.name) })), null, 2)}.
    New Content to Assign: ${JSON.stringify(contentToCategorize, null, 2).substring(0, 100000)}
    ${existingTopicFilter}
    
    Instructions:
    - For each content item (MCQ or Flashcard), assign it to the MOST appropriate existing topic and chapter.
    - If a suitable chapter does not exist within an EXISTING topic, you MAY suggest a NEW, relevant chapter name within that existing topic.
    - DO NOT suggest new TOPICS. All content must fit into existing topics.
    - Respond ONLY with a valid JSON array of assignment suggestions. Each object in the array should contain:
        - "topicName": The name of the existing topic (must exactly match one from the 'Existing Library').
        - "chapterName": The name of the chapter (either existing or a new suggestion for an existing topic).
        - "isNewChapter": boolean (true if 'chapterName' is a new suggestion).
        - "mcqIndexes": Array of original 'index' from 'New Content to Assign' for MCQs assigned to this chapter.
        - "flashcardIndexes": Array of original 'index' from 'New Content to Assign' for Flashcards assigned to this chapter.
    Example: [{"topicName": "Cardiology", "chapterName": "Heart Failure", "isNewChapter": false, "mcqIndexes": [0, 2], "flashcardIndexes": []}, {"topicName": "Cardiology", "chapterName": "New Chapter Title", "isNewChapter": true, "mcqIndexes": [1], "flashcardIndexes": [0]}]`;
    
    ensureClientsInitialized();
    try {
        const resp = await _powerfulModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        const rawResponse = resp.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const assignments = extractJson(rawResponse);

        // Store the assignment suggestions on the job document
        await docRef.update({ assignmentSuggestions: assignments, updatedAt: FieldValue.serverTimestamp() });

        return { success: true, suggestions: assignments };
    }
    catch (error: unknown) {
        logger.error(`Error suggesting assignment for job ${jobId}:`, error);
        throw new HttpsError("internal", `AI assignment failed: ${(error as Error).message}`);
    }
});

export const planContentGeneration = onCall(async (request: CallableRequest<PlanContentGenerationCallableData>) => { // FIX: Explicit type
    validateInput(PlanContentGenerationSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");

    const { jobId } = request.data;
    const jobRef = db.collection(COLLECTIONS.JOBS).doc(jobId);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
        throw new HttpsError("not-found", "Content generation job not found.");
    }
    const jobData = jobDoc.data() as ContentGenerationJob;
    const sourceText = jobData.sourceText;
    const pipeline = jobData.pipeline;

    if (!sourceText) {
        throw new HttpsError("failed-precondition", "Job is missing source text for planning.");
    }

    let prompt: string;
    if (pipeline === 'marrow') {
        prompt = `You are an expert medical data processor. Analyze the provided text. Categorize its content into 'extracted_mcqs' (for any complete MCQs already present) and 'orphan_explanations' (for general text that could be used to generate new MCQs). Respond with ONLY a valid JSON object with keys "marrowMcqsFound" (a number, representing exact count of existing MCQs) and "suggestedNewMarrowMcqCount" (a number, suggesting new MCQs to generate, usually double the count of orphan explanations, max 20). Example: {"marrowMcqsFound": 5, "suggestedNewMarrowMcqCount": 10}. TEXT TO ANALYZE: """${sourceText.substring(0, 30000)}"""`;
    } else {
        prompt = `You are a curriculum planning AI for medical education. Analyze the provided text. Estimate how many high-quality MCQs and Flashcards could be generated from it. Focus on key definitions, clinical pathways, diagnostic criteria, and treatment options relevant for postgraduate medical students. AVOID generating questions about statistical trivia, historical anecdotes, or overly specific dosages unless they are a cornerstone of the topic. Respond with ONLY a valid JSON object with keys "suggestedGeneralMcqCount" (a number, max 50) and "suggestedFlashcardCount" (a number, max 50). Example: {"suggestedGeneralMcqCount": 20, "suggestedFlashcardCount": 15}. TEXT TO ANALYZE: """${sourceText.substring(0, 30000)}"""`;
    }
    
    ensureClientsInitialized();
    try {
        const result = await _quickModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        const responseText = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        if (!responseText) throw new Error("AI failed to respond for planning.");
        
        const plan = extractJson(responseText);

        await jobRef.update({
            suggestedPlan: {
                mcqCount: (plan.marrowMcqsFound ?? plan.suggestedGeneralMcqCount) || 0,
                flashcardCount: plan.suggestedFlashcardCount || 0,
                // chapterBreakdown is not always returned by this prompt, ensure it's optional or handled
                chapterBreakdown: plan.chapterBreakdown || [], 
            },
            status: 'pending_generation' as UploadStatus,
            updatedAt: FieldValue.serverTimestamp(),
        });
        return { success: true, jobId: jobRef.id, plan };
    } catch (error: unknown) {
        const errorMessage = (error instanceof Error) ? error.message : String(error);
        await jobRef.update({
            status: 'error' as UploadStatus,
            errors: FieldValue.arrayUnion(`Planning failed: ${errorMessage}`),
            updatedAt: FieldValue.serverTimestamp(),
        });
        logger.error(`Content planning failed for user ${request.auth?.uid}:`, error);
        throw new HttpsError("internal", `Content planning failed: ${errorMessage}`);
    }
});

export const generateChapterSummary = onCall(async (request: CallableRequest<GenerateChapterSummaryCallableData>) => { // FIX: Explicit type
    validateInput(GenerateChapterSummaryCallableDataSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadIds } = request.data;

    const uploadsSnapshot = await db.collection(COLLECTIONS.JOBS).where(admin.firestore.FieldPath.documentId(), 'in', uploadIds).get();
    let combinedSourceText = '';
    uploadsSnapshot.forEach(doc => {
        combinedSourceText += (doc.data()?.sourceText || '') + '\n\n';
    });
    
    if (!combinedSourceText.trim()) throw new HttpsError("not-found", "No source text found for provided upload IDs.");

    ensureClientsInitialized();
    try {
        const prompt = `You are an AI medical educator specialized in Pediatrics. Generate a concise, high-yield, bullet-point summary of the following medical text for a postgraduate student preparing for competitive exams. The summary should be well-structured, easy to read, and highlight key facts. Use Markdown for formatting (headings, bullet points, bold text). Text to summarize: """${combinedSourceText.substring(0, 50000)}"""`;
        const result = await _powerfulModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        const summary = result.response.candidates?.[0]?.content.parts?.[0]?.text;
        return { summary: summary || "Could not generate summary." };
    } catch (error: unknown) {
        logger.error(`Error generating chapter summary:`, error);
        throw new HttpsError("internal", `Chapter summary generation failed: ${(error as Error).message}`);
    }
});

export const approveGeneratedContent = onCall(async (request: CallableRequest<ApproveGeneratedContentCallableData>) => { // FIX: Explicit type
    validateInput(ApproveGeneratedContentSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { jobId, topicId, topicName, chapterId, chapterName, keyTopics, summaryNotes, generatedMcqs, generatedFlashcards, pipeline } = request.data;

    const jobRef = db.collection(COLLECTIONS.JOBS).doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) throw new HttpsError("not-found", "Job not found.");

    const adminId = request.auth.uid;
    const topicCollectionName = pipeline === 'marrow' ? COLLECTIONS.MARROW_TOPICS : COLLECTIONS.TOPICS;
    const mcqCollectionName = pipeline === 'marrow' ? COLLECTIONS.MARROW_MCQ : COLLECTIONS.MASTER_MCQ;

    const topicRef = db.collection(topicCollectionName).doc(topicId);
    const batch = db.batch();

    const topicDoc = await topicRef.get();
    let chapters = (topicDoc.data()?.chapters || []) as Chapter[];
    let chapterIndex = chapters.findIndex(c => c.id === chapterId);

    if (chapterIndex > -1) {
        chapters[chapterIndex].sourceUploadIds = Array.from(new Set([...(chapters[chapterIndex].sourceUploadIds || []), jobId]));
        chapters[chapterIndex].originalTextRefIds = Array.from(new Set([...(chapters[chapterIndex].originalTextRefIds || []), jobId]));
        chapters[chapterIndex].mcqCount = (chapters[chapterIndex].mcqCount || 0) + (generatedMcqs?.length || 0);
        chapters[chapterIndex].flashcardCount = (chapters[chapterIndex].flashcardCount || 0) + (generatedFlashcards?.length || 0);
        chapters[chapterIndex].summaryNotes = summaryNotes;
    } else {
        chapters.push({
            id: chapterId, name: chapterName,
            mcqCount: (generatedMcqs?.length || 0),
            flashcardCount: (generatedFlashcards?.length || 0),
            topicId: topicId,
            source: pipeline === 'marrow' ? 'Marrow' : 'General',
            sourceUploadIds: [jobId],
            originalTextRefIds: [jobId],
            summaryNotes: summaryNotes || null
        });
        chapters.sort((a, b) => a.name.localeCompare(b.name));
    }

    const newTotalMcqCount = chapters.reduce((sum, ch) => sum + (ch.mcqCount || 0), 0);
    const newTotalFlashcardCount = chapters.reduce((sum, ch) => sum + (ch.flashcardCount || 0), 0);
    const newChapterCount = chapters.length;

    if (!topicDoc.exists) {
        batch.set(topicRef, { name: topicName, chapters: chapters, source: pipeline, totalMcqCount: newTotalMcqCount, totalFlashcardCount: newTotalFlashcardCount, chapterCount: newChapterCount });
    } else {
        batch.update(topicRef, { chapters: chapters, totalMcqCount: newTotalMcqCount, totalFlashcardCount: newTotalFlashcardCount, chapterCount: newChapterCount });
    }

    (generatedMcqs || []).forEach((mcqData: Partial<MCQ>) => {
        const mcqRef = db.collection(mcqCollectionName).doc();
        batch.set(mcqRef, { 
            ...mcqData, id: mcqRef.id, topic: topicName, topicId, chapter: chapterName, chapterId, tags: keyTopics, status: 'approved',
            creatorId: adminId, createdAt: FieldValue.serverTimestamp(), source: `${pipeline}_AI_Generated`, uploadId: jobId
        });
    });

    (generatedFlashcards || []).forEach((flashcardData: Partial<Flashcard>) => {
        const flashcardRef = db.collection(COLLECTIONS.FLASHCARDS).doc();
        batch.set(flashcardRef, { 
            ...flashcardData, id: flashcardRef.id, topicName: topicName, chapterName: chapterName, topicId, chapterId,
            creatorId: adminId, createdAt: FieldValue.serverTimestamp(), source: `${pipeline}_AI_Generated`, uploadId: jobId
        });
    });
    
    (keyTopics || []).forEach((tag: string) => { 
        const keyTopicRef = db.collection(COLLECTIONS.KEY_CLINICAL_TOPICS).doc(tag.replace(/\s+/g, '_').toLowerCase());
        batch.set(keyTopicRef, { name: tag, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    });

    batch.update(jobRef, { status: 'completed' as UploadStatus, updatedAt: FieldValue.serverTimestamp() });
    
    await batch.commit();

    return { success: true, message: `Content from job ${jobId} approved.` };
});

export const updateChapterNotes = onCall(async (request: CallableRequest<UpdateChapterNotesCallableData>) => { // FIX: Explicit type
    validateInput(UpdateChapterNotesCallableDataSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { topicId, chapterId, newSummary, source } = request.data;
    
    const collectionName = source === 'Marrow' ? COLLECTIONS.MARROW_TOPICS : COLLECTIONS.TOPICS;
    const topicRef = db.collection(collectionName).doc(topicId);
    const topicDoc = await topicRef.get();
    if (!topicDoc.exists) throw new HttpsError("not-found", `${source} Topic not found.`);
    
    let chapters = (topicDoc.data()?.chapters || []) as Chapter[];
    const chapterIndex = chapters.findIndex(c => c.id === chapterId);
    
    if (chapterIndex === -1) throw new HttpsError("not-found", `${source} Chapter not found.`);
    
    chapters[chapterIndex].summaryNotes = newSummary;
    await topicRef.update({ chapters, updatedAt: FieldValue.serverTimestamp() });
    
    return { success: true, message: "Chapter notes updated." };
});

export const resetUpload = onCall(async (request: CallableRequest<{ uploadId: string }>) => { // FIX: Explicit type
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;

    const jobRef = db.collection(COLLECTIONS.JOBS).doc(uploadId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) throw new HttpsError("not-found", "Job not found.");

    const updates: UpdateData<ContentGenerationJob> = {
        status: 'pending_planning' as UploadStatus,
        errors: FieldValue.delete(),
        generatedContent: FieldValue.delete(),
        finalAwaitingReviewData: FieldValue.delete(),
        assignmentSuggestions: FieldValue.delete(),
        totalMcqCount: FieldValue.delete(),
        totalFlashcardCount: FieldValue.delete(),
        totalBatches: FieldValue.delete(),
        completedBatches: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
    };

    await jobRef.update(updates);

    return { success: true, message: "Upload reset to planning stage." };
});

export const archiveUpload = onCall(async (request: CallableRequest<{ uploadId: string }>) => { // FIX: Explicit type
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    const { uploadId } = request.data;

    const jobRef = db.collection(COLLECTIONS.JOBS).doc(uploadId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) throw new HttpsError("not-found", "Job not found.");

    await jobRef.update({
        status: 'archived' as UploadStatus,
        updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, message: "Upload archived." };
});

export const processManualTextInput = onCall(async (request: CallableRequest<ProcessManualTextInputSchema>) => { // FIX: Explicit type
    validateInput(ProcessManualTextInputSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");

    const { fileName, rawText, isMarrow } = request.data;
    const jobRef = db.collection(COLLECTIONS.JOBS).doc();

    const newJobData: Omit<ContentGenerationJob, 'createdAt' | 'updatedAt'> = {
        id: jobRef.id,
        userId: request.auth.uid,
        title: fileName,
        pipeline: isMarrow ? 'marrow' : 'general',
        sourceText: rawText,
        status: 'pending_planning' as UploadStatus,
    };

    await jobRef.set({
        ...newJobData,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, uploadId: jobRef.id, message: "Text uploaded and ready for planning." };
});

// FIX: Implement the missing executeContentGeneration callable function
export const executeContentGeneration = onCall(async (request: CallableRequest<ExecuteContentGenerationCallableData>) => {
    validateInput(ExecuteContentGenerationSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");

    const { jobId, mcqCount, flashcardCount, startBatch = 0 } = request.data;
    const jobRef = db.collection(COLLECTIONS.JOBS).doc(jobId);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) throw new HttpsError("not-found", "Content generation job not found.");
    const jobData = jobDoc.data() as ContentGenerationJob;
    const sourceText = jobData.sourceText;
    const pipeline = jobData.pipeline;

    if (!sourceText) throw new HttpsError("failed-precondition", "Job is missing source text for content generation.");
    if (mcqCount === 0 && flashcardCount === 0) throw new HttpsError("invalid-argument", "No content types selected for generation.");

    ensureClientsInitialized();
    try {
        await jobRef.update({
            status: 'generating_content' as UploadStatus,
            totalMcqCount: mcqCount,
            totalFlashcardCount: flashcardCount,
            updatedAt: FieldValue.serverTimestamp(),
        });

        // The current design implies content generation happens in one go for the given counts.
        // If batching is desired for large counts, this logic would need to be expanded with multiple AI calls.
        const generatedMcqs: Partial<MCQ>[] = [];
        const generatedFlashcards: Partial<Flashcard>[] = [];

        // Generate MCQs
        if (mcqCount > 0) {
            const mcqPrompt = `You are a medical education content creator. Based on the provided text, generate ${mcqCount} high-quality MCQs. Ensure MCQs have a clear question, 4 distinct and plausible options (only one correct), a single correct answer, and a concise explanation. Focus on key definitions, clinical pathways, diagnostic criteria, and treatment options relevant for postgraduate medical students. The output should be a valid JSON object with a single key "mcqs", which is an array of MCQ objects. Each MCQ object should have "question", "options" (an array of strings), "correctAnswer", and "explanation". Ensure the response is parseable JSON ONLY. Text: """${sourceText.substring(0, 30000)}"""`;
            const mcqResult = await _powerfulModel.generateContent({ contents: [{ role: 'user', parts: [{ text: mcqPrompt }] }] });
            const mcqResponseText = mcqResult.response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (mcqResponseText) {
                const parsedMcqs = extractJson(mcqResponseText);
                if (Array.isArray(parsedMcqs.mcqs)) {
                    generatedMcqs.push(...parsedMcqs.mcqs.slice(0, mcqCount));
                }
            }
        }

        // Generate Flashcards
        if (flashcardCount > 0) {
            const flashcardPrompt = `You are a medical education content creator. Based on the provided text, generate ${flashcardCount} high-quality flashcards. Each flashcard should have a clear "front" (question/term) and a concise "back" (answer/definition). Focus on key definitions, clinical pathways, diagnostic criteria, and treatment options relevant for postgraduate medical students. The output should be a valid JSON object with a single key "flashcards", which is an array of Flashcard objects. Each Flashcard object should have "front" and "back". Ensure the response is parseable JSON ONLY. Text: """${sourceText.substring(0, 30000)}"""`;
            const flashcardResult = await _powerfulModel.generateContent({ contents: [{ role: 'user', parts: [{ text: flashcardPrompt }] }] });
            const flashcardResponseText = flashcardResult.response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (flashcardResponseText) {
                const parsedFlashcards = extractJson(flashcardResponseText);
                if (Array.isArray(parsedFlashcards.flashcards)) {
                    generatedFlashcards.push(...parsedFlashcards.flashcards.slice(0, flashcardCount));
                }
            }
        }
        
        await jobRef.update({
            generatedContent: FieldValue.arrayUnion({ // Store as an array, potentially for future batching
                batchNumber: startBatch, // Using startBatch as current batch number for now
                mcqs: generatedMcqs,
                flashcards: generatedFlashcards,
            }),
            finalAwaitingReviewData: {
                mcqs: generatedMcqs,
                flashcards: generatedFlashcards,
            },
            status: 'pending_assignment' as UploadStatus,
            totalBatches: 1, // For now, assume 1 batch
            completedBatches: 1,
            updatedAt: FieldValue.serverTimestamp(),
        });

        logger.info(`Generated ${generatedMcqs.length} MCQs and ${generatedFlashcards.length} Flashcards for job ${jobId}. Status updated to pending_assignment.`);
        return { success: true, message: `Content generated successfully for job ${jobId}.` };

    } catch (error: unknown) {
        const errorMessage = (error instanceof Error) ? error.message : String(error);
        await jobRef.update({
            status: 'generation_failed_partially' as UploadStatus, // Changed from 'error' to 'generation_failed_partially' for clarity
            errors: FieldValue.arrayUnion(`Content generation failed: ${errorMessage}`),
            updatedAt: FieldValue.serverTimestamp(),
        });
        logger.error(`Content generation failed for job ${jobId}:`, error);
        throw new HttpsError("internal", `Content generation failed: ${errorMessage}`);
    }
});


export const generateAndStageMarrowMcqs = onCall(async (request: CallableRequest<GenerateStagedContentSchema>) => { // FIX: Explicit type
    validateInput(GenerateStagedContentSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    
    const { uploadId, count } = request.data;
    const jobRef = db.collection(COLLECTIONS.JOBS).doc(uploadId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) throw new HttpsError("not-found", "Job not found.");

    const sourceText = jobSnap.data()?.sourceText;
    if (!sourceText) throw new HttpsError("failed-precondition", "Job is missing source text.");

    ensureClientsInitialized();
    try {
        const prompt = `You are an expert in medical content extraction for flashcards and MCQs. From the following text, generate ${count} *new* MCQs. Each MCQ must have a clear question, 4 distinct and plausible options (only one correct), a single correct answer, and a concise explanation. Focus on high-yield facts for medical residents. The output should be a valid JSON object with a single key "mcqs", which is an array of MCQ objects. Each MCQ object should have "question", "options" (an array of strings), "correctAnswer", and "explanation". Ensure the response is parseable JSON ONLY. Text: """${sourceText.substring(0, 30000)}"""`;
        const result = await _powerfulModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) throw new Error("AI failed to generate content.");

        const generatedContent = extractJson(responseText);
        
        if (!Array.isArray(generatedContent.mcqs)) {
            throw new Error("AI response did not return an array of MCQs.");
        }

        await jobRef.update({
            stagedContent: {
                ...jobSnap.data()?.stagedContent,
                generatedMcqs: generatedContent.mcqs || [], 
            },
            status: 'pending_assignment' as UploadStatus,
            updatedAt: FieldValue.serverTimestamp(),
        });

        return { success: true, message: `Generated ${generatedContent.mcqs.length} Marrow MCQs and staged for assignment.` };

    } catch (error: unknown) {
        logger.error(`Error generating Marrow MCQs for job ${uploadId}:`, error);
        await jobRef.update({
            status: 'error' as UploadStatus,
            errors: FieldValue.arrayUnion(`Marrow generation failed: ${(error as Error).message}`),
            updatedAt: FieldValue.serverTimestamp(),
        });
        throw new HttpsError("internal", `Marrow MCQ generation failed: ${(error as Error).message}`);
    }
});

export const generateGeneralContent = onCall(async (request: CallableRequest<GenerateStagedContentSchema>) => { // FIX: Explicit type
    validateInput(GenerateStagedContentSchema, request.data);
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    if (!request.auth?.token?.isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    
    const { uploadId, count } = request.data;
    const jobRef = db.collection(COLLECTIONS.JOBS).doc(uploadId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) throw new HttpsError("not-found", "Job not found.");

    const sourceText = jobSnap.data()?.sourceText;
    if (!sourceText) throw new HttpsError("failed-precondition", "Job is missing source text.");

    ensureClientsInitialized();
    try {
        const prompt = `You are a medical education content creator. Based on the provided text, generate ${count} high-quality MCQs. Ensure MCQs have a clear question, 4 distinct and plausible options (only one correct), a single correct answer, and a concise explanation. Focus on key definitions, clinical pathways, diagnostic criteria, and treatment options relevant for postgraduate medical students. The output should be a valid JSON object with a single key "mcqs", which is an array of MCQ objects. Each MCQ object should have "question", "options" (an array of strings), "correctAnswer", and "explanation". Ensure the response is parseable JSON ONLY. Text: """${sourceText.substring(0, 30000)}"""`;
        const result = await _powerfulModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) throw new Error("AI failed to generate content.");

        const generatedContent = extractJson(responseText);

        if (!Array.isArray(generatedContent.mcqs)) {
            throw new Error("AI response did not return an array of MCQs.");
        }

        await jobRef.update({
            stagedContent: {
                ...jobSnap.data()?.stagedContent,
                generatedMcqs: generatedContent.mcqs || [], 
            },
            status: 'pending_assignment' as UploadStatus,
            updatedAt: FieldValue.serverTimestamp(),
        });

        return { success: true, message: `Generated ${generatedContent.mcqs.length} General MCQs and staged for assignment.` };

    } catch (error: unknown) {
        logger.error(`Error generating General MCQs for job ${uploadId}:`, error);
        await jobRef.update({
            status: 'error' as UploadStatus,
            errors: FieldValue.arrayUnion(`General generation failed: ${(error as Error).message}`),
            updatedAt: FieldValue.serverTimestamp(),
        });
        throw new HttpsError("internal", `General MCQ generation failed: ${(error as Error).message}`);
    }
});