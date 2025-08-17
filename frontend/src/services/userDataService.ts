import { db, functions } from '../firebase';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { UserData, User, AddAttemptCallableData, AddFlashcardAttemptCallableData, ToggleBookmarkCallableData } from '@pediaquiz/types';

// Centralized callable function references
const addAttemptFn = httpsCallable<AddAttemptCallableData, { success: boolean }>(functions, 'addattempt');
const addFlashcardAttemptFn = httpsCallable<AddFlashcardAttemptCallableData, { success: boolean }>(functions, 'addFlashcardAttempt');
const toggleBookmarkFn = httpsCallable<ToggleBookmarkCallableData, { bookmarked: boolean }>(functions, 'togglebookmark');
const getUserLogsFn = httpsCallable<void, { logs: any[] }>(functions, 'getUserLogs');

/**
 * Fetches the document for a single user from Firestore.
 */
export const getUserData = async (uid: string): Promise<UserData> => {
    if (!uid) {
        console.error("getUserData called without a user ID.");
        return {};
    }
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? (docSnap.data() as UserData) : {};
};

/**
 * Fetches goals for a specific user from the 'goals' subcollection.
 */
export const getGoals = async (uid: string) => {
    if (!uid) return [];
    const snapshot = await getDocs(collection(db, `users/${uid}/goals`));
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

/**
 * Creates a new goal document for a specific user.
 */
export const setGoal = async (uid: string, goal: { title: string }) => {
    if (!uid) return;
    const docRef = doc(collection(db, `users/${uid}/goals`));
    await setDoc(docRef, goal);
};

/**
 * Fetches user statistics from the 'stats/summary' document.
 */
export const getStats = async (uid: string): Promise<NonNullable<UserData['stats']>> => {
    if (!uid) return { quizzesCompleted: 0, averageScore: 0, studyTime: 0 };
    const docRef = doc(db, 'users', uid, 'stats', 'summary');
    const docSnap = await getDoc(docRef);
    return docSnap.exists()
        ? (docSnap.data() as NonNullable<UserData['stats']>)
        : { quizzesCompleted: 0, averageScore: 0, studyTime: 0 };
};

/**
 * Calls the 'addattempt' backend function to save an MCQ attempt.
 */
export const addAttempt = async (data: AddAttemptCallableData): Promise<{ success: boolean }> => {
    const result = await addAttemptFn(data);
    return result.data;
};

/**
 * Calls the 'addFlashcardAttempt' backend function to save a flashcard rating.
 */
export const addFlashcardAttempt = async (data: AddFlashcardAttemptCallableData): Promise<{ success: boolean }> => {
    const result = await addFlashcardAttemptFn(data);
    return result.data;
};

/**
 * Calls the 'togglebookmark' backend function to add or remove a bookmark.
 */
export const toggleBookmark = async (data: ToggleBookmarkCallableData): Promise<{ bookmarked: boolean }> => {
    const result = await toggleBookmarkFn(data);
    return result.data;
};

/**
 * Calls the secure 'getUserLogs' backend function to fetch logs for the current user.
 */
export const getLogs = async (): Promise<any[]> => {
    try {
        const result = await getUserLogsFn();
        return result.data.logs;
    } catch (error) {
        console.error("Failed to fetch user logs:", error);
        return [];
    }
};