// frontend/src/services/aiService.ts

import { httpsCallable, HttpsCallableResult } from 'firebase/functions'; // CORRECT
import { functions } from '@/firebase';
import type { AttemptedMCQs, ChatMessage, MCQ } from '@pediaquiz/types';

const _chatWithAssistant = httpsCallable<{ prompt: string, history: ChatMessage[] }, { response: string }>(functions, 'chatWithAssistant');
const _generatePerformanceAdvice = httpsCallable<{ overallAccuracy: number, strongTopics: string[], weakTopics: string[] }, { advice: string }>(functions, 'generatePerformanceAdvice');
// Updated generateWeaknessBasedTest to expect a simplified MCQ array
const _generateWeaknessBasedTest = httpsCallable<{ attempted: AttemptedMCQs, allMcqs: Pick<MCQ, 'id' | 'topicId' | 'chapterId' | 'source' | 'tags'>[], testSize: number }, { mcqIds: string[] }>(functions, 'generateWeaknessBasedTest');
const _summarizeMarrowContent = httpsCallable<{ topicId: string, chapterId: string }, { success: boolean; message: string }>(functions, 'summarizeMarrowContent');
const _updateChapterNotes = httpsCallable<{ topicId: string, chapterId: string, newSummary: string }, { success: boolean; message: string }>(functions, 'updateChapterNotes');
const _generateAndApproveMarrowContent = httpsCallable<{
    uploadId: string,
    countToGenerate: number,
    topicId: string,
    topicName: string,
    chapterId: string,
    chapterName: string,
    keyTopics: string[]
}, { success: boolean; message: string }>(functions, 'generateAndApproveMarrowContent');
const _generateGeneralContent = httpsCallable<{ uploadId: string, count: number }, { success: boolean }>(functions, 'generateGeneralContent');


export const chatWithAssistant = async (data: { prompt: string, history: ChatMessage[] }): Promise<HttpsCallableResult<{ response: string }>> => {
    return _chatWithAssistant(data);
};

export const generatePerformanceAdvice = async (data: { overallAccuracy: number, strongTopics: string[], weakTopics: string[] }): Promise<HttpsCallableResult<{ advice: string }>> => {
    return _generatePerformanceAdvice(data);
};

// Modified to accept and send simplified MCQ data to backend
export const generateWeaknessBasedTest = async (data: { attempted: AttemptedMCQs, allMcqs: Pick<MCQ, 'id' | 'topicId' | 'chapterId' | 'source' | 'tags'>[], testSize: number }): Promise<HttpsCallableResult<{ mcqIds: string[] }>> => {
    return _generateWeaknessBasedTest(data);
};

export const summarizeMarrowContent = async (data: { topicId: string, chapterId: string }): Promise<HttpsCallableResult<{ success: boolean; message: string }>> => {
    return _summarizeMarrowContent(data);
};

export const updateChapterNotes = async (data: { topicId: string, chapterId: string, newSummary: string }): Promise<HttpsCallableResult<{ success: boolean; message: string }>> => {
    return _updateChapterNotes(data);
};

export const generateAndApproveMarrowContent = async (data: {
    uploadId: string,
    countToGenerate: number,
    topicId: string,
    topicName: string,
    chapterId: string,
    chapterName: string,
    keyTopics: string[]
}): Promise<HttpsCallableResult<{ success: boolean; message: string }>> => {
    return _generateAndApproveMarrowContent(data);
};

export const generateGeneralContent = async (data: { uploadId: string, count: number }): Promise<HttpsCallableResult<{ success: boolean }>> => {
    return _generateGeneralContent(data);
};