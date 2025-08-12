// FILE: functions/src/utils/validation.ts

import { z } from "zod";
import { HttpsError } from "firebase-functions/v2/https";

// --- Validation Schemas (as before) ---
export const AttemptSchema = z.object({
  mcqId: z.string().trim().min(1, "MCQ ID is required."),
  isCorrect: z.boolean(),
});
export const QuizResultSchema = z.object({
  results: z.array(z.object({
    mcqId: z.string().trim().min(1),
    isCorrect: z.boolean(),
    selectedAnswer: z.string().nullable(),
    correctAnswer: z.string(),
  })).min(1, "Quiz results cannot be empty."),
  score: z.number().int(),
  totalQuestions: z.number().int().positive("Total questions must be a positive number."),
  source: z.string().trim().min(1),
  chapterId: z.string().optional(),
});
export const ToggleBookmarkSchema = z.object({
  contentId: z.string().trim().min(1),
  contentType: z.enum(['mcq', 'flashcard']),
});
export const DeleteContentSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(['mcq', 'flashcard']),
  collectionName: z.enum(['MasterMCQ', 'MarrowMCQ', 'Flashcards']),
});
export const FlashcardAttemptSchema = z.object({
  flashcardId: z.string().trim().min(1, "Flashcard ID is required."),
  rating: z.enum(['again', 'good', 'easy']),
});
export const ProcessMarrowTextSchema = z.object({
    rawText: z.string().trim().min(10, "Raw text must be at least 10 characters."),
    fileName: z.string().trim().min(1, "File name is required."),
});

// --- Validation Helper ---
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    // --- DEFINITIVE FIX: Handle 'unknown' type correctly ---
    if (error instanceof z.ZodError) {
      console.error("Zod validation error:", error.errors);
      const messages = error.errors.map((err: z.ZodIssue) => `${err.path.join('.')} ${err.message}`).join('; ');
      
      throw new HttpsError(
        'invalid-argument', 
        `Invalid input: ${messages}`
      );
    }
    console.error("An unexpected error occurred during validation:", error);
    throw new HttpsError('internal', 'An unexpected error occurred during input validation.');
  }
}