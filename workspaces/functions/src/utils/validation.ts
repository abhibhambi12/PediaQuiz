// workspaces/functions/src/utils/validation.ts
import { z } from "zod";
import { HttpsError } from "firebase-functions/v2/https";
import type { QuizResult } from "@pediaquiz/types";
// FIX: Removed unused Timestamp import. It's not used in Zod schemas.
// import { Timestamp } from 'firebase/firestore'; 

// Schemas for data passed TO callable functions
export const AddAttemptCallableDataSchema = z.object({
  mcqId: z.string().trim().min(1, "MCQ ID is required."),
  selectedAnswer: z.string().nullable(),
  isCorrect: z.boolean(),
  sessionId: z.string().trim().min(1),
  confidenceRating: z.union([z.literal("again"), z.literal("hard"), z.literal("good"), z.literal("easy")]),
});

export const QuizResultMcqAttemptSchema = z.object({
  mcqId: z.string().min(1),
  selectedAnswer: z.string().nullable(),
  isCorrect: z.boolean(),
  correctAnswer: z.string(),
});

// Use this for validation of quiz results received by the callable function
// FIX: Ensure BaseQuizResultSchema correctly reflects Omit<QuizResult, ...> from types.
// The previous definition was correct, but adding a note here to highlight its purpose.
export const BaseQuizResultSchema: z.ZodType<Omit<QuizResult, 'id' | 'userId' | 'quizDate'>> = z.object({
  sessionId: z.string().min(1),
  mode: z.string().min(1),
  totalQuestions: z.number().int().positive(),
  score: z.number().int().min(0),
  durationSeconds: z.number().int().min(0),
  topicIds: z.array(z.string()).optional(),
  chapterIds: z.array(z.string()).optional(),
  mcqAttempts: z.array(QuizResultMcqAttemptSchema),
});

export const ToggleBookmarkSchema = z.object({
  contentId: z.string().trim().min(1),
  contentType: z.enum(['mcq', 'flashcard']),
  action: z.enum(['add', 'remove']),
});

export const DeleteContentSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(['mcq', 'flashcard']),
  collectionName: z.enum(['MasterMCQ', 'MarrowMCQ', 'Flashcards']),
});

export const AddFlashcardAttemptCallableDataSchema = z.object({
  flashcardId: z.string().trim().min(1, "Flashcard ID is required."),
  rating: z.union([z.literal("again"), z.literal("hard"), z.literal("good"), z.literal("easy")]),
});

export const ProcessManualTextInputSchema = z.object({
    rawText: z.string().trim().min(10, "Raw text must be at least 10 characters."),
    fileName: z.string().trim().min(1, "File name is required."),
    isMarrow: z.boolean(),
});

export const PlanContentGenerationSchema = z.object({
  jobId: z.string().min(1),
});

export const ExecuteContentGenerationSchema = z.object({
  jobId: z.string().min(1),
  mcqCount: z.number().int().min(0),
  flashcardCount: z.number().int().min(0),
  // FIX: Added optional to startBatch to correctly reflect the type
  startBatch: z.number().int().min(0).optional(),
});

const McqPartialSchema = z.object({
    question: z.string().min(1),
    options: z.array(z.string()).min(1),
    correctAnswer: z.string().min(1),
    explanation: z.string().optional(),
    tags: z.array(z.string()).optional(),
});

const FlashcardPartialSchema = z.object({
    front: z.string().min(1),
    back: z.string().min(1),
    tags: z.array(z.string()).optional(),
});

export const ApproveGeneratedContentSchema = z.object({
  jobId: z.string().min(1),
  topicId: z.string().min(1),
  topicName: z.string().min(1),
  chapterId: z.string().min(1),
  chapterName: z.string().min(1),
  keyTopics: z.array(z.string()).optional(),
  summaryNotes: z.string().optional(),
  generatedMcqs: z.array(McqPartialSchema).optional(),
  generatedFlashcards: z.array(FlashcardPartialSchema).optional(),
  pipeline: z.enum(['general', 'marrow']),
});

const ChapterSchemaForValidation = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const TopicSchemaForValidation = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  chapters: z.array(ChapterSchemaForValidation),
});

export const SuggestAssignmentCallableDataSchema = z.object({
  jobId: z.string().min(1),
  existingTopics: z.array(TopicSchemaForValidation),
  scopeToTopicName: z.string().optional(),
});

export const GenerateChapterSummaryCallableDataSchema = z.object({
  uploadIds: z.array(z.string()).min(1),
});

// Updated schema: userId is no longer part of the data payload, it's derived from auth.
export const GetDailyWarmupQuizCallableDataSchema = z.object({
  count: z.number().int().positive(),
});

export const GenerateWeaknessBasedTestSchema = z.object({
  testSize: z.number().int().min(5).max(50),
});

export const GetExpandedSearchTermsCallableDataSchema = z.object({
  query: z.string().min(1),
});

export const GetHintCallableDataSchema = z.object({
  mcqId: z.string().min(1),
});

export const EvaluateFreeTextAnswerCallableDataSchema = z.object({
  mcqId: z.string().min(1),
  userAnswer: z.string().min(1),
});

export const CreateFlashcardFromMcqCallableDataSchema = z.object({
  mcqId: z.string().min(1),
});

export const UpdateChapterNotesCallableDataSchema = z.object({
  topicId: z.string().min(1),
  chapterId: z.string().min(1),
  newSummary: z.string(),
  source: z.union([z.literal('General'), z.literal('Marrow')]),
});

// New schema for content generation functions that stage content
export const GenerateStagedContentSchema = z.object({
  uploadId: z.string().min(1),
  count: z.number().int().positive(),
});


// Utility function for validation
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`).join('; ');
      throw new HttpsError(
        'invalid-argument', 
        `Invalid input: ${messages}`
      );
    }
    // FIX: Properly narrow the 'error' type for safety and remove TS18046
    if (error instanceof Error) {
      throw new HttpsError('internal', `An unexpected validation error occurred: ${error.message}`);
    }
    throw new HttpsError('internal', 'An unknown error occurred during input validation.');
  }
}