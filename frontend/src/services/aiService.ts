// FILE: frontend/src/services/aiService.ts

import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { functions } from '@/firebase';
import type { AttemptedMCQs, ChatMessage, MCQ, QuizResult } from '@pediaquiz/types'; // FIXED: Ensure types are imported

const _chatWithAssistant = httpsCallable<{ prompt: string, history: ChatMessage[] }, { response: string }>(functions, 'chatWithAssistant');
const _generatePerformanceAdvice = httpsCallable<{ overallAccuracy: number, strongTopics: string[], weakTopics: string[] }, { advice: string }>(functions, 'generatePerformanceAdvice');
const _generateWeaknessBasedTest = httpsCallable<{ attempted: AttemptedMCQs, allMcqs: Pick<MCQ, 'id' | 'topicId' | 'chapterId' | 'source' | 'tags'>[], testSize: number }, { mcqIds: string[] }>(functions, 'generateWeaknessBasedTest');
const _updateChapterNotes = httpsCallable<{ topicId: string, chapterId: string, newSummary: string, source: 'General' | 'Marrow' }, { success: boolean; message: string }>(functions, 'updateChapterNotes');

// --- NEW FUNCTION REFERENCES (from original working code if they existed, or new features) ---
const _getDailyWarmupQuiz = httpsCallable<never, { mcqIds: string[] }>(functions, 'getDailyWarmupQuiz');
const _getQuizSessionFeedback = httpsCallable<{ quizResultId: string }, { feedback: string }>(functions, 'getQuizSessionFeedback');
const _getExpandedSearchTerms = httpsCallable<{ query: string }, { terms: string[] }>(functions, 'getExpandedSearchTerms');
// Assuming these are new features that need callable functions, matching the AdminMarrowPage/FlashcardSessionPage additions
const _processMarrowText = httpsCallable<{ rawText: string, fileName: string }, { uploadId: string, extractedMcqs: Partial<MCQ>[], suggestedNewMcqCount: number }>(functions, 'processMarrowText'); // NEW FEATURE
const _generateAndStageMarrowMcqs = httpsCallable<{ uploadId: string, count: number }, { success: boolean }>(functions, 'generateAndStageMarrowMcqs'); // Already in working code
const _addFlashcardAttempt = httpsCallable<{ flashcardId: string, rating: 'again' | 'good' | 'easy' }, { success: boolean }>(functions, 'addFlashcardAttempt'); // NEW FEATURE


export const chatWithAssistant = async (data: { prompt: string, history: ChatMessage[] }): Promise<HttpsCallableResult<{ response: string }>> => {
    return _chatWithAssistant(data);
};

export const generatePerformanceAdvice = async (data: { overallAccuracy: number, strongTopics: string[], weakTopics: string[] }): Promise<HttpsCallableResult<{ advice: string }>> => {
    return _generatePerformanceAdvice(data);
};

export const generateWeaknessBasedTest = async (data: { attempted: AttemptedMCQs, allMcqs: Pick<MCQ, 'id' | 'topicId' | 'chapterId' | 'source' | 'tags'>[], testSize: number }): Promise<HttpsCallableResult<{ mcqIds: string[] }>> => {
    return _generateWeaknessBasedTest(data);
};

export const updateChapterNotes = async (data: { topicId: string, chapterId: string, newSummary: string, source: 'General' | 'Marrow' }): Promise<HttpsCallableResult<{ success: boolean; message: string }>> => {
    return _updateChapterNotes(data);
};

// --- NEW EXPORTS (from original working code if they existed, or new features) ---
export const getDailyWarmupQuiz = async (): Promise<HttpsCallableResult<{ mcqIds: string[] }>> => {
    return await _getDailyWarmupQuiz();
};

export const getQuizSessionFeedback = async (data: { quizResultId: string }): Promise<HttpsCallableResult<{ feedback: string }>> => {
    return await _getQuizSessionFeedback(data);
};

export const getExpandedSearchTerms = async (data: { query: string }): Promise<HttpsCallableResult<{ terms: string[] }>> => {
    return await _getExpandedSearchTerms(data);
};

// --- NEW FEATURE EXPORTS ---
export const processMarrowText = async (data: { rawText: string, fileName: string }): Promise<HttpsCallableResult<{ uploadId: string, extractedMcqs: Partial<MCQ>[], suggestedNewMcqCount: number }>> => {
    return await _processMarrowText(data);
};

export const generateAndStageMarrowMcqs = async (data: { uploadId: string, count: number }): Promise<HttpsCallableResult<{ success: boolean }>> => {
    return await _generateAndStageMarrowMcqs(data);
};

export const addFlashcardAttempt = async (data: { flashcardId: string, rating: 'again' | 'good' | 'easy' }): Promise<HttpsCallableResult<{ success: boolean }>> => {
    return await _addFlashcardAttempt(data);
};