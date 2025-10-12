import { Timestamp } from "firebase-admin/firestore";
import type { ConfidenceRating } from "@pediaquiz/types";

// --- BATCH 1: SPACED REPETITION FOUNDATION ---
// This new file introduces a more effective, research-backed learning algorithm.
// It implements a simplified version of the SM-2 algorithm to calculate the
// optimal next review date for a piece of content, enhancing long-term retention.
// It resolves the "Cannot find module" error by creating this file.
// The unused type imports have been removed to fix the linter warnings.

interface SpacedRepetitionInput {
    isCorrect?: boolean; // For MCQs
    rating?: ConfidenceRating; // For Flashcards
    lastInterval: number;
    lastEaseFactor: number;
    lastRepetitions: number;
}

interface SpacedRepetitionOutput {
    interval: number;
    easeFactor: number;
    repetitions: number;
    nextReviewDate: Timestamp;
}

/**
 * Calculates the next review interval based on a simplified SM-2 algorithm.
 * @param input - The performance on the last review and the item's current state.
 * @returns The new state including the next interval and review date.
 */
export function calculateNextReview(input: SpacedRepetitionInput): SpacedRepetitionOutput {
    let { isCorrect, rating, lastInterval, lastEaseFactor, lastRepetitions } = input;

    // The "quality" of the response, on a scale of 0-5.
    let quality: number;

    if (isCorrect !== undefined) { // Handling MCQ attempt
        quality = isCorrect ? 5 : 0;
    } else if (rating) { // Handling Flashcard attempt
        switch (rating) {
            case 'easy': quality = 5; break;
            case 'good': quality = 4; break;
            case 'hard': quality = 2; break;
            case 'again': 
            default: quality = 0; break;
        }
    } else {
        quality = 0; // Default to incorrect if no data provided
    }

    // If the quality is less than 3, reset the repetition schedule.
    if (quality < 3) {
        lastRepetitions = 0;
        lastInterval = 1;
    } else {
        lastRepetitions++;
        if (lastRepetitions === 1) {
            lastInterval = 1;
        } else if (lastRepetitions === 2) {
            lastInterval = 6;
        } else {
            lastInterval = Math.round(lastInterval * lastEaseFactor);
        }
    }
    
    // Update the ease factor based on performance.
    lastEaseFactor += (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

    // The ease factor should not fall below a minimum threshold.
    if (lastEaseFactor < 1.3) {
        lastEaseFactor = 1.3;
    }

    // Calculate the next review date by adding the interval (in days).
    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + lastInterval);

    return {
        interval: lastInterval,
        easeFactor: lastEaseFactor,
        repetitions: lastRepetitions,
        nextReviewDate: Timestamp.fromDate(nextReviewDate),
    };
}