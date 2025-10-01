import * as admin from 'firebase-admin';

export type AbstractFieldValue = admin.firestore.FieldValue;
export type AbstractTimestamp = admin.firestore.Timestamp;

// Helper type to convert server-side Timestamps to client-side ISO strings
type WithClientDates<T> = {
  [P in keyof T]: T[P] extends (admin.firestore.Timestamp | admin.firestore.FieldValue | Date)
    ? string
    : T[P] extends (admin.firestore.Timestamp | admin.firestore.FieldValue | Date | null)
      ? string | null
      : T[P] extends object
        ? WithClientDates<T[P]>
        : T[P];
};

// --- USER & AUTH ---
export interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
    role: 'student' | 'resident' | 'faculty' | 'admin';
    isAdmin: boolean;
    createdAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
    lastLogin: admin.firestore.Timestamp | admin.firestore.FieldValue;
    updatedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
    bookmarkedMcqs?: string[];
    bookmarkedFlashcards?: string[];
    activeSessionId?: string;
    currentStreak?: number;
    lastStudiedDate?: admin.firestore.Timestamp | null;
    xp?: number;
    level?: number;
    theme?: string;
    badges?: string[];
    notificationSettings?: {
        studyReminders?: boolean;
        newContent?: boolean;
    };
}
export type ClientUser = WithClientDates<User>;

// --- CONTENT STRUCTURE ---
export interface Chapter {
    id: string;
    name: string;
    mcqCount: number;
    flashcardCount: number;
    topicId: string;
    originalTextRefIds?: string[];
    summaryNotes?: string | null;
    source: 'General' | 'Marrow';
    topicName: string;
    createdAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
    updatedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
}

export interface Topic {
    id: string;
    name: string;
    chapters: Chapter[];
    chapterCount: number;
    totalMcqCount: number;
    totalFlashcardCount: number;
    source: 'General' | 'Marrow';
    createdAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
    updatedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
}
export type ClientChapter = WithClientDates<Chapter>;
export type ClientTopic = Omit<WithClientDates<Topic>, 'chapters'> & { chapters: ClientChapter[] };

export type ContentStatus = 'pending' | 'approved' | 'rejected' | 'archived';

export interface MCQ {
    id: string;
    question: string;
    options: string[];
    answer: string;
    correctAnswer: string;
    explanation?: string;
    topicName: string;
    topicId: string;
    chapterName: string;
    chapterId: string;
    creatorId?: string;
    createdAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
    updatedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
    updatedBy?: string;
    source?: 'Marrow_Extracted' | 'Marrow_AI_Generated' | 'AI_Generated' | 'AI_Generated_From_MCQ' | 'PediaQuiz' | 'Master';
    status: ContentStatus;
    uploadId?: string;
    tags?: string[];
    difficulty?: 'easy' | 'medium' | 'hard';
    type: 'mcq';
}
export type ClientMCQ = WithClientDates<MCQ>;

export interface Flashcard {
    id: string;
    front: string;
    back: string;
    topicName: string;
    topicId: string;
    chapterName: string;
    chapterId: string;
    creatorId?: string;
    createdAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
    updatedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
    updatedBy?: string;
    source?: 'AI_Generated' | 'AI_Generated_From_MCQ' | 'Marrow' | 'PediaQuiz' | 'Master';
    status: ContentStatus;
    uploadId?: string;
    tags?: string[];
    mnemonic?: string;
    type: 'flashcard';
}
export type ClientFlashcard = WithClientDates<Flashcard>;

export interface CramSheet {
    id: string;
    userId: string;
    title: string;
    content: string;
    topicId?: string;
    chapterId?: string;
    createdAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
    updatedAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
}
export type ClientCramSheet = WithClientDates<CramSheet>;

// --- QUIZ & SESSIONS ---
export type ConfidenceRating = 'again' | 'hard' | 'good' | 'easy';

export interface Attempt {
    mcqId: string;
    isCorrect: boolean;
    selectedAnswer: string | null;
    sessionId: string;
    confidenceRating?: ConfidenceRating;
    timestamp: admin.firestore.Timestamp | admin.firestore.FieldValue;
    userId: string;
    interval: number;
    easeFactor: number;
    repetitions: number;
    nextReviewDate: admin.firestore.Timestamp;
    lastAttempted: admin.firestore.Timestamp | admin.firestore.FieldValue;
    topicId: string;
    chapterId: string;
}

export interface FlashcardAttempt {
    flashcardId: string;
    rating: ConfidenceRating;
    timestamp: admin.firestore.Timestamp | admin.firestore.FieldValue;
    interval: number;
    easeFactor: number;
    repetitions: number;
    reviews: number;
    nextReviewDate: admin.firestore.Timestamp;
    lastAttempted: admin.firestore.Timestamp | admin.firestore.FieldValue;
}

export interface AttemptedMCQDocument {
    id: string;
    latestAttempt: Attempt;
    history: Attempt[];
    attempts: number;
    correct: number;
    incorrect: number;
    createdAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
    updatedAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
}

export interface QuizSession {
    id: string;
    userId: string;
    mode: 'practice' | 'quiz' | 'custom' | 'weakness' | 'incorrect' | 'mock' | 'review_due' | 'warmup' | 'quick_fire' | 'daily_grind' | 'ddx_game';
    mcqIds: string[];
    flashcardIds?: string[];
    currentIndex: number;
    answers: Record<number, { selectedAnswer?: string; rating?: ConfidenceRating }>;
    isFinished: boolean;
    createdAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
    expiresAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
    updatedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
    itemOrder?: string[];
    completedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
}

export interface QuizResult {
    id: string;
    userId: string;
    sessionId?: string;
    mode: QuizSession['mode'];
    quizDate: admin.firestore.Timestamp | admin.firestore.FieldValue;
    totalQuestions: number;
    score: number;
    durationSeconds?: number;
    results: {
        mcqId: string;
        selectedAnswer: string | null;
        correctAnswer: string;
        isCorrect: boolean;
    }[];
    xpEarned?: number;
    streakBonus?: number;
}
export type ClientQuizResult = WithClientDates<Omit<QuizResult, 'results'>> & { results: QuizResult['results'] };

// --- GOALS ---
export interface GoalInput {
    id?: string;
    userId?: string;
    title: string;
    targetDate: Date | string;
    progress?: number;
    type: 'chapter' | 'mcq_count' | 'study_time' | 'daily';
    targetValue?: number;
    currentValue?: number;
    chapterId?: string;
    topicId?: string;
    isCompleted?: boolean;
    reward?: string;
    createdAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
    updatedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
}
export interface Goal extends GoalInput {
    id: string;
    userId: string;
    createdAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
    updatedAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
    progress: number;
}
export type ClientGoal = WithClientDates<Goal>;

// --- ADMIN & CONTENT GENERATION ---
export type UploadStatus =
    | 'pending_upload' | 'pending_ocr' | 'processed' | 'ocr_review' | 'generating_content'
    | 'content_review' | 'completed' | 'error' | 'archived' | 'pending_classification'
    | 'pending_marrow_extraction' | 'pending_generation_decision' | 'pending_assignment'
    | 'generating_batch' | 'generation_failed_partially' | 'pending_final_review'
    | 'pending_assignment_review' | 'batch_ready';

export interface AwaitingReviewData { mcqs?: Partial<MCQ>[]; flashcards?: Partial<Flashcard>[]; }

export interface AssignmentSuggestion {
    topicName: string;
    chapterName: string;
    isNewChapter: boolean;
    mcqs: Partial<MCQ>[];
    flashcards: Partial<Flashcard>[];
}

export interface ContentGenerationJob {
    id: string;
    userId: string;
    title: string;
    fileName?: string;
    gcsPath?: string;
    ocrOutputPath?: string;
    pipeline: 'general' | 'marrow';
    status: UploadStatus;
    sourceText?: string;
    createdAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
    updatedAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
    errors?: string[];
    finalAwaitingReviewData?: AwaitingReviewData;
    suggestedTopic?: string;
    suggestedChapter?: string;
    suggestedPlan?: { mcqCount: number; flashcardCount: number; };
    totalMcqCount?: number;
    totalFlashcardCount?: number;
    batchSize?: number;
    totalBatches?: number;
    completedBatches?: number;
    textChunks?: string[];
    generatedContent?: { batchNumber: number; mcqs: Partial<MCQ>[]; flashcards: Partial<Flashcard>[]; }[];
    assignmentSuggestions?: AssignmentSuggestion[];
    stagedContent?: { extractedMcqs: Partial<MCQ>[]; generatedMcqs?: Partial<MCQ>[]; orphanExplanations: string[]; };
    suggestedNewMcqCount?: number;
    suggestedKeyTopics?: string[];
    approvedTopic?: string;
    approvedChapter?: string;
}
export type UserUpload = ContentGenerationJob;
export type ClientContentGenerationJob = WithClientDates<ContentGenerationJob>;

// --- MISC & APP DATA ---
export interface LogEntry { id: string; userId: string; message: string; timestamp: admin.firestore.Timestamp | admin.firestore.FieldValue; type?: 'info' | 'warn' | 'error' | 'audit'; context?: Record<string, any>; }
export interface AppData { topics: Topic[]; mcqs: MCQ[]; flashcards: Flashcard[]; keyClinicalTopics: string[]; }
export interface Notification { id: string; userId: string; message: string; timestamp: admin.firestore.Timestamp | admin.firestore.FieldValue; read: boolean; type: 'info' | 'success' | 'warning'; }
export interface AIConfig { powerfulModel: string; quickModel: string; temperature: number; maxOutputTokens: number; createdAt: admin.firestore.Timestamp | admin.firestore.FieldValue; updatedAt: admin.firestore.Timestamp | admin.firestore.FieldValue; }
export interface DailyActivity { date: string; newUsers: number; quizzesCompleted: number; }
export interface TopContentItem { id: string; title: string; type: 'mcq' | 'flashcard'; views: number; }
export interface AdminAnalyticsData { totalUsers: number; totalQuizzesCompleted: number; totalContentItems: number; dailyActivity: DailyActivity[]; quizModeBreakdown: Record<string, number>; topContent: TopContentItem[]; }
export interface ChatMessage { id: string; text: string; sender: 'user' | 'assistant'; timestamp: Date; }

// --- CALLABLE FUNCTION INTERFACES ---
export interface AddAttemptCallableData { mcqId: string; isCorrect: boolean; selectedAnswer: string | null; sessionId?: string; confidenceRating?: ConfidenceRating; }
export interface AddFlashcardAttemptCallableData { flashcardId: string; rating: ConfidenceRating; sessionId?: string;}
export interface ToggleBookmarkCallableData { contentId: string; contentType: 'mcq' | 'flashcard'; }
export interface DeleteContentItemCallableData { id: string; type: 'mcq' | 'flashcard'; collectionName: 'MasterMCQ' | 'MarrowMCQ' | 'Flashcards'; }
export interface ProcessManualTextInputCallableData { fileName: string; rawText: string; isMarrow: boolean; }
export interface ExtractMarrowContentCallableData { uploadId: string; }
export interface GenerateAndAnalyzeMarrowContentCallableData { uploadId: string; count: number; }
export interface ApproveMarrowContentCallableData { uploadId: string; topicName: string; chapterName: string; keyTopics: string[]; }
export interface ApproveContentCallableData { uploadId: string; assignments: AssignmentSuggestion[]; }
export interface ResetUploadCallableData { uploadId: string; }
export interface ArchiveUploadCallableData { uploadId: string; }
export interface ReassignContentCallableData { uploadId: string; }
export interface PrepareForRegenerationCallableData { uploadId: string; }
export interface SuggestClassificationCallableData { uploadId: string; }
export interface PrepareBatchGenerationCallableData { uploadId: string; totalMcqCount: number; totalFlashcardCount: number; batchSize: number; approvedTopic: string; approvedChapter: string; }
export interface StartAutomatedBatchGenerationCallableData { uploadId: string; }
export interface AutoAssignContentCallableData { uploadId: string; existingTopics: Topic[]; scopeToTopicName?: string; }
export interface UpdateChapterNotesCallableData { topicId: string; chapterId: string; newSummary: string; source: 'General' | 'Marrow'; }
export interface GenerateChapterSummaryCallableData { uploadIds: string[]; }
export interface GetExpandedSearchTermsCallableData { query: string; }
export interface GetHintCallableData { mcqId: string; }
export interface EvaluateFreeTextAnswerCallableData { mcqId: string; userAnswer: string; }
export interface CreateFlashcardFromMcqCallableData { mcqId: string; }
export interface CreateCustomTestCallableData { title: string; questions: string[]; questionCount?: number; difficulty?: 'easy' | 'medium' | 'hard' | 'any'; tags?: string[]; mcqFlashcardRatio?: string; }
export interface CreateCustomTestCallableResponse { success: boolean; sessionId: string; }
export interface SearchContentCallableData { query: string; terms?: string[]; }
export interface ChatWithAssistantCallableData { prompt: string; history: ChatMessage[]; context?: { mcqId?: string; flashcardId?: string; chapterId?: string; chapterNotes?: string; }; }
export interface GeneratePerformanceAdviceCallableData { overallAccuracy: number; strongTopics: string[]; weakTopics: string[]; }
export interface GetQuizSessionFeedbackCallableData { quizResultId: string; }
export interface GetDailyGoalCallableData { userId: string; }
export interface GenerateQuickFireTestCallableData { testSize: number; }
export interface UpdateThemeCallableData { themeName: string; }
export interface SendPushNotificationCallableData { token: string; title: string; body: string; data?: Record<string, string>; }
export interface GenerateCramSheetCallableData { chapterIds?: string[]; topicIds?: string[]; userId: string; content?: string; title: string; }
export interface GetDailyGrindPlaylistCallableData { userId: string; mcqCount: number; flashcardCount: number; }
export interface GetMockExamQuestionsCallableData { userId: string; topicIds?: string[]; chapterIds?: string[]; questionCount: number; }
export interface EvaluateDDxCallableData { clinicalFindings: string; userAnswer: string; }
export interface SuggestNewGoalCallableData { userId: string; type?: 'chapter' | 'mcq_count' | 'study_time'; accuracy?: number; weakTopics?: string[]; }
export interface UpdateContentItemCallableData { id: string; type: 'mcq' | 'flashcard'; collectionName: 'MasterMCQ' | 'MarrowMCQ' | 'Flashcards'; updates: Partial<MCQ | Flashcard>; }
export interface UpdateEmailCallableData { newEmail: string; password: string; }
export interface UpdatePasswordCallableData { newPassword: string; currentPassword: string; }
export interface DeleteUserAccountCallableData { password: string; }
export interface GetAIConfigCallableData {}
export type UpdateAIConfigCallableData = Omit<AIConfig, 'createdAt' | 'updatedAt'>;
export interface GetAdminAnalyticsCallableData {}
export interface AddTagCallableData { tagName: string; }
export interface UpdateTagCallableData { oldTagName: string; newTagName: string; }
export interface DeleteTagCallableData { tagName: string; }
export interface GetNotificationsCallableData { userId: string; }
export interface MarkNotificationAsReadCallableData { notificationId: string; }
export interface GetAppDataCallableData {}
export interface GetQuizResultWithDetailsCallableData { resultId: string; }
export interface GetTagsCallableData {}
export interface GetQuestionsByTagCallableData { tagName: string; }
export interface GetUserStatsCallableData {}
export interface SetGoalCallableData extends Omit<GoalInput, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'progress'> {}
export interface UpdateGoalCallableData extends Partial<Omit<GoalInput, 'id' | 'userId' | 'createdAt' | 'updatedAt'>> { id: string; }
export interface DeleteGoalCallableData { goalId: string; }
export interface GenerateWeaknessBasedTestCallableData { testSize: number; }
export interface GetDailyWarmupQuizCallableData { count?: number; }