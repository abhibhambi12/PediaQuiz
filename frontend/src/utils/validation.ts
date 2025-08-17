// This file contains Zod schemas, which are primarily intended for data validation
// within Firebase Cloud Functions. If frontend-specific validation is needed,
// consider using a library like Yup or Zod directly within frontend components,
// or refactoring these schemas to be shared if universally required.

import { z } from 'zod'; // Zod is now a dependency for functions/package.json
import { Timestamp } from 'firebase/firestore'; // Ensure Timestamp is imported from firebase/firestore
import type {
  ToggleBookmarkCallableData,
  DeleteContentItemCallableData,
  QuizResult,
  ConfidenceRating,
  AddAttemptCallableData,
  AddFlashcardAttemptCallableData,
  GenerateWeaknessBasedTestCallableData,
  GetDailyWarmupQuizCallableData,
  PlanContentGenerationCallableData,
  ApproveGeneratedContentCallableData,
  SuggestAssignmentCallableData,
  EvaluateFreeTextAnswerCallableData,
  GetHintCallableData,
  CreateFlashcardFromMcqCallableData,
  GetExpandedSearchTermsCallableData,
  UpdateChapterNotesCallableData,
  GenerateChapterSummaryCallableData
} from '@pediaquiz/types';

// Define QuizSession interface as it's used in MCQSessionPage, needs to be globally available somehow
// (Could be moved to @pediaquiz/types if it was truly shared, but for now defining it here for typesafety)
// NOTE: This interface definition should ideally be removed from here and imported from '@pediaquiz/types'
// as indicated by other imports in this file and usage elsewhere.
export interface QuizSession {
  id: string;
  userId: string;
  mode: 'practice' | 'quiz' | 'custom' | 'weakness' | 'incorrect' | 'mock' | 'review_due' | 'warmup';
  mcqIds: string[];
  currentIndex: number;
  answers: Record<number, string | null>;
  markedForReview: number[];
  isFinished: boolean;
  createdAt: Date;
  expiresAt: Date;
}


// Schema for confidence ratings, used in attempts.
export const ConfidenceRatingSchema = z.union([
  z.literal("again"),
  z.literal("hard"),
  z.literal("good"),
  z.literal("easy"),
]);

// Schema for a single MCQ attempt within a quiz result.
export const QuizResultMcqAttemptSchema = z.object({
  mcqId: z.string().min(1),
  selectedAnswer: z.string().nullable(),
  isCorrect: z.boolean(),
  correctAnswer: z.string(), // This is the .answer field from the MCQ type
});

// Zod schema for QuizResult, aligning with the updated QuizResult interface from shared types.
// Uses z.preprocess to handle Firebase Timestamps which are deserialized as objects or Date instances.
export const QuizResultSchema: z.ZodType<QuizResult> = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  sessionId: z.string().min(1), // Added to schema based on common usage
  mode: z.union([
    z.literal("quiz"),
    z.literal("practice"),
    z.literal("custom"),
    z.literal("weakness"),
    z.literal("incorrect"),
    z.literal("review_due"),
    z.literal("warmup"),
    z.literal("mock"), // Ensure 'mock' is included if supported by the application
  ]),
  quizDate: z.preprocess((arg) => {
    // Convert Firestore Timestamp or Date objects to Date
    if (arg instanceof Timestamp) return arg.toDate();
    if (arg instanceof Date) return arg;
    // If it's neither, attempt to parse as string or return as is; Zod will validate it's a Date later.
    // A stricter approach might throw if input is unexpected.
    return arg;
  }, z.instanceof(Date)), // Validate that the result is a Date object
  totalQuestions: z.number().int().positive(),
  score: z.number().int().min(0),
  durationSeconds: z.number().int().min(0).optional(), // Optional field
  topicIds: z.array(z.string()).optional(), // Optional field
  chapterIds: z.array(z.string()).optional(), // Optional field
  mcqAttempts: z.array(QuizResultMcqAttemptSchema),
});

// Zod schema for data passed to the 'addAttempt' callable function.
export const AddAttemptCallableDataSchema = z.object({
  mcqId: z.string().min(1),
  selectedAnswer: z.string().nullable(),
  isCorrect: z.boolean(),
  sessionId: z.string().min(1),
  confidenceRating: ConfidenceRatingSchema.optional(), // Confidence rating is optional
});

// Zod schema for data passed to the 'addFlashcardAttempt' callable function.
export const AddFlashcardAttemptCallableDataSchema: z.ZodType<AddFlashcardAttemptCallableData> = z.object({
  flashcardId: z.string().min(1),
  rating: ConfidenceRatingSchema,
});

// Zod schema for data passed to the 'toggleBookmark' callable function.
export const ToggleBookmarkCallableDataSchema: z.ZodType<ToggleBookmarkCallableData> = z.object({
  contentId: z.string().min(1),
  contentType: z.enum(['mcq', 'flashcard']),
  action: z.enum(['add', 'remove']),
});

// Zod schema for data passed to the 'deleteContentItem' callable function.
export const DeleteContentItemCallableDataSchema: z.ZodType<DeleteContentItemCallableData> = z.object({
  id: z.string().min(1),
  type: z.enum(['mcq', 'flashcard']),
  collectionName: z.enum(['MasterMCQ', 'MarrowMCQ', 'Flashcards']),
});

// Zod schema for data passed to the 'generateWeaknessBasedTest' callable function.
export const GenerateWeaknessBasedTestCallableDataSchema: z.ZodType<GenerateWeaknessBasedTestCallableData> = z.object({
  userId: z.string().min(1),
  topics: z.array(z.string()).optional(),
  chapters: z.array(z.string()).optional(),
  numQuestions: z.number().int().positive().optional(),
});

// Zod schema for data passed to the 'getDailyWarmupQuiz' callable function.
export const GetDailyWarmupQuizCallableDataSchema: z.ZodType<GetDailyWarmupQuizCallableData> = z.object({
  userId: z.string().min(1),
});

// Zod schema for data passed to the 'planContentGeneration' callable function.
export const PlanContentGenerationCallableDataSchema: z.ZodType<PlanContentGenerationCallableData> = z.object({
  subject: z.string().min(1),
  topic: z.string().min(1),
  chapter: z.string().min(1),
  numMcqs: z.number().int().min(0),
  numFlashcards: z.number().int().min(0),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  notes: z.string().optional(),
});

// Zod schema for data passed to the 'approveGeneratedContent' callable function.
export const ApproveGeneratedContentCallableDataSchema: z.ZodType<ApproveGeneratedContentCallableData> = z.object({
  contentId: z.string().min(1),
  contentType: z.enum(['mcq', 'flashcard']),
  approved: z.boolean(),
});

// Zod schema for data passed to the 'suggestAssignment' callable function.
export const SuggestAssignmentCallableDataSchema: z.ZodType<SuggestAssignmentCallableData> = z.object({
  userId: z.string().min(1),
  // Add other relevant fields if the type definition includes them
});

// Zod schema for data passed to the 'evaluateFreeTextAnswer' callable function.
export const EvaluateFreeTextAnswerCallableDataSchema: z.ZodType<EvaluateFreeTextAnswerCallableData> = z.object({
  questionId: z.string().min(1),
  userAnswer: z.string().min(1),
  expectedAnswer: z.string().min(1), // Assuming this is needed for evaluation
});

// Zod schema for data passed to the 'getHint' callable function.
export const GetHintCallableDataSchema: z.ZodType<GetHintCallableData> = z.object({
  mcqId: z.string().min(1),
  // Add other relevant context fields if the type definition includes them
});

// Zod schema for data passed to the 'createFlashcardFromMcq' callable function.
export const CreateFlashcardFromMcqCallableDataSchema: z.ZodType<CreateFlashcardFromMcqCallableData> = z.object({
  mcqId: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
  topicId: z.string().optional(),
  chapterId: z.string().optional(),
});

// Zod schema for data passed to the 'getExpandedSearchTerms' callable function.
export const GetExpandedSearchTermsCallableDataSchema: z.ZodType<GetExpandedSearchTermsCallableData> = z.object({
  searchTerm: z.string().min(1),
});

// Zod schema for data passed to the 'updateChapterNotes' callable function.
export const UpdateChapterNotesCallableDataSchema: z.ZodType<UpdateChapterNotesCallableData> = z.object({
  chapterId: z.string().min(1),
  notes: z.string(),
});

// Zod schema for data passed to the 'generateChapterSummary' callable function.
export const GenerateChapterSummaryCallableDataSchema: z.ZodType<GenerateChapterSummaryCallableData> = z.object({
  chapterId: z.string().min(1),
  // Add other relevant parameters like length, detail level if the type definition includes them
});