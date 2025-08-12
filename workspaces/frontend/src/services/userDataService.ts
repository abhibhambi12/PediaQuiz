import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { collection, getDocs, doc, getDoc, query, orderBy, QueryDocumentSnapshot } from 'firebase/firestore';
import { functions, db } from '@/firebase';
import type { QuizResult, AttemptedMCQs, Attempt, ToggleBookmarkCallableData, DeleteContentItemCallableData } from '@pediaquiz/types';

const addQuizResultFn = httpsCallable<Omit<QuizResult, 'id' | 'userId' | 'date'>, { success: boolean, id: string }>(functions, 'addquizresult');
const addAttemptFn = httpsCallable<{ mcqId: string; isCorrect: boolean }, { success: boolean }>(functions, 'addattempt');
const toggleBookmarkFn = httpsCallable<ToggleBookmarkCallableData, { bookmarked: boolean, bookmarks: string[] }>(functions, 'togglebookmark');
const deleteContentItemFn = httpsCallable<DeleteContentItemCallableData, { success: boolean, message: string }>(functions, 'deletecontentitem');

export const addQuizResult = async (result: Omit<QuizResult, 'id' | 'userId' | 'date'>): Promise<HttpsCallableResult<{ success: boolean, id: string }>> => {
    return await addQuizResultFn(result);
};

export const addAttempt = async (data: { mcqId: string; isCorrect: boolean }): Promise<HttpsCallableResult<{ success: boolean }>> => {
    return await addAttemptFn(data);
};

export const toggleBookmark = async (data: ToggleBookmarkCallableData): Promise<HttpsCallableResult<{ bookmarked: boolean, bookmarks: string[] }>> => {
    return await toggleBookmarkFn(data);
};

export const deleteContentItem = async (data: DeleteContentItemCallableData): Promise<HttpsCallableResult<{ success: boolean; message: string }>> => {
    return await deleteContentItemFn(data);
};

export const getAttemptedMCQs = async (userId: string): Promise<AttemptedMCQs> => {
    if (!userId) return {};
    const attemptsRef = collection(db, 'users', userId, 'attemptedMCQs');
    const snapshot = await getDocs(attemptsRef);
    const attempted: AttemptedMCQs = {};
    snapshot.forEach((doc: QueryDocumentSnapshot) => {
        const data = doc.data();
        attempted[doc.id] = {
            ...data,
            lastAttempted: data.lastAttempted?.toDate ? data.lastAttempted.toDate() : data.lastAttempted,
        } as Attempt;
    });
    return attempted;
};

export const getBookmarks = async (userId: string): Promise<string[]> => {
    if (!userId) return [];
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
        const userData = userDoc.data();
        return userData.bookmarks || [];
    }
    return [];
};

export const getQuizResults = async (userId: string): Promise<QuizResult[]> => {
    if (!userId) return [];
    const quizResultsRef = collection(db, 'quizResults');
    const q = query(quizResultsRef, orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    const results: QuizResult[] = [];
    snapshot.forEach((doc: QueryDocumentSnapshot) => {
        const data = doc.data();
        if (data.userId === userId) { 
            results.push({
                ...data,
                id: doc.id,
                date: data.date?.toDate ? data.date.toDate() : data.date,
            } as QuizResult);
        }
    });
    return results;
};