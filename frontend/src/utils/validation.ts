// FILE: functions/src/utils/validation.ts
// NEW FILE: Provides Zod schemas and a helper function for backend input validation.

import { z } from "zod";
import { HttpsError } from "firebase-functions/v2/https";
import type { ToggleBookmarkCallableData, DeleteContentItemCallableData, QuizResult } from "@pediaquiz/types";

// --- Validation Schemas ---

// Schema for data sent to `addattempt` function
export const AttemptSchema = z.object({
  mcqId: z.string().trim().min(1, "MCQ ID is required."),
  isCorrect: z.boolean(),
});

// Schema for data sent to `addquizresult` function
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

// Schema for data sent to `togglebookmark` function
export const ToggleBookmarkSchema = z.object({
  contentId: z.string().trim().min(1),
  contentType: z.enum(['mcq', 'flashcard']),
});

// Schema for data sent to `deletecontentitem` function
export const DeleteContentSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(['mcq', 'flashcard']),
  collectionName: z.enum(['MasterMCQ', 'MarrowMCQ', 'Flashcards']),
});

// Schema for data sent to `addFlashcardAttempt` function
export const FlashcardAttemptSchema = z.object({
  flashcardId: z.string().trim().min(1, "Flashcard ID is required."),
  rating: z.enum(['again', 'good', 'easy']),
});

// --- Validation Helper ---

/**
 * Parses and validates unknown data against a Zod schema.
 * Throws a specific HttpsError on failure, which is sent to the client.
 * @param schema The Zod schema to validate against.
 * @param data The unknown data from the request.
 * @returns The parsed and typed data.
 */
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Zod validation error:", error.errors);
      const messages = error.errors.map(err => `${err.path.join('.')} ${err.message}`).join('; ');
      
      throw new HttpsError(
        'invalid-argument', 
        `Invalid input: ${messages}`
      );
    }
    console.error("An unexpected error occurred during validation:", error);
    throw new HttpsError('internal', 'An unexpected error occurred during input validation.');
  }
}