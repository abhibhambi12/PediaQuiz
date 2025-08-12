// --- CORRECTED FILE: workspaces/frontend/src/services/aiService.ts ---

import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { functions } from '@/firebase';
import type { ChatMessage, MCQ, PediaquizTopicType } from '@pediaquiz/types'; // PediaquizTopicType might be needed for autoAssignContent

// Callable Function references (prefixed with _ for internal use)
const _chatWithAssistant = httpsCallable<{ prompt: string, history: ChatMessage[] }, { response: string }>(functions, 'chatWithAssistant');
const _generatePerformanceAdvice = httpsCallable< { overallAccuracy: number, strongTopics: string[], weakTopics: string[] }, { advice: string } >(functions, 'generatePerformanceAdvice');
const _generateWeaknessBasedTest = httpsCallable< { allMcqs: Pick<MCQ, 'id'>[], testSize: number }, { mcqIds: string[] } >(functions, 'generateWeaknessBasedTest');
const _updateChapterNotes = httpsCallable< { topicId: string, chapterId: string, newSummary: string, source: 'General' | 'Marrow' }, { success: boolean } >(functions, 'updateChapterNotes');
const _processManualTextInput = httpsCallable< { fileName: string, rawText: string, isMarrow: boolean }, { success: boolean, uploadId: string, extractedMcqs: Partial<MCQ>[], suggestedNewMcqCount: number } >(functions, 'processManualTextInput');

// --- NEW FEATURE CALLABLE REFERENCES ---
const _getDailyWarmupQuiz = httpsCallable< never, { mcqIds: string[] } >(functions, 'getDailyWarmupQuiz');
const _getQuizSessionFeedback = httpsCallable< { quizResultId: string }, { feedback: string } >(functions, 'getQuizSessionFeedback');
const _getExpandedSearchTerms = httpsCallable< { query: string }, { terms: string[] } >(functions, 'getExpandedSearchTerms');
const _processMarrowText = httpsCallable< { rawText: string, fileName: string }, { uploadId: string, extractedMcqs: Partial<MCQ>[], suggestedNewMcqCount: number } >(functions, 'processMarrowText');
const _generateAndStageMarrowMcqs = httpsCallable< { uploadId: string, count: number }, { success: boolean } >(functions, 'generateAndStageMarrowMcqs'); // Used by AdminReviewPage
const _generateChapterSummary = httpsCallable< { uploadIds: string[] }, { summary: string } >(functions, 'generateChapterSummary');
const _addFlashcardAttempt = httpsCallable< { flashcardId: string, rating: 'again' | 'good' | 'easy' }, { success: boolean } >(functions, 'addFlashcardAttempt');
const _generateGeneralContent = httpsCallable<{ uploadId: string, count: number }, { success: boolean }>(functions, 'generateGeneralContent'); // Used by AdminUploadCard
const _autoAssignContent = httpsCallable<{ uploadId: string, existingTopics: PediaquizTopicType[], scopeToTopicName?: string }, { success: boolean, suggestions: any[] }>(functions, 'autoAssignContent'); // Used by AdminReviewPage, ensure type for suggestions

// Exported functions for frontend components to use
export const chatWithAssistant = async (data: { prompt: string, history: ChatMessage[] }): Promise<HttpsCallableResult<{ response: string }>> => {
    return _chatWithAssistant(data);
};

export const generatePerformanceAdvice = async (data: { overallAccuracy: number, strongTopics: string[], weakTopics: string[] }): Promise<HttpsCallableResult<{ advice: string }>> => {
    return _generatePerformanceAdvice(data);
};

export const generateWeaknessBasedTest = async (data: { allMcqs: Pick<MCQ, 'id'>[], testSize: number }): Promise<HttpsCallableResult<{ mcqIds: string[] }>> => {
    return _generateWeaknessBasedTest(data);
};

export const updateChapterNotes = async (data: { topicId: string, chapterId: string, newSummary: string, source: 'General' | 'Marrow' }): Promise<HttpsCallableResult<{ success: boolean }>> => {
    return _updateChapterNotes(data);
};

export const processManualTextInput = async (data: { fileName: string, rawText: string, isMarrow: boolean }): Promise<HttpsCallableResult<{ success: boolean, uploadId: string, extractedMcqs: Partial<MCQ>[], suggestedNewMcqCount: number }>> => {
    return await _processManualTextInput(data);
};

// --- NEW FEATURE EXPORTS ---

export const getDailyWarmupQuiz = async (): Promise<HttpsCallableResult<{ mcqIds: string[] }>> => {
    return await _getDailyWarmupQuiz();
};

export const getQuizSessionFeedback = async (data: { quizResultId: string }): Promise<HttpsCallableResult<{ feedback: string }>> => {
    return await _getQuizSessionFeedback(data);
};

export const getExpandedSearchTerms = async (data: { query: string }): Promise<HttpsCallableResult<{ terms: string[] }>> => {
    return await _getExpandedSearchTerms(data);
};

export const processMarrowText = async (data: { rawText: string, fileName: string }): Promise<HttpsCallableResult<{ uploadId: string, extractedMcqs: Partial<MCQ>[], suggestedNewMcqCount: number }>> => {
    return await _processMarrowText(data);
};

export const generateAndStageMarrowMcqs = async (data: { uploadId: string, count: number }): Promise<HttpsCallableResult<{ success: boolean }>> => {
    return await _generateAndStageMarrowMcqs(data);
};

export const generateGeneralContent = async (data: { uploadId: string, count: number }): Promise<HttpsCallableResult<{ success: boolean }>> => {
    return await _generateGeneralContent(data);
};

export const generateChapterSummary = async (data: { uploadIds: string[] }): Promise<HttpsCallableResult<{ summary: string }>> => {
    return await _generateChapterSummary(data);
};

export const addFlashcardAttempt = async (data: { flashcardId: string, rating: 'again' | 'good' | 'easy' }): Promise<HttpsCallableResult<{ success: boolean }>> => {
    return await _addFlashcardAttempt(data);
};

// Ensure autoAssignContent is also exported if used by frontend.
export const autoAssignContent = async (data: { uploadId: string, existingTopics: PediaquizTopicType[], scopeToTopicName?: string }): Promise<HttpsCallableResult<{ success: boolean, suggestions: any[] }>> => {
    return await _autoAssignContent(data);
};