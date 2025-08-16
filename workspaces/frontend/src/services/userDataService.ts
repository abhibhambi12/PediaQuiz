import { collection, getDocs, doc, getDoc, query, orderBy, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';
import { functions, db } from '@/firebase';
import { httpsCallable } from 'firebase/functions';
import type { QuizResult, AttemptedMCQs, Attempt, ToggleBookmarkCallableData, DeleteContentItemCallableData } from '@pediaquiz/types';

/**
 * A generic wrapper for Firebase Callable Functions that handles extracting the `data` property.
 * This simplifies calls in components and hooks.
 * @param functionName The name of the Cloud Function to call.
 * @param data The payload to send to the function.
 * @returns A promise that resolves with the data returned by the function.
 */
const callFirebaseFunction = async <T, R>(functionName: string, data?: T): Promise<R> => {
  try {
    const func = httpsCallable<T, R>(functions, functionName);
    const result = await func(data);
    return result.data;
  } catch (error) {
    console.error(`Error calling Firebase function '${functionName}':`, error);
    // Re-throw the error to be caught by react-query's onError handler
    throw error;
  }
};


export const addQuizResult = (result: Omit<QuizResult, 'id' | 'userId' | 'quizDate'>) => 
    callFirebaseFunction<Omit<QuizResult, 'id' | 'userId' | 'quizDate'>, { success: boolean, id: string }>('addQuizResult', result);

export const addAttempt = (data: Partial<Attempt>) => 
    callFirebaseFunction<Partial<Attempt>, { success: boolean }>('addAttempt', data);

export const toggleBookmark = (data: ToggleBookmarkCallableData) => 
    callFirebaseFunction<ToggleBookmarkCallableData, { bookmarked: boolean, bookmarks: string[] }>('toggleBookmark', data);

export const deleteContentItem = (data: DeleteContentItemCallableData) => 
    callFirebaseFunction<DeleteContentItemCallableData, { success: boolean, message: string }>('deleteContentItem', data);

export const getDueReviewItems = () => 
    callFirebaseFunction<void, { dueMcqIds: string[], dueFlashcardIds: string[] }>('getDueReviewItems');

export const getActiveSession = () => 
    callFirebaseFunction<void, { sessionId: string | null, sessionMode?: string }>('getActiveSession');


// Direct Firestore calls (no change needed in logic, just for consistency)

export const getAttemptedMCQs = async (userId: string): Promise<AttemptedMCQs> => {
    if (!userId) return {};
    const attemptsRef = collection(db, 'users', userId, 'attemptedMCQs');
    const snapshot = await getDocs(attemptsRef);
    const attempted: AttemptedMCQs = {};
    snapshot.forEach((doc: QueryDocumentSnapshot) => {
        const data = doc.data();
        if (data.latestAttempt) {
            attempted[doc.id] = {
                history: data.history || [],
                latestAttempt: {
                    ...data.latestAttempt,
                    timestamp: (data.latestAttempt.timestamp as Timestamp)?.toDate() || new Date(),
                    nextReviewDate: (data.latestAttempt.nextReviewDate as Timestamp)?.toDate() || new Date(),
                }
            };
        }
    });
    return attempted;
};

export const getBookmarks = async (userId: string): Promise<{ mcq: string[], flashcard: string[] }> => {
    if (!userId) return { mcq: [], flashcard: [] };
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
        const userData = userDoc.data();
        return {
            mcq: userData.bookmarkedMcqs || [],
            flashcard: userData.bookmarkedFlashcards || []
        };
    }
    return { mcq: [], flashcard: [] };
};

export const getQuizResultById = async (userId: string, resultId: string): Promise<QuizResult> => {
    if (!userId || !resultId) throw new Error("User ID and Result ID are required.");
    const docRef = doc(db, 'users', userId, 'quizResults', resultId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        throw new Error("Quiz result not found.");
    }
    const data = docSnap.data();
    return {
        ...data,
        id: docSnap.id,
        quizDate: (data.quizDate as Timestamp)?.toDate() || new Date(),
    } as QuizResult;
};

export const getQuizResults = async (userId: string): Promise<QuizResult[]> => {
    if (!userId) return [];
    const q = query(collection(db, `users/${userId}/quizResults`), orderBy('quizDate', 'desc'));
    const snapshot = await getDocs(q);
    const results: QuizResult[] = [];
    snapshot.forEach((doc: QueryDocumentSnapshot) => {
        const data = doc.data();
        results.push({
            ...data,
            id: doc.id,
            quizDate: (data.quizDate as Timestamp)?.toDate() || new Date(),
        } as QuizResult);
    });
    return results;
};