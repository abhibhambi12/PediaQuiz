export interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
    isAdmin: boolean;
    createdAt: Date;
    lastLogin: Date;
    bookmarks?: string[];
    currentStreak?: number;
    lastStudiedDate?: Date;
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
export type PediaquizTopicType = Topic;
export type ContentStatus = 'pending' | 'approved' | 'rejected';
export interface MCQ {
    id: string;
    question: string;
    options: string[];
    answer: string;
    explanation: string;
    topic: string;
    topicId: string;
    chapter: string;
    chapterId: string;
    creatorId: string;
    createdAt: Date;
    source?: 'Marrow' | 'PediaQuiz' | 'Master' | 'AI_Generated_Chat' | 'AI_Generated' | 'Marrow_AI_Generated' | 'PediaQuiz_AI_Generated';
    status: ContentStatus;
    uploadId?: string;
    tags?: string[];
}
export interface Flashcard {
    id: string;
    front: string;
    back: string;
    topic: string;
    chapter: string;
    topicId: string;
    chapterId: string;
    creatorId: string;
    createdAt: Date;
    source?: 'Marrow' | 'PediaQuiz' | 'Master' | 'AI_Generated' | string;
    status?: ContentStatus;
    uploadId?: string;
    topicName?: string;
    chapterName?: string;
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
    results: Array<{
        mcqId: string;
        isCorrect: boolean;
        selectedAnswer: string | null;
        correctAnswer: string;
    }>;
    score: number;
    totalQuestions: number;
    date: Date;
    source: string;
    chapterId?: string;
}
export interface Attempt {
    attempts: number;
    correct: number;
    incorrect: number;
    isCorrect: boolean;
    lastAttempted: Date;
    interval?: number;
    easeFactor?: number;
    nextReviewDate?: any;
}
export interface AttemptedMCQs {
    [mcqId: string]: Attempt;
}
export interface AwaitingReviewData {
    mcqs: MCQ[];
    flashcards: Flashcard[];
}
export type UploadStatus = 'pending_upload' | 'pending_ocr' | 'failed_ocr' | 'processed' | 'pending_classification' | 'pending_approval' | 'batch_ready' | 'generating_batch' | 'pending_final_review' | 'pending_marrow_generation_approval' | 'pending_generation_decision' | 'pending_assignment' | 'pending_assignment_review' | 'completed' | 'error' | 'failed_unsupported_type' | 'archived' | 'failed_ai_extraction' | 'failed_api_permission';
export interface UserUpload {
    id: string;
    userId: string;
    fileName: string;
    status: UploadStatus;
    createdAt: Date;
    updatedAt?: Date;
    error?: string;
    extractedText?: string;
    stagedContent?: {
        extractedMcqs?: Partial<MCQ>[];
        orphanExplanations?: string[];
        generatedMcqs?: Partial<MCQ>[];
        generatedFlashcards?: Partial<Flashcard>[];
    };
    suggestedKeyTopics?: string[];
    suggestedNewMcqCount?: number;
    title?: string;
    sourceReference?: string;
    suggestedTopic?: string;
    suggestedChapter?: string;
    estimatedMcqCount?: number;
    estimatedFlashcardCount?: number;
    totalMcqCount?: number;
    totalFlashcardCount?: number;
    batchSize?: number;
    totalBatches?: number;
    completedBatches?: number;
    textChunks?: string[];
    generatedContent?: Array<{
        batchNumber: number;
        mcqs: Partial<MCQ>[];
        flashcards: Partial<Flashcard>[];
    }>;
    finalAwaitingReviewData?: AwaitingReviewData;
    approvedTopic?: string;
    approvedChapter?: string;
    assignmentSuggestions?: AssignmentSuggestion[];
    existingQuestionSnippets?: string[];
}
export interface ChatMessage {
    id: string;
    text: string;
    sender: 'user' | 'assistant';
    timestamp: Date;
}
export interface AssignmentSuggestion {
    topicName: string;
    chapterName: string;
    isNewChapter: boolean;
    mcqs?: MCQ[];
    flashcards?: Flashcard[];
}
export type ToggleBookmarkCallableData = {
    contentId: string;
    contentType: 'mcq' | 'flashcard';
};
export type DeleteContentItemCallableData = {
    id: string;
    type: 'mcq' | 'flashcard';
    collectionName: 'MasterMCQ' | 'MarrowMCQ' | 'Flashcards';
};
export type AppData = {
    topics: Topic[];
    mcqs: MCQ[];
    flashcards: Flashcard[];
    labValues: LabValue[];
    keyClinicalTopics: string[];
};
