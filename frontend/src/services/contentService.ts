import type { MCQ, Flashcard, AppData } from '@pediaquiz/types';
import {
    getQuestionsByTag as fetchQuestionsByTagCallable,
    getTags as fetchTagsCallable,
} from './apiService'; 

/**
 * Efficiently filters the globally cached AppData to get content for a specific chapter.
 * This avoids a network call by using data already in memory.
 */
export const getChapterContent = (appData: AppData | undefined, chapterId: string): { mcqs: MCQ[], flashcards: Flashcard[] } => {
    if (!chapterId || !appData) return { mcqs: [], flashcards: [] };
    try {
        const mcqs = appData.mcqs.filter((mcq: MCQ) => mcq.chapterId === chapterId);
        const flashcards = appData.flashcards.filter((fc: Flashcard) => fc.chapterId === chapterId);
        return { mcqs, flashcards };
    } catch (error: any) {
        console.error(`Error filtering content for chapter ${chapterId}:`, error);
        throw new Error(`Failed to load chapter content: ${error.message || "Unknown error."}`);
    }
}

/**
 * Efficiently gets specific MCQs by their IDs from the cached AppData.
 */
export const getMCQsByIds = (appData: AppData | undefined, mcqIds: string[]): MCQ[] => {
    if (!mcqIds || mcqIds.length === 0 || !appData) return [];
    const mcqMap = new Map(appData.mcqs.map((mcq: MCQ) => [mcq.id, mcq]));
    return mcqIds.map(id => mcqMap.get(id)).filter((mcq): mcq is MCQ => !!mcq);
};

/**
 * Efficiently gets specific Flashcards by their IDs from the cached AppData.
 */
export const getFlashcardsByIds = (appData: AppData | undefined, flashcardIds: string[]): Flashcard[] => {
    if (!flashcardIds || flashcardIds.length === 0 || !appData) return [];
    const flashcardMap = new Map(appData.flashcards.map((fc: Flashcard) => [fc.id, fc]));
    return flashcardIds.map((id: string) => flashcardMap.get(id)).filter((fc): fc is Flashcard => !!fc);
};

/**
 * Fetches all tags via a secure and centralized callable function.
 */
export const getTags = async (): Promise<string[]> => {
    try {
        const response = await fetchTagsCallable();
        return response.data.tags;
    } catch (error: any) {
        console.error("Error fetching tags via callable:", error);
        throw new Error(`Failed to load tags: ${error.message || "Unknown error."}`);
    }
};

/**
 * Fetches questions for a specific tag via a secure and centralized callable function.
 */
export const getQuestionsByTag = async (tagName: string): Promise<MCQ[]> => {
    if (!tagName) return [];
    try {
        const response = await fetchQuestionsByTagCallable({ tagName });
        return response.data.mcqs;
    } catch (error: any) {
        console.error(`Error fetching questions for tag "${tagName}" via callable:`, error);
        throw new Error(`Failed to load questions for tag: ${error.message || "Unknown error."}`);
    }
};