// packages/types/src/index.ts

// --- USER & AUTH ---
export interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
    isAdmin: boolean;
    createdAt: Date;
    lastLogin: Date;
    bookmarks?: string[];
    currentStreak?: number; // NEW: Added for user streak tracking
    lastStudiedDate?: Date; // NEW: Added for user streak tracking
}

// --- CONTENT STRUCTURE ---
export interface Chapter {
    id: string;
    name: string;
    mcqCount: number;
    flashcardCount: number;
    topicId: string;
    sourceUploadIds?: string[];
    originalTextRefIds?: string[]; // For Universal Notes
    summaryNotes?: string | null;   // For Universal Notes
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

// --- STUDY MATERIALS ---
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

// --- STATS & PROGRESS ---
export interface QuizResult {
    id: string;
    userId: string;
    results: Array<{ mcqId: string; isCorrect: boolean; selectedAnswer: string | null; correctAnswer: string; }>;
    score: number;
    totalQuestions: number;
    date: Date;
    source: string;
    chapterId?: string;
}

// Spaced Repetition fields added to Attempt
export interface Attempt {
    attempts: number;
    correct: number;
    incorrect: number;
    isCorrect: boolean;
    lastAttempted: Date;
    interval?: number;      // Days until next review
    easeFactor?: number;    // SM-2 algorithm ease factor
    nextReviewDate?: any;  // Changed from Date to any to accommodate Firestore Timestamp
}
export interface AttemptedMCQs { [mcqId: string]: Attempt; }

export interface AwaitingReviewData {
    mcqs: MCQ[];
    flashcards: Flashcard[];
}

// --- AI & ADMIN ---
export type UploadStatus =
    | 'pending_upload'
    | 'pending_ocr'
    | 'failed_ocr'
    | 'processed'
    | 'pending_classification'
    | 'pending_approval'
    | 'batch_ready'
    | 'generating_batch'
    | 'pending_final_review'
    | 'pending_marrow_generation_approval' // New status for Smart Marrow Pipeline
    | 'pending_generation_decision'
    | 'pending_assignment'
    | 'pending_assignment_review'
    | 'completed'
    | 'error'
    | 'failed_unsupported_type'
    | 'archived'
    | 'failed_ai_extraction'
    | 'failed_api_permission';

export interface UserUpload {
    id: string;
    userId: string;
    fileName: string;
    status: UploadStatus;
    createdAt: Date;
    updatedAt?: Date;
    error?: string;
    extractedText?: string;
    
    // Marrow Pipeline specific staged content
    stagedContent?: {
        extractedMcqs?: Partial<MCQ>[];
        orphanExplanations?: string[];
        generatedMcqs?: Partial<MCQ>[];
        generatedFlashcards?: Partial<Flashcard>[]; // NEW: Added this property
    };
    suggestedKeyTopics?: string[];

    // Smart Marrow Text Pipeline specific fields
    suggestedNewMcqCount?: number;

    // General Pipeline specific properties
    title?: string;
    sourceReference?: string;
    suggestedTopic?: string;
    suggestedChapter?: string;
    estimatedMcqCount?: number;
    estimatedFlashcardCount?: number;
    
    // For batch generation in General Pipeline
    totalMcqCount?: number;
    totalFlashcardCount?: number;
    batchSize?: number;
    totalBatches?: number;
    completedBatches?: number;
    textChunks?: string[];
    generatedContent?: Array<{ batchNumber: number; mcqs: Partial<MCQ>[]; flashcards: Partial<Flashcard>[]; }>;

    finalAwaitingReviewData?: AwaitingReviewData;

    approvedTopic?: string;
    approvedChapter?: string;

    assignmentSuggestions?: AssignmentSuggestion[];
    existingQuestionSnippets?: string[];
}

export interface ChatMessage { id: string; text: string; sender: 'user' | 'assistant'; timestamp: Date; }

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

// --- UTILITY ---
export type AppData = { 
    topics: Topic[]; 
    mcqs: MCQ[]; 
    flashcards: Flashcard[]; 
    labValues: LabValue[];
    keyClinicalTopics: string[]; // Fix: Added missing property
};