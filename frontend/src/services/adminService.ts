import { createApiCaller } from '@/utils/apiClient';
import type { AwaitingReviewData } from '@pediaquiz/types';

/**
 * Fetches the content of a completed generation job for final review.
 */
export const getGeneratedContentForReview = createApiCaller<{ jobId: string }, AwaitingReviewData>('getGeneratedContentForReview');

/**
 * Initiates content generation from manually corrected OCR text.
 */
export const generateContentFromText = createApiCaller<{ jobId: string; text: string; mcqCount: number; flashcardCount: number }, { success: boolean }>('generateContentFromText');