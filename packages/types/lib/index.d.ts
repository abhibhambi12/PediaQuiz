import { FieldValue } from 'firebase-admin/firestore';
export interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
    isAdmin: boolean;
    createdAt: Date | FieldValue;
    lastLogin: Date | FieldValue;
    bookmarkedMcqs?: string[];
    bookmarkedFlashcards?: string[];
    activeSessionId?: string;
    currentStreak?: number;
    lastStudiedDate?: Date | FieldValue | null;
    xp?: number;
    level?: number;
    theme?: string;
    badges?: string[];
}
export type PediaquizUserType = User;
export interface Chapter {
    id: string;
    name: string;
    mcqCount: number;
    flashcardCount: number;
    topicId: string;
    sourceUploadIds?: string[];
    originalTextRefIds?: string[];
    summaryNotes?: string | null;
    source: 'General' | 'Marrow';
    topicName: string;
    createdAt?: Date | FieldValue;
    updatedAt?: Date | FieldValue;
}
export interface Topic {
    id: string;
    name: string;
    chapters: Chapter[] | string[];
    chapterCount: number;
    totalMcqCount: number;
    totalFlashcardCount: number;
    source: 'General' | 'Marrow';
    createdAt?: Date | FieldValue;
    updatedAt?: Date | FieldValue;
}
export type PediaquizTopicType = Topic;
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
    createdAt?: Date | FieldValue;
    source?: 'Marrow_Extracted' | 'Marrow_AI_Generated' | 'AI_Generated' | 'AI_Generated_From_MCQ' | 'PediaQuiz' | 'Master';
    status: ContentStatus;
    uploadId?: string;
    tags?: string[];
    difficulty?: 'easy' | 'medium' | 'hard';
    type: 'mcq';
}
export interface Flashcard {
    id: string;
    front: string;
    back: string;
    topicName: string;
    topicId: string;
    chapterName: string;
    chapterId: string;
    creatorId?: string;
    createdAt?: Date | FieldValue;
    source?: 'AI_Generated' | 'AI_Generated_From_MCQ' | 'Marrow' | 'PediaQuiz' | 'Master';
    status: ContentStatus;
    uploadId?: string;
    tags?: string[];
    mnemonic?: string;
    type: 'flashcard';
}
export interface QuizSession {
    id: string;
    userId: string;
    mode: 'practice' | 'quiz' | 'custom' | 'weakness' | 'incorrect' | 'mock' | 'review_due' | 'warmup' | 'quick_fire' | 'daily_grind' | 'ddx_game';
    mcqIds: string[];
    flashcardIds?: string[];
    currentIndex: number;
    answers: Record<number, string | null>;
    markedForReview: number[];
    isFinished: boolean;
    createdAt: Date | FieldValue;
    expiresAt: Date | FieldValue;
    updatedAt?: Date | FieldValue;
}
export interface QuizResult {
    id: string;
    userId: string;
    sessionId?: string;
    mode: 'practice' | 'quiz' | 'custom' | 'weakness' | 'incorrect' | 'mock' | 'review_due' | 'warmup' | 'quick_fire' | 'daily_grind' | 'ddx_game';
    quizDate: Date | FieldValue;
    totalQuestions: number;
    score: number;
    durationSeconds?: number;
    topicIds?: string[];
    chapterIds?: string[];
    mcqAttempts: {
        mcqId: string;
        selectedAnswer: string | null;
        correctAnswer: string;
        isCorrect: boolean;
    }[];
    xpEarned?: number;
    streakBonus?: number;
}
export type ConfidenceRating = 'again' | 'hard' | 'good' | 'easy';
export interface Attempt {
    mcqId: string;
    isCorrect: boolean;
    selectedAnswer: string | null;
    timestamp: Date | FieldValue;
    userId: string;
    sessionId?: string;
    confidenceRating?: ConfidenceRating;
    interval: number;
    easeFactor: number;
    repetitions: number;
    nextReviewDate: Date | FieldValue;
    lastAttempted: Date | FieldValue;
    topicId: string;
    chapterId: string;
}
export interface AttemptedMCQDocument {
    id: string;
    latestAttempt: Attempt;
    history: Attempt[];
    attempts: number;
    correct: number;
    incorrect: number;
    createdAt: Date | FieldValue;
    updatedAt?: Date | FieldValue;
}
export interface AttemptedMCQs {
    [mcqId: string]: AttemptedMCQDocument;
}
export interface FlashcardAttempt {
    flashcardId: string;
    rating: ConfidenceRating;
    timestamp: Date | FieldValue;
    interval: number;
    easeFactor: number;
    repetitions: number;
    nextReviewDate: Date | FieldValue;
    lastAttempted: Date | FieldValue;
    reviews: number;
}
export interface Goal {
    id: string;
    userId: string;
    title: string;
    targetDate: Date | FieldValue;
    progress: number;
    type: 'chapter' | 'mcq_count' | 'study_time' | 'daily';
    targetValue?: number;
    currentValue?: number;
    chapterId?: string;
    topicId?: string;
    createdAt?: Date | FieldValue;
    updatedAt?: Date | FieldValue;
    isCompleted?: boolean;
    reward?: string;
}
export interface GoalInput extends Omit<Goal, 'targetDate' | 'createdAt' | 'updatedAt' | 'id' | 'userId'> {
    targetDate: Date | string;
}
export interface ChatMessage {
    id: string;
    text: string;
    sender: 'user' | 'assistant';
    timestamp: Date;
}
export interface LogEntry {
    id: string;
    userId: string;
    message: string;
    timestamp: Date | FieldValue;
    type?: 'info' | 'warn' | 'error';
    context?: Record<string, any>;
}
export type UploadStatus = 'pending_upload' | 'pending_ocr' | 'failed_ocr' | 'processed' | 'pending_classification' | 'pending_approval' | 'batch_ready' | 'generating_batch' | 'pending_final_review' | 'pending_marrow_extraction' | 'pending_generation_decision' | 'pending_assignment' | 'pending_assignment_review' | 'completed' | 'error' | 'failed_unsupported_type' | 'failed_ai_extraction' | 'failed_api_permission' | 'archived' | 'generation_failed_partially';
export interface SuggestedPlan {
    mcqCount: number;
    flashcardCount: number;
}
export interface StagedContent {
    extractedMcqs?: Array<Partial<MCQ>>;
    orphanExplanations?: string[];
    generatedMcqs?: Array<Partial<MCQ>>;
    generatedFlashcards?: Array<Partial<Flashcard>>;
}
export interface AssignmentSuggestion {
    topicName: string;
    chapterName: string;
    isNewChapter: boolean;
    mcqs?: Array<Partial<MCQ> & {
        id?: string;
    }>;
    flashcards?: Array<Partial<Flashcard> & {
        id?: string;
    }>;
}
export interface ContentGenerationJob {
    id: string;
    userId: string;
    title: string;
    fileName?: string;
    pipeline: 'general' | 'marrow';
    status: UploadStatus;
    extractedText?: string;
    sourceText?: string;
    createdAt: Date | FieldValue;
    updatedAt?: Date | FieldValue;
    errors?: string[];
    suggestedTopic?: string;
    suggestedChapter?: string;
    suggestedPlan?: SuggestedPlan;
    sourceReference?: string;
    batchSize?: number;
    totalBatches?: number;
    completedBatches?: number;
    textChunks?: string[];
    generatedContent?: Array<{
        batchNumber: number;
        mcqs: Partial<MCQ>[];
        flashcards: Partial<Flashcard>[];
    }>;
    finalAwaitingReviewData?: {
        mcqs: Array<Partial<MCQ>>;
        flashcards: Array<Partial<Flashcard>>;
    };
    assignmentSuggestions?: AssignmentSuggestion[];
    approvedTopic?: string;
    approvedChapter?: string;
    existingQuestionSnippets?: string[];
    stagedContent?: StagedContent;
    suggestedKeyTopics?: string[];
    suggestedNewMcqCount?: number;
    totalMcqCount?: number;
    totalFlashcardCount?: number;
}
export type UserUpload = ContentGenerationJob;
export interface CramSheet {
    id: string;
    userId: string;
    title: string;
    content: string;
    topicId?: string;
    chapterId?: string;
    createdAt: Date | FieldValue;
    updatedAt?: Date | FieldValue;
}
export interface AddAttemptCallableData {
    mcqId: string;
    selectedAnswer: string | null;
    isCorrect: boolean;
    sessionId?: string;
    confidenceRating?: ConfidenceRating;
}
export interface AddFlashcardAttemptCallableData {
    flashcardId: string;
    rating: ConfidenceRating;
}
export interface ToggleBookmarkCallableData {
    contentId: string;
    contentType: 'mcq' | 'flashcard';
}
export interface DeleteContentItemCallableData {
    id: string;
    type: 'mcq' | 'flashcard';
    collectionName: 'MasterMCQ' | 'MarrowMCQ' | 'Flashcards';
}
export interface GenerateWeaknessBasedTestCallableData {
    allMcqs: Array<Pick<MCQ, 'id' | 'topicId' | 'chapterId' | 'source' | 'tags' | 'difficulty'>>;
    testSize: number;
}
export interface GetDailyWarmupQuizCallableData {
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
export interface CreateCustomTestCallableData {
    title: string;
    questions: string[];
}
export interface SearchContentCallableData {
    query: string;
    terms?: string[];
}
export interface ChatWithAssistantCallableData {
    prompt: string;
    history: ChatMessage[];
    context?: {
        mcqId?: string;
        flashcardId?: string;
        chapterId?: string;
        chapterNotes?: string;
    };
}
export interface GeneratePerformanceAdviceCallableData {
    overallAccuracy: number;
    strongTopics: string[];
    weakTopics: string[];
}
export interface GetQuizSessionFeedbackCallableData {
    quizResultId: string;
}
export interface GetDailyGoalCallableData {
    userId: string;
}
export interface GenerateQuickFireTestCallableData {
    testSize: number;
}
export interface UpdateThemeCallableData {
    themeName: string;
}
export interface SendPushNotificationCallableData {
    token: string;
    title: string;
    body: string;
    data?: {
        [key: string]: string;
    };
}
export interface ProcessManualTextInputCallableData {
    fileName: string;
    rawText: string;
    isMarrow: boolean;
}
export interface ExtractMarrowContentCallableData {
    uploadId: string;
}
export interface GenerateAndAnalyzeMarrowContentCallableData {
    uploadId: string;
    count: number;
}
export interface ApproveMarrowContentCallableData {
    uploadId: string;
    topicId: string;
    topicName: string;
    chapterId: string;
    chapterName: string;
    keyTopics: string[];
}
export interface ApproveContentCallableData {
    uploadId: string;
    assignments: AssignmentSuggestion[];
}
export interface ResetUploadCallableData {
    uploadId: string;
}
export interface ArchiveUploadCallableData {
    uploadId: string;
}
export interface ReassignContentCallableData {
    uploadId: string;
}
export interface PrepareForRegenerationCallableData {
    uploadId: string;
}
export interface SuggestClassificationCallableData {
    uploadId: string;
}
export interface PrepareBatchGenerationCallableData {
    uploadId: string;
    totalMcqCount: number;
    totalFlashcardCount: number;
    batchSize: number;
    approvedTopic: string;
    approvedChapter: string;
}
export interface StartAutomatedBatchGenerationCallableData {
    uploadId: string;
}
export interface AutoAssignContentCallableData {
    uploadId: string;
    existingTopics: PediaquizTopicType[];
    scopeToTopicName?: string;
}
export interface UpdateChapterNotesCallableData {
    topicId: string;
    chapterId: string;
    newSummary: string;
    source: 'General' | 'Marrow';
}
export interface GenerateChapterSummaryCallableData {
    uploadIds: string[];
    topicId?: string;
    chapterId?: string;
    source?: 'General' | 'Marrow';
}
export interface GenerateCramSheetCallableData {
    chapterIds?: string[];
    topicIds?: string[];
    userId: string;
    content?: string;
    title: string;
}
export interface GetDailyGrindPlaylistCallableData {
    userId: string;
    mcqCount: number;
    flashcardCount: number;
}
export interface GetMockExamQuestionsCallableData {
    userId: string;
    topicIds?: string[];
    chapterIds?: string[];
    questionCount: number;
}
export interface EvaluateDDxCallableData {
    clinicalFindings: string;
    userAnswer: string;
}
export interface SuggestNewGoalCallableData {
    userId: string;
    type?: 'chapter' | 'mcq_count' | 'study_time';
    accuracy?: number;
    weakTopics?: string[];
}
export interface AppData {
    topics: Topic[];
    keyClinicalTopics: string[];
}
