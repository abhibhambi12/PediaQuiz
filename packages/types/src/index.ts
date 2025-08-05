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
}

// --- CONTENT STRUCTURE ---
export interface Chapter {
    id: string;
    name: string;
    mcqCount: number;
    flashcardCount: number;
    topicId: string;
    sourceUploadIds?: string[]; // Added for Marrow
    originalTextRefIds?: string[]; // Added for Marrow
    summaryNotes?: string | null; // Added for Marrow
    source?: 'General' | 'Marrow'; // Added for Marrow
    topicName?: string; // Added for Marrow
}

export interface Topic {
    id: string;
    name: string;
    chapters: Chapter[];
    chapterCount: number;
    totalMcqCount: number;
    totalFlashcardCount: number;
    source?: 'General' | 'Marrow'; // Added for Marrow
}

// --- STUDY MATERIALS ---
export type ContentStatus = 'pending' | 'approved' | 'rejected';

export interface MCQ {
    id: string;
    question: string;
    options: string[];
    answer: string; // Can be 'A', 'B', 'C', 'D' or the full text answer
    explanation: string;
    topic: string; // Raw topic name from Firestore document (can be deprecated for topicName)
    topicId: string; // Normalized topic ID
    chapter: string; // Raw chapter name from Firestore document (can be deprecated for chapterName)
    chapterId: string; // Normalized chapter ID
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
    topic: string; // Raw topic name from Firestore document - retained for now
    chapter: string; // Raw chapter name from Firestore document - retained for now
    topicId: string; // Normalized topic ID
    chapterId: string; // Normalized chapter ID
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
    source: string; // e.g., 'quiz', 'practice', 'custom', 'weakness'
    chapterId?: string; // Optional, if quiz was chapter-specific
}

export interface Attempt {
    attempts: number; correct: number; incorrect: number; isCorrect: boolean; lastAttempted: Date;
    interval?: number; easeFactor?: number; nextReview?: Date;
}
export interface AttemptedMCQs { [mcqId: string]: Attempt; }

// NEW: AwaitingReviewData structure for final content review
export interface AwaitingReviewData {
    mcqs: MCQ[];
    flashcards: Flashcard[];
}

// --- AI & ADMIN ---
// CRITICAL FIX: Expanded UploadStatus to include all states from the General Pipeline
export type UploadStatus =
    | 'pending_upload'
    | 'pending_ocr'
    | 'failed_ocr'
    | 'processed' // OCR complete
    | 'pending_classification' // General: AI suggesting topic/chapter
    | 'pending_approval' // General: Admin approves suggested topic/chapter
    | 'batch_ready' // General: Batches prepared for generation
    | 'generating_batch' // General: Automated generation in progress
    | 'pending_final_review' // General: Generation complete, awaiting final admin review/assignment
    | 'pending_generation_decision' // Marrow: Extraction complete, awaiting generation decision
    | 'pending_assignment' // Marrow: Generation complete, awaiting assignment
    | 'pending_assignment_review' // General: AI auto-assignment complete, awaiting admin review
    | 'completed' // Content approved and saved
    | 'error' // General error state
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
    };
    suggestedKeyTopics?: string[];

    // NEW: General Pipeline specific properties
    title?: string; // For the general document title
    sourceReference?: string; // For general source reference
    suggestedTopic?: string; // AI suggested topic for general
    suggestedChapter?: string; // AI suggested chapter for general
    estimatedMcqCount?: number; // AI estimated MCQs for general
    estimatedFlashcardCount?: number; // AI estimated Flashcards for general
    
    // For batch generation in General Pipeline
    totalMcqCount?: number; // Total requested MCQs for batch
    totalFlashcardCount?: number; // Total requested Flashcards for batch
    batchSize?: number; // Size of each batch
    totalBatches?: number; // Total number of chunks/batches
    completedBatches?: number; // Number of batches completed
    textChunks?: string[]; // The document split into chunks for batch processing
    generatedContent?: Array<{ batchNumber: number; mcqs: Partial<MCQ>[]; flashcards: Partial<Flashcard>[]; }>; // Generated content per batch

    finalAwaitingReviewData?: AwaitingReviewData; // Final combined content for review

    approvedTopic?: string; // Manually approved topic for general
    approvedChapter?: string; // Manually approved chapter for general

    assignmentSuggestions?: AssignmentSuggestion[]; // AI suggested assignments per chunk
    existingQuestionSnippets?: string[]; // For negative constraints during regeneration
}

export interface ChatMessage { id: string; text: string; sender: 'user' | 'assistant'; timestamp: Date; }

// Corrected type definition for AssignmentSuggestion based on new backend data
export interface AssignmentSuggestion {
    topicName: string; // Topic name for assignment
    chapterName: string; // Chapter name for assignment
    isNewChapter: boolean; // True if this is a new chapter for the topic
    mcqs?: MCQ[]; // The actual MCQs assigned to this group
    flashcards?: Flashcard[]; // The actual Flashcards assigned to this group
    // The original `topicId` and `chapterId` from AI models are often just names, 
    // using `topicName` and `chapterName` consistently for assignments is clearer.
}


// Data passed to toggleBookmark callable function
export type ToggleBookmarkCallableData = {
    contentId: string;
    contentType: 'mcq' | 'flashcard';
};

// Data passed to deleteContentItem callable function
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
    keyClinicalTopics: string[];
};