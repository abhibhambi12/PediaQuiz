import { createSession, getSession, updateSession, finishSession } from './apiService';
import type { QuizSession } from '@pediaquiz/types';

/**
 * Creates a new quiz session via a secure backend function.
 * This also handles the cleanup of any previous active session for the user.
 * @param mode The mode of the quiz (e.g., 'quiz', 'weakness').
 * @param mcqIds An array of MCQ IDs for the session.
 * @param flashcardIds An optional array of Flashcard IDs for mixed sessions.
 * @returns The ID of the newly created session.
 */
const createNewSession = async (
    mode: QuizSession['mode'], 
    mcqIds: string[], 
    flashcardIds: string[] = []
): Promise<string> => {
    try {
        const response = await createSession({ mode, mcqIds, flashcardIds });
        return response.data.sessionId;
    } catch (error: any) {
        console.error("Error creating session via backend:", error);
        throw new Error(`Failed to create session: ${error.message}`);
    }
};

/**
 * Fetches an existing quiz session via a secure backend function.
 * @param sessionId The ID of the session to fetch.
 * @returns The quiz session data, or null if not found/authorized.
 */
const fetchSession = async (sessionId: string): Promise<QuizSession | null> => {
    try {
        const response = await getSession({ sessionId });
        return response.data;
    } catch (error: any) {
        console.error(`Error fetching session ${sessionId} via backend:`, error);
        if ((error as any).code === 'not-found' || (error as any).code === 'permission-denied') {
            return null;
        }
        throw new Error(`Failed to fetch session: ${error.message}`);
    }
};

/**
 * Updates an existing quiz session via a secure backend function.
 * @param sessionId The ID of the session to update.
 * @param updates A partial object of the session data to update.
 */
const updateCurrentSession = async (sessionId: string, updates: Partial<QuizSession>): Promise<void> => {
    try {
        await updateSession({ sessionId, updates });
    } catch (error: any) {
        console.error(`Error updating session ${sessionId} via backend:`, error);
        throw new Error(`Failed to update session: ${error.message}`);
    }
};

/**
 * Finishes a quiz session via a secure backend function.
 * The backend handles scoring, awarding XP, and creating the final quiz result document.
 * @param sessionId The ID of the session to finish.
 * @param answers The final map of user answers.
 * @returns The ID of the generated quiz result document.
 */
const finishCurrentSession = async (sessionId: string, answers: QuizSession['answers']): Promise<string> => {
    try {
        const response = await finishSession({ sessionId, answers });
        return response.data.resultId;
    } catch (error: any) {
        console.error(`Error finishing session ${sessionId} via backend:`, error);
        throw new Error(`Failed to finish session: ${error.message}`);
    }
};

export const SessionManager = {
    createSession: createNewSession,
    getSession: fetchSession,
    updateSession: updateCurrentSession,
    finishSession: finishCurrentSession,
};