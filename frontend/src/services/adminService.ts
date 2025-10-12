import { createApiCaller } from '@/utils/apiClient';
import type { AwaitingReviewData, GenerateAndAnalyzeMarrowContentCallableData } from '@pediaquiz/types';

/**
 * Fetches the content of a completed generation job for final review.
 */
export const getGeneratedContentForReview = createApiCaller<{ jobId: string }, AwaitingReviewData>('getGeneratedContentForReview');

/**
 * Initiates content generation from manually corrected OCR text.
 */
export const generateContentFromText = createApiCaller<{ jobId: string; text: string; mcqCount: number; flashcardCount: number }, { success: boolean }>('generateContentFromText');

/**
 * Triggers the AI to extract existing MCQs and orphan explanations from Marrow text.
 */
export const extractMarrowContent = createApiCaller<{ uploadId: string }, { success: boolean; message: string }>('extractMarrowContent');

/**
 * Triggers the AI to generate new MCQs from orphan explanations and analyze the topic/chapter.
 */
export const generateAndAnalyzeMarrowContent = createApiCaller<GenerateAndAnalyzeMarrowContentCallableData, { success: boolean; message: string }>('generateAndAnalyzeMarrowContent');