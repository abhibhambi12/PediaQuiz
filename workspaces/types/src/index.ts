// workspaces/types/src/index.ts
export interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
    isAdmin: boolean; // This property is crucial for isAdmin checks
    createdAt: Date;
    lastLogin: Date;
    bookmarks?: string[];
    currentStreak?: number;
    lastStudiedDate?: Date;
    bookmarkedMcqs?: string[];
    bookmarkedFlashcards?: string[];
    activeSessionId?: string;
}

export interface Chapter {
    id: string;
    name: string;
    mcqCount: number;
    flashcardCount: number;
    topicId: string;
    sourceUploadIds?: string[];
    originalTextRefIds?: string[];
    summaryNotes?: string | null;
    source?: 'General' | 'Marrow';
    topicName?: string;
}

export interface Topic {
    id: string;
    name: string;
    chapters: Chapter[];
    chapterCount: number;
    totalMcqCount: number;
    totalFlashcardCount: number;
    source?: 'General' | 'Marrow';
}
// FIX: Corrected PediaquizUserType alias to reference the User interface.
export type PediaquizTopicType = Topic; // Keep for existing usage
export type PediaquizUserType = User; // Correctly reference the User interface

export type ContentStatus = 'pending' | 'approved' | 'rejected' | 'archived';

export interface MCQ {
    id: string;
    question: string;
    options: string[];
    correctAnswer: string;
    explanation?: string;
    topic?: string;
    topicId: string;
    chapter?: string;
    chapterId: string;
    creatorId?: string;
    createdAt?: Date;
    source?: 'Marrow' | 'PediaQuiz' | 'Master' | 'AI_Generated_Chat' | 'AI_Generated' | 'Marrow_AI_Generated' | 'PediaQuiz_AI_Generated';
    status: ContentStatus;
    uploadId?: string;
    tags?: string[];
    topicName?: string;
    chapterName?: string;
}

export interface Flashcard {
    id: string;
    front: string;
    back: string;
    topic?: string;
    chapter?: string;
    topicId: string;
    chapterId: string;
    creatorId?: string;
    createdAt?: Date;
    source?: 'Marrow' | 'PediaQuiz' | 'Master' | 'AI_Generated' | string;
    status?: ContentStatus;
    uploadId?: string;
    topicName?: string;
    chapterName?: string;
    tags?: string[]; 
}

export interface LabValue {
    id: string;
    parameter: string;
    category: string;
    value: string;
    unit: string;
    source?: string;
}

export interface QuizResult {
    id: string;
    userId: string;
    sessionId: string;
    mode: string;
    quizDate: Date;
    totalQuestions: number;
    score: number;
    durationSeconds: number;
    topicIds?: string[];
    chapterIds?: string[];
    mcqAttempts: {
        mcqId: string;
        selectedAnswer: string | null;
        correctAnswer: string;
        isCorrect: boolean;
    }[];
}

export type ConfidenceRating = 'again' | 'hard' | 'good' | 'easy';

export interface Attempt {
    mcqId: string;
    selectedAnswer: string | null;
    isCorrect: boolean;
    timestamp: Date;
    userId: string;
    sessionId: string;
    confidenceRating: ConfidenceRating;
    interval: number;
    easeFactor: number;
    repetitions: number;
    nextReviewDate: Date;
}

export interface AttemptedMCQs {
    [mcqId: string]: {
        history: Attempt[];
        latestAttempt: Attempt;
    };
}

export interface FlashcardAttempt {
    flashcardId: string;
    rating: ConfidenceRating;
    timestamp: Date;
    interval: number;
    easeFactor: number;
    repetitions: number;
    nextReviewDate: Date;
}

export interface AwaitingReviewData {
    mcqs: Partial<MCQ>[];
    flashcards: Partial<Flashcard>[];
}

export type UploadStatus =
    | 'processing_ocr'
    | 'pending_planning'
    | 'pending_generation'
    | 'generating_content'
    | 'generation_failed_partially'
    | 'pending_assignment'
    | 'completed'
    | 'error'
    | 'archived';

export interface ContentGenerationJob {
    id: string;
    userId: string;
    title: string;
    pipeline: 'general' | 'marrow';
    status: UploadStatus;
    sourceText?: string;
    createdAt: Date;
    updatedAt?: Date;
    errors?: string[];
    suggestedPlan?: {
        mcqCount: number;
        flashcardCount: number;
        chapterBreakdown: string[];
    };
    totalMcqCount?: number;
    totalFlashcardCount?: number;
    totalBatches?: number;
    completedBatches?: number;
    generatedContent?: Array<{
        batchNumber: number;
        mcqs: Partial<MCQ>[];
        flashcards: Partial<Flashcard>[];
    }>;
    finalAwaitingReviewData?: AwaitingReviewData;
    assignmentSuggestions?: AssignmentSuggestion[];
}

export interface ChatMessage { id: string; text: string; sender: 'user' | 'assistant'; timestamp: Date; }

export interface AssignmentSuggestion {
    topicName: string;
    chapterName: string;
    isNewChapter: boolean;
    mcqIndexes?: number[];
    flashcardIndexes?: number[];
    mcqs?: Partial<MCQ>[];
    flashcards?: Partial<Flashcard>[];
}

export interface AddAttemptCallableData {
    mcqId: string;
    selectedAnswer: string | null;
    isCorrect: boolean;
    sessionId: string;
    confidenceRating: ConfidenceRating;
}

export interface AddFlashcardAttemptCallableData {
    flashcardId: string;
    rating: ConfidenceRating;
}

export interface ToggleBookmarkCallableData {
    contentId: string;
    contentType: 'mcq' | 'flashcard';
    action: 'add' | 'remove';
}

export interface DeleteContentItemCallableData {
    id: string;
    type: 'mcq' | 'flashcard';
    collectionName: 'MasterMCQ' | 'MarrowMCQ' | 'Flashcards';
}

export interface GenerateWeaknessBasedTestCallableData {
    testSize: number;
}

export interface GetDailyWarmupQuizCallableData {
    count: number;
}

export interface GetExpandedSearchTermsCallableData {
    query: string;
}

export interface GetHintCallableData {
    mcqId: string;
}

export interface EvaluateFreeTextAnswerCallableData {
    mcqId: string;
    userAnswer: string;
}

export interface CreateFlashcardFromMcqCallableData {
    mcqId: string;
}

export interface SuggestAssignmentCallableData {
    jobId: string;
    existingTopics: PediaquizTopicType[];
    scopeToTopicName?: string;
}

export interface PlanContentGenerationCallableData {
    jobId: string;
}

export interface ExecuteContentGenerationCallableData {
    jobId: string;
    mcqCount: number;
    flashcardCount: number;
    startBatch?: number;
}

export interface GenerateChapterSummaryCallableData {
    uploadIds: string[];
}

export interface ApproveGeneratedContentCallableData {
    jobId: string;
    topicId: string;
    topicName: string;
    chapterId: string;
    chapterName: string;
    keyTopics?: string[];
    summaryNotes?: string;
    generatedMcqs?: Partial<MCQ>[];
    generatedFlashcards?: Partial<Flashcard>[];
    pipeline: 'general' | 'marrow';
}

export interface UpdateChapterNotesCallableData {
    topicId: string;
    chapterId: string;
    newSummary: string;
    source: 'General' | 'Marrow';
}

export type AppData = { 
    topics: Topic[]; 
    keyClinicalTopics: string[];
};