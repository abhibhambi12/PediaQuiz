import { z } from 'zod'; // Zod is now a dependency for functions/package.json
import { Timestamp } from 'firebase/firestore'; // Ensure Timestamp is imported from firebase/firestore
import type {
  ToggleBookmarkCallableData,
  DeleteContentItemCallableData,
  QuizResult,
  ConfidenceRating,
  AddAttemptCallableData
} from '@pediaquiz/types';

// Define QuizSession interface as it's used in MCQSessionPage, needs to be globally available somehow
// (Could be moved to @pediaquiz/types if it was truly shared, but for now defining it here for typesafety)
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


export const ConfidenceRatingSchema = z.union([
  z.literal("again"),
  z.literal("hard"),
  z.literal("good"),
  z.literal("easy"),
]);

export const QuizResultMcqAttemptSchema = z.object({
  mcqId: z.string().min(1),
  selectedAnswer: z.string().nullable(),
  isCorrect: z.boolean(),
  correctAnswer: z.string(), // This is the .answer field from the MCQ type
});

// Zod schema for QuizResult, aligning with the updated QuizResult interface from shared types
export const QuizResultSchema: z.ZodType<QuizResult> = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  sessionId: z.string().min(1), // Added to schema
  mode: z.union([
    z.literal("quiz"),
    z.literal("practice"),
    z.literal("custom"),
    z.literal("weakness"),
    z.literal("incorrect"),
    z.literal("review_due"),
    z.literal("warmup"),
    z.literal("mock"), // Ensure 'mock' is included if supported
  ]),
  // Use z.preprocess to handle Firebase Timestamps which come back as objects, or Dates
  quizDate: z.preprocess((arg) => {
    if (arg instanceof Timestamp) return arg.toDate();
    if (arg instanceof Date) return arg;
    return arg; // Let Zod handle other types, e.g., string from JSON
  }, z.instanceof(Date)),
  totalQuestions: z.number().int().positive(),
  score: z.number().int().min(0),
  durationSeconds: z.number().int().min(0).optional(), // Optional per type definition
  topicIds: z.array(z.string()).optional(), // Optional per type definition
  chapterIds: z.array(z.string()).optional(), // Optional per type definition
  mcqAttempts: z.array(QuizResultMcqAttemptSchema),
});

export const AddAttemptCallableDataSchema = z.object({
  mcqId: z.string().min(1),
  selectedAnswer: z.string().nullable(),
  isCorrect: z.boolean(),
  sessionId: z.string().min(1),
  confidenceRating: ConfidenceRatingSchema.optional(), // Optional based on type
});