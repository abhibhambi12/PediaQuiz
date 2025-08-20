// functions/src/utils/validation.ts
// CRITICAL FIX: Ensures ALL Callable Data Interfaces are explicitly imported from types and correctly used here.
// CRITICAL FIX: All Zod schemas correctly typed and imported.
// NEW: Added Zod schemas for new features (Cram Sheets, Daily Grind, Mock Exam, DDx Game, Suggested Goals)

import { z } from "zod";
import { HttpsError } from "firebase-functions/v2/https";
import type { // All imports here must exactly match exports from packages/types/src/index.ts
    AddAttemptCallableData,
    AddFlashcardAttemptCallableData,
    ToggleBookmarkCallableData,
    DeleteContentItemCallableData,
    ProcessManualTextInputCallableData, // Explicitly import CallableData interfaces
    ExtractMarrowContentCallableData,
    GenerateAndAnalyzeMarrowContentCallableData,
    ApproveMarrowContentCallableData,
    ApproveContentCallableData,
    ResetUploadCallableData,
    ArchiveUploadCallableData,
    ReassignContentCallableData,
    PrepareForRegenerationCallableData,
    SuggestClassificationCallableData,
    PrepareBatchGenerationCallableData,
    StartAutomatedBatchGenerationCallableData,
    AutoAssignContentCallableData,
    UpdateChapterNotesCallableData,
    GenerateChapterSummaryCallableData,
    GenerateWeaknessBasedTestCallableData,
    GetDailyWarmupQuizCallableData,
    GetExpandedSearchTermsCallableData,
    GetHintCallableData,
    EvaluateFreeTextAnswerCallableData,
    CreateFlashcardFromMcqCallableData,
    CreateCustomTestCallableData,
    QuizResult, // Used for QuizResultSchema
    GoalInput, // Use GoalInput for validation
    MCQ, // Not directly used in schemas but kept for reference if needed
    Chapter, // Not directly used in schemas but kept for reference if needed
    PediaquizTopicType, // Not directly used in schemas but kept for reference if needed
    SearchContentCallableData,
    ChatWithAssistantCallableData,
    GeneratePerformanceAdviceCallableData,
    GetQuizSessionFeedbackCallableData,
    GetDailyGoalCallableData,
    GenerateQuickFireTestCallableData,
    UpdateThemeCallableData,
    SendPushNotificationCallableData,
    ContentGenerationJob, // Added ContentGenerationJob as a type for schemas below
    GenerateCramSheetCallableData, // NEW: For Cram Sheets
    GetDailyGrindPlaylistCallableData, // NEW: For Daily Grind
    GetMockExamQuestionsCallableData, // NEW: For Mock Exam
    EvaluateDDxCallableData, // NEW: For DDx Game
    SuggestNewGoalCallableData, // NEW: For AI suggested goals
} from "@pediaquiz/types";


// --- HELPER SCHEMAS & FUNCTIONS (DEFINED FIRST) ---

const McqSourceSchema = z.union([
    z.literal('Marrow_Extracted'),
    z.literal('Marrow_AI_Generated'),
    z.literal('AI_Generated'),
    z.literal('AI_Generated_From_MCQ'),
    z.literal('PediaQuiz'),
    z.literal('Master'),
]);

const DifficultySchema = z.union([z.literal('easy'), z.literal('medium'), z.literal('hard')]);

const dateInputToDate = z.union([z.string(), z.date()])
    .transform((val, ctx) => {
        try {
            const date = new Date(val);
            if (isNaN(date.getTime())) {
                ctx.addIssue({
                    code: z.ZodIssueCode.invalid_date,
                    message: "Invalid date string",
                });
                return z.NEVER;
            }
            return date;
        } catch (e) {
            ctx.addIssue({
                code: z.ZodIssueCode.invalid_date,
                message: "Could not parse date",
            });
            return z.NEVER;
        }
    });


// --- ZOD VALIDATION SCHEMAS ---

export const AddAttemptCallableDataSchema: z.ZodSchema<AddAttemptCallableData> = z.object({
    mcqId: z.string().trim().min(1, "MCQ ID is required."),
    isCorrect: z.boolean(),
    selectedAnswer: z.string().nullable(),
    sessionId: z.string().trim().min(1).optional(),
    confidenceRating: z.union([z.literal("again"), z.literal("hard"), z.literal("good"), z.literal("easy")]).optional(),
});

export const QuizResultSchema: z.ZodSchema<Omit<QuizResult, 'id' | 'userId' | 'quizDate'>> = z.object({
    sessionId: z.string().trim().min(1).optional(),
    mode: z.union([
        z.literal("practice"), z.literal("quiz"), z.literal("custom"), z.literal("weakness"),
        z.literal("incorrect"), z.literal("mock"), z.literal("review_due"), z.literal("warmup"), z.literal("quick_fire"), z.literal("daily_grind"), z.literal("ddx_game")
    ]),
    totalQuestions: z.number().int().positive("Total questions must be a positive number."),
    score: z.number().int().min(0, "Score cannot be negative."),
    durationSeconds: z.number().int().min(0).optional(),
    topicIds: z.array(z.string().trim().min(1)).optional(),
    chapterIds: z.array(z.string().trim().min(1)).optional(),
    mcqAttempts: z.array(z.object({
        mcqId: z.string().trim().min(1),
        selectedAnswer: z.string().nullable(),
        correctAnswer: z.string().trim().min(1),
        isCorrect: z.boolean(),
    })).min(1, "MCQ attempts cannot be empty."),
    xpEarned: z.number().int().min(0).optional(),
    streakBonus: z.number().int().min(0).optional(),
});

export const AddFlashcardAttemptCallableDataSchema: z.ZodSchema<AddFlashcardAttemptCallableData> = z.object({
    flashcardId: z.string().trim().min(1, "Flashcard ID is required."),
    rating: z.union([z.literal('again'), z.literal('hard'), z.literal('good'), z.literal('easy')]),
});

export const ToggleBookmarkCallableDataSchema: z.ZodSchema<ToggleBookmarkCallableData> = z.object({
    contentId: z.string().trim().min(1),
    contentType: z.enum(['mcq', 'flashcard']),
});

export const DeleteContentItemCallableDataSchema: z.ZodSchema<DeleteContentItemCallableData> = z.object({
    id: z.string().trim().min(1),
    type: z.enum(['mcq', 'flashcard']),
    collectionName: z.enum(['MasterMCQ', 'MarrowMCQ', 'Flashcards']),
});

// Admin Callable Function Schemas
export const ProcessManualTextInputCallableDataSchema: z.ZodSchema<ProcessManualTextInputCallableData> = z.object({
    fileName: z.string().trim().min(1, "File name (title) is required."),
    rawText: z.string().trim().min(10, "Raw text must be at least 10 characters."),
    isMarrow: z.boolean(),
});

export const ExtractMarrowContentCallableDataSchema: z.ZodSchema<ExtractMarrowContentCallableData> = z.object({
    uploadId: z.string().trim().min(1),
});

export const GenerateAndAnalyzeMarrowContentCallableDataSchema: z.ZodSchema<GenerateAndAnalyzeMarrowContentCallableData> = z.object({
    uploadId: z.string().trim().min(1),
    count: z.number().int().min(0),
});

export const ApproveMarrowContentCallableDataSchema: z.ZodSchema<ApproveMarrowContentCallableData> = z.object({
    uploadId: z.string().trim().min(1),
    topicId: z.string().trim().min(1),
    topicName: z.string().trim().min(1),
    chapterId: z.string().trim().min(1),
    chapterName: z.string().trim().min(1),
    keyTopics: z.array(z.string().trim().min(1)),
});

export const ApproveContentCallableDataSchema: z.ZodSchema<ApproveContentCallableData> = z.object({
    uploadId: z.string().trim().min(1),
    assignments: z.array(z.object({
        topicName: z.string().trim().min(1),
        chapterName: z.string().trim().min(1),
        isNewChapter: z.boolean(),
        mcqs: z.array(z.object({ id: z.string().optional() }).passthrough()).optional(),
        flashcards: z.array(z.object({ id: z.string().optional() }).passthrough()).optional(),
    })).min(1, "At least one assignment is required."),
});

export const ResetUploadCallableDataSchema: z.ZodSchema<ResetUploadCallableData> = z.object({
    uploadId: z.string().trim().min(1),
});

export const ArchiveUploadCallableDataSchema: z.ZodSchema<ArchiveUploadCallableData> = z.object({
    uploadId: z.string().trim().min(1),
});

export const ReassignContentCallableDataSchema: z.ZodSchema<ReassignContentCallableData> = z.object({
    uploadId: z.string().trim().min(1),
});

export const PrepareForRegenerationCallableDataSchema: z.ZodSchema<PrepareForRegenerationCallableData> = z.object({
    uploadId: z.string().trim().min(1),
});

export const SuggestClassificationCallableDataSchema: z.ZodSchema<SuggestClassificationCallableData> = z.object({
    uploadId: z.string().trim().min(1),
});

export const PrepareBatchGenerationCallableDataSchema: z.ZodSchema<PrepareBatchGenerationCallableData> = z.object({
    uploadId: z.string().trim().min(1),
    totalMcqCount: z.number().int().min(0),
    totalFlashcardCount: z.number().int().min(0),
    batchSize: z.number().int().min(1),
    approvedTopic: z.string().trim().min(1),
    approvedChapter: z.string().trim().min(1),
});

export const StartAutomatedBatchGenerationCallableDataSchema: z.ZodSchema<StartAutomatedBatchGenerationCallableData> = z.object({
    uploadId: z.string().trim().min(1),
});

export const AutoAssignContentCallableDataSchema: z.ZodSchema<AutoAssignContentCallableData> = z.object({
    uploadId: z.string().trim().min(1),
    // CRITICAL FIX: existingTopics chapters can be string[] OR Chapter[]
    existingTopics: z.array(z.object({ // This should align with PediaquizTopicType
        id: z.string(),
        name: z.string(),
        source: z.union([z.literal('General'), z.literal('Marrow')]),
        chapterCount: z.number(),
        totalMcqCount: z.number(),
        totalFlashcardCount: z.number(),
        chapters: z.union([ // The chapters property can be one of two array types
            z.array(z.string()), // Array of strings for General topics
            z.array(z.object({ // Array of Chapter objects for Marrow topics
                id: z.string(),
                name: z.string(),
                mcqCount: z.number(),
                flashcardCount: z.number(),
                topicId: z.string(),
                source: z.union([z.literal('General'), z.literal('Marrow')]),
                topicName: z.string(),
                summaryNotes: z.string().nullable().optional(),
            }))
        ]),
    })),
    scopeToTopicName: z.string().trim().min(1).optional(),
});

export const UpdateChapterNotesCallableDataSchema: z.ZodSchema<UpdateChapterNotesCallableData> = z.object({
    topicId: z.string().trim().min(1),
    chapterId: z.string().trim().min(1),
    newSummary: z.string(),
    source: z.union([z.literal('General'), z.literal('Marrow')]),
});

export const GenerateChapterSummaryCallableDataSchema: z.ZodSchema<GenerateChapterSummaryCallableData> = z.object({
    uploadIds: z.array(z.string().trim().min(1)).min(1, "At least one upload ID is required."),
    topicId: z.string().trim().min(1).optional(), // Now optional as it's for saving
    chapterId: z.string().trim().min(1).optional(), // Now optional as it's for saving
    source: z.union([z.literal('General'), z.literal('Marrow')]).optional(), // Now optional as it's for saving
});

// AI-Powered User Feature Schemas
export const GenerateWeaknessBasedTestCallableDataSchema: z.ZodSchema<GenerateWeaknessBasedTestCallableData> = z.object({
    allMcqs: z.array(z.object({ // This now represents the minimized MCQ data sent from frontend
        id: z.string(),
        topicId: z.string(),
        chapterId: z.string(),
        source: McqSourceSchema.optional(),
        tags: z.array(z.string().trim().min(1)).optional(),
        difficulty: DifficultySchema.optional(),
    })).min(1, "At least one MCQ ID must be provided."),
    testSize: z.number().int().min(1),
});

export const GetDailyWarmupQuizCallableDataSchema: z.ZodSchema<GetDailyWarmupQuizCallableData> = z.object({});

export const GetExpandedSearchTermsCallableDataSchema: z.ZodSchema<GetExpandedSearchTermsCallableData> = z.object({
    query: z.string().trim().min(1),
});

export const GetHintCallableDataSchema: z.ZodSchema<GetHintCallableData> = z.object({
    mcqId: z.string().trim().min(1),
});

export const EvaluateFreeTextAnswerCallableDataSchema: z.ZodSchema<EvaluateFreeTextAnswerCallableData> = z.object({
    mcqId: z.string().trim().min(1),
    userAnswer: z.string().trim().min(1),
});

export const CreateFlashcardFromMcqCallableDataSchema: z.ZodSchema<CreateFlashcardFromMcqCallableData> = z.object({
    mcqId: z.string().trim().min(1),
});

export const CreateCustomTestCallableDataSchema: z.ZodSchema<CreateCustomTestCallableData> = z.object({
    title: z.string().trim().min(1),
    questions: z.array(z.string().trim().min(1)).min(1), // These are chapter IDs, not MCQ IDs
});

export const SearchContentCallableDataSchema: z.ZodSchema<SearchContentCallableData> = z.object({
    query: z.string().trim().min(1),
    terms: z.array(z.string().trim().min(1)).optional(),
});

export const ChatWithAssistantCallableDataSchema: z.ZodSchema<ChatWithAssistantCallableData> = z.object({
    prompt: z.string().trim().min(1),
    history: z.array(z.object({
        id: z.string(),
        text: z.string().trim().min(1),
        sender: z.union([z.literal('user'), z.literal('assistant')]),
        timestamp: z.date(),
    })),
    context: z.object({ // New optional context object
        mcqId: z.string().optional(),
        flashcardId: z.string().optional(),
        chapterId: z.string().optional(),
        chapterNotes: z.string().optional(),
    }).optional(),
});

export const GeneratePerformanceAdviceCallableDataSchema: z.ZodSchema<GeneratePerformanceAdviceCallableData> = z.object({
    overallAccuracy: z.number().min(0).max(100),
    strongTopics: z.array(z.string().trim().min(1)),
    weakTopics: z.array(z.string().trim().min(1)),
});

export const GetQuizSessionFeedbackCallableDataSchema: z.ZodSchema<GetQuizSessionFeedbackCallableData> = z.object({
    quizResultId: z.string().trim().min(1),
});


// Goals Schemas
export const SetGoalCallableDataSchema: z.ZodSchema<Omit<GoalInput, 'id' | 'userId' | 'createdAt' | 'updatedAt'>> = z.object({
    title: z.string().trim().min(1),
    targetDate: dateInputToDate,
    progress: z.number().min(0).max(100),
    type: z.union([z.literal('chapter'), z.literal('mcq_count'), z.literal('study_time'), z.literal('daily')]),
    targetValue: z.number().positive().optional(),
    currentValue: z.number().min(0).optional(),
    chapterId: z.string().trim().min(1).optional(),
    topicId: z.string().trim().min(1).optional(),
    isCompleted: z.boolean().optional(),
    reward: z.string().optional(),
});

export const UpdateGoalCallableDataSchema: z.ZodSchema<Partial<GoalInput> & { id: string }> = z.object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1).optional(),
    targetDate: dateInputToDate.optional(),
    progress: z.number().min(0).max(100).optional(),
    type: z.union([z.literal('chapter'), z.literal('mcq_count'), z.literal('study_time'), z.literal('daily')]).optional(),
    targetValue: z.number().positive().optional(),
    currentValue: z.number().min(0).optional(),
    chapterId: z.string().trim().min(1).optional(),
    topicId: z.string().trim().min(1).optional(),
    isCompleted: z.boolean().optional(),
    reward: z.string().optional(),
});

export const DeleteGoalCallableDataSchema: z.ZodSchema<{ goalId: string }> = z.object({
    goalId: z.string().trim().min(1),
});


// NEW: Schemas for new features
export const GetDailyGoalCallableDataSchema: z.ZodSchema<GetDailyGoalCallableData> = z.object({
    userId: z.string().trim().min(1),
});

export const GenerateQuickFireTestCallableDataSchema: z.ZodSchema<GenerateQuickFireTestCallableData> = z.object({
    testSize: z.number().int().min(1).max(50),
});

export const UpdateThemeCallableDataSchema: z.ZodSchema<UpdateThemeCallableData> = z.object({
    themeName: z.string().trim().min(1),
});

export const SendPushNotificationCallableDataSchema: z.ZodSchema<SendPushNotificationCallableData> = z.object({
    token: z.string().trim().min(1),
    title: z.string().trim().min(1),
    body: z.string().trim().min(1),
    data: z.record(z.string().trim().min(1)).optional(),
});

// NEW: GenerateCramSheetCallableDataSchema
export const GenerateCramSheetCallableDataSchema: z.ZodSchema<GenerateCramSheetCallableData> = z.object({
    chapterIds: z.array(z.string().trim().min(1)).optional(),
    topicIds: z.array(z.string().trim().min(1)).optional(),
    userId: z.string().trim().min(1), // Should ideally be implicit from context, but explicitly passed for validation clarity
    content: z.string().trim().min(10).optional(), // Raw content can be provided directly
    title: z.string().trim().min(1),
}).refine(data => (data.chapterIds && data.chapterIds.length > 0) || (data.topicIds && data.topicIds.length > 0) || (data.content && data.content.length > 0),
    "Either chapterIds, topicIds, or direct content must be provided for cram sheet generation.");


// NEW: GetDailyGrindPlaylistCallableDataSchema
export const GetDailyGrindPlaylistCallableDataSchema: z.ZodSchema<GetDailyGrindPlaylistCallableData> = z.object({
    userId: z.string().trim().min(1),
    mcqCount: z.number().int().min(0).max(50), // Max items to fetch
    flashcardCount: z.number().int().min(0).max(50), // Max items to fetch
});

// NEW: GetMockExamQuestionsCallableDataSchema
export const GetMockExamQuestionsCallableDataSchema: z.ZodSchema<GetMockExamQuestionsCallableData> = z.object({
    userId: z.string().trim().min(1),
    // CRITICAL FIX: Make topicIds and chapterIds optional in the Zod schema directly
    topicIds: z.array(z.string().trim().min(1)).optional(),
    chapterIds: z.array(z.string().trim().min(1)).optional(),
    questionCount: z.number().int().min(1).max(200), // Reasonable limit for a mock exam
}).refine(data => (data.topicIds && data.topicIds.length > 0) || (data.chapterIds && data.chapterIds.length > 0),
    "At least one topic or chapter must be selected for mock exam generation.");

// NEW: EvaluateDDxCallableDataSchema
export const EvaluateDDxCallableDataSchema: z.ZodSchema<EvaluateDDxCallableData> = z.object({
    clinicalFindings: z.string().trim().min(10, "Clinical findings must be at least 10 characters."),
    userAnswer: z.string().trim().min(3, "User answer must be at least 3 characters."),
});

// NEW: SuggestNewGoalCallableDataSchema
export const SuggestNewGoalCallableDataSchema: z.ZodSchema<SuggestNewGoalCallableData> = z.object({
    userId: z.string().trim().min(1),
    type: z.union([z.literal('chapter'), z.literal('mcq_count'), z.literal('study_time')]).optional(),
    accuracy: z.number().min(0).max(100).optional(),
    weakTopics: z.array(z.string().trim().min(1)).optional(),
});


// --- Validation Helper Function ---
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error("Zod validation error:", error.errors);
            const messages = error.errors.map((err: z.ZodIssue) => {
                if (err.path.length > 0 && err.path[0] === 'targetDate' && err.code === 'invalid_date') {
                    return `'${err.path.join('.')}' must be a valid date.`;
                }
                return `${err.path.join('.')} ${err.message}`;
            }).join('; ');

            throw new HttpsError(
                'invalid-argument',
                `Invalid input: ${messages}`
            );
        }
        console.error("An unexpected error occurred during validation:", error);
        throw new HttpsError('internal', 'An unexpected error occurred during input validation.');
    }
}