// frontend/src/services/aiService.ts
// This file focuses purely on AI-related callable functions.
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase'; // Import initialized Firebase Functions instance

/**
 * Calls the 'generateContent' Firebase Cloud Function to get AI-generated content.
 * Note: Based on backend review, this specific generic 'generateContent' function
 * might not exist. Ensure frontend callers are aligned with `planContentGeneration`
 * or `startAutomatedBatchGeneration`.
 * @param prompt - The text prompt for the AI.
 * @returns A Promise resolving to the AI-generated content string.
 */
export const generateContent = async (prompt: string): Promise<string> => {
    const generate = httpsCallable(functions, 'generateContent'); // This function might need renaming on backend
    const result: any = await generate({ prompt });
    return result.data as string;
};

/**
 * Calls the 'chatWithAI' Firebase Cloud Function to send a message and get an AI response.
 * @param message - The user's message to send to the AI.
 * @returns A Promise resolving to the AI's response string.
 */
export const sendMessageToAI = async (message: string): Promise<string> => {
    const chat = httpsCallable(functions, 'chatWithAI');
    const result: any = await chat({ message });
    return result.data as string;
};