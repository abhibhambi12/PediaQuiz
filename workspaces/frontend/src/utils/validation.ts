import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import type {
  ToggleBookmarkCallableData,
  DeleteContentItemCallableData,
  QuizResult,
  ConfidenceRating,
  AddAttemptCallableData
} from '@pediaquiz/types';

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
  correctAnswer: z.string(),
});

export const QuizResultSchema: z.ZodType<QuizResult> = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  mode: z.union([z.literal("quiz"), z.literal("test"), z.literal("practice"), z.literal("custom"), z.literal("weakness"), z.literal("incorrect"), z.literal("review_due"), z.literal("warmup"), z.literal("mock")]),
  quizDate: z.instanceof(Date),
  totalQuestions: z.number().int().positive(),
  score: z.number().int().min(0),
  durationSeconds: z.number().int().min(0),
  topicIds: z.array(z.string()).optional(),
  chapterIds: z.array(z.string()).optional(),
  mcqAttempts: z.array(QuizResultMcqAttemptSchema),
});

export const AddAttemptCallableDataSchema = z.object({
  mcqId: z.string().min(1),
  selectedAnswer: z.string().nullable(),
  isCorrect: z.boolean(),
  sessionId: z.string().min(1),
  confidenceRating: ConfidenceRatingSchema,
});