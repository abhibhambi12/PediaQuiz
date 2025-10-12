// frontend/src/services/contentService.ts
import { MCQ, Flashcard } from '@pediaquiz/types';
import { 
    getQuestionsByTag as fetchQuestionsByTagCallable,
    getTags as fetchTagsCallable,
    getMcqsByIds as fetchMcqsByIdsCallable,
    getFlashcardsByIds as fetchFlashcardsByIdsCallable,
    // Import the raw callers from apiService to use them here
    _getTopicContentIds,
    _getChapterContent,
} from './apiService'; 

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

/**
 * Fetches a specific list of MCQs by their IDs using the centralized apiService.
 */
export const getMCQsByIds = async (mcqIds: string[]): Promise<MCQ[]> => {
    if (!mcqIds || mcqIds.length === 0) return [];
    try {
        const response = await fetchMcqsByIdsCallable({ mcqIds });
        return response.data.mcqs;
    } catch (error: any) {
        console.error(`Error fetching MCQs by IDs:`, error);
        throw new Error(`Failed to load MCQs: ${error.message || "Unknown error."}`);
    }
};

/**
 * Fetches a specific list of Flashcards by their IDs using the centralized apiService.
 */
export const getFlashcardsByIds = async (flashcardIds: string[]): Promise<Flashcard[]> => {
    if (!flashcardIds || flashcardIds.length === 0) return [];
    try {
        const response = await fetchFlashcardsByIdsCallable({ flashcardIds });
        return response.data.flashcards;
    } catch (error: any) {
        console.error(`Error fetching Flashcards by IDs:`, error);
        throw new Error(`Failed to load Flashcards: ${error.message || "Unknown error."}`);
    }
};

/**
 * Fetches all content IDs for a given topic via a secure backend function.
 */
export const getTopicContentIds = async (data: { topicId: string }) => {
    return _getTopicContentIds(data);
};

/**
 * Fetches all MCQs and Flashcards for a given chapter via a secure backend function.
 */
export const getChapterContent = async (data: { chapterId: string }) => {
    return _getChapterContent(data);
};