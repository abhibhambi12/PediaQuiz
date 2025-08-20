import { db, functions } from '@/firebase';
import { doc, getDoc, collection, getDocs, query, orderBy, QueryDocumentSnapshot, Timestamp, where } from 'firebase/firestore';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import type {
    QuizResult,
    AttemptedMCQs,
    Attempt,
    FlashcardAttempt,
    ToggleBookmarkCallableData,
    DeleteContentItemCallableData, // Added this import
    Goal,
    GoalInput,
    User,
    LogEntry,
    GetDailyGoalCallableData,
    AttemptedMCQDocument
} from '@pediaquiz/types';

// Centralized callable function references
const addQuizResultFn = httpsCallable<Omit<QuizResult, 'id' | 'userId' | 'quizDate'>, { success: boolean, id: string }>(functions, 'addquizresult');
const addAttemptFn = httpsCallable<{ mcqId: string; isCorrect: boolean; selectedAnswer: string | null; sessionId?: string; confidenceRating?: string }, { success: boolean }>(functions, 'addattempt');
const toggleBookmarkFn = httpsCallable<ToggleBookmarkCallableData, { bookmarked: boolean, bookmarkedMcqs: string[], bookmarkedFlashcards: string[] }>(functions, 'togglebookmark');
const deleteContentItemFn = httpsCallable<DeleteContentItemCallableData, { success: boolean, message: string }>(functions, 'deletecontentitem'); // Added this reference
const addFlashcardAttemptFn = httpsCallable<{ flashcardId: string, rating: 'again' | 'hard' | 'good' | 'easy' }, { success: boolean }>(functions, 'addFlashcardAttempt');
const getUserLogsFn = httpsCallable<void, { logs: LogEntry[] }>(functions, 'getUserLogs');
const setGoalFn = httpsCallable<Omit<GoalInput, 'id' | 'userId' | 'createdAt' | 'updatedAt'>, { success: boolean, goalId: string }>(functions, 'setGoal');
const updateGoalFn = httpsCallable<Partial<GoalInput> & { id: string }, { success: boolean, message: string }>(functions, 'updateGoal');
const deleteGoalFn = httpsCallable<{ goalId: string }, { success: boolean, message: string }>(functions, 'deleteGoal');
const getDailyGoalFn = httpsCallable<GetDailyGoalCallableData, { success: boolean, goal: Goal }>(functions, 'getDailyGoal');


/**
 * Fetches the document for a single user from Firestore.
 */
export const getUserData = async (uid: string): Promise<User | null> => {
    if (!uid) {
        console.error("getUserData called without a user ID.");
        return null;
    }
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        console.warn(`User document for ${uid} not found.`);
        return null;
    }
    const data = docSnap.data();
    return {
        uid: data.uid,
        email: data.email,
        displayName: data.displayName,
        isAdmin: data.isAdmin || false,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
        lastLogin: data.lastLogin instanceof Timestamp ? data.lastLogin.toDate() : new Date(),
        bookmarkedMcqs: data.bookmarkedMcqs || [],
        bookmarkedFlashcards: data.bookmarkedFlashcards || [],
        activeSessionId: data.activeSessionId || undefined,
        currentStreak: data.currentStreak || 0,
        lastStudiedDate: data.lastStudiedDate instanceof Timestamp ? data.lastStudiedDate.toDate() : null,
        xp: data.xp || 0,
        level: data.level || 1,
        theme: data.theme || 'default',
        badges: data.badges || [],
    } as User;
};

/**
 * Fetches a user's attempted MCQs with their latest attempt status.
 */
export const getAttemptedMCQs = async (userId: string): Promise<AttemptedMCQs> => {
    if (!userId) return {};
    const attemptsRef = collection(db, 'users', userId, 'attemptedMCQs');
    const snapshot = await getDocs(attemptsRef);
    const attempted: AttemptedMCQs = {};
    snapshot.forEach((doc: QueryDocumentSnapshot) => {
        const data = doc.data() as AttemptedMCQDocument;
        if (data.latestAttempt) {
            const latestAttempt = {
                ...data.latestAttempt,
                timestamp: data.latestAttempt.timestamp instanceof Timestamp ? data.latestAttempt.timestamp.toDate() : new Date(),
                nextReviewDate: data.latestAttempt.nextReviewDate instanceof Timestamp ? data.latestAttempt.nextReviewDate.toDate() : new Date(),
                lastAttempted: data.latestAttempt.lastAttempted instanceof Timestamp ? data.latestAttempt.lastAttempted.toDate() : new Date(),
            } as Attempt;

            const history = (data.history || []).map(h => ({
                ...h,
                timestamp: h.timestamp instanceof Timestamp ? h.timestamp.toDate() : new Date(),
                nextReviewDate: h.nextReviewDate instanceof Timestamp ? h.nextReviewDate.toDate() : new Date(),
                lastAttempted: h.lastAttempted instanceof Timestamp ? h.lastAttempted.toDate() : new Date(),
            })) as Attempt[];

            attempted[doc.id] = { ...data, id: doc.id, history, latestAttempt };
        }
    });
    return attempted;
};

/**
 * Fetches a user's attempted Flashcards with their latest review status.
 */
export const getAttemptedFlashcards = async (userId: string): Promise<Record<string, FlashcardAttempt>> => {
    if (!userId) return {};
    const attemptsRef = collection(db, 'users', userId, 'attemptedFlashcards');
    const snapshot = await getDocs(attemptsRef);
    const attempted: Record<string, FlashcardAttempt> = {};
    snapshot.forEach((doc: QueryDocumentSnapshot) => {
        const data = doc.data() as FlashcardAttempt;
        if (data) {
            attempted[doc.id] = {
                ...data,
                timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(),
                nextReviewDate: data.nextReviewDate instanceof Timestamp ? data.nextReviewDate.toDate() : new Date(),
                lastAttempted: data.lastAttempted instanceof Timestamp ? data.lastAttempted.toDate() : new Date(),
            };
        }
    });
    return attempted;
};

/**
 * Fetches the user's bookmarks from their user document.
 */
export const getBookmarks = async (userId: string): Promise<string[]> => {
    if (!userId) return [];
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
        const userData = userDoc.data();
        return [...(userData?.bookmarkedMcqs || []), ...(userData?.bookmarkedFlashcards || [])];
    }
    return [];
};

/**
 * Fetches quiz results for a user. Can fetch a single result by ID or all results for a user.
 */
export const getQuizResults = async (userId: string | null, resultId?: string): Promise<QuizResult[]> => {
    if (resultId) {
        const docRef = doc(db, 'quizResults', resultId);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return [];
        const data = docSnap.data();
        const result: QuizResult = {
            ...data,
            id: docSnap.id,
            quizDate: data.quizDate instanceof Timestamp ? data.quizDate.toDate() : new Date(),
        } as QuizResult;
        return [result];
    }

    if (!userId) return [];
    const q = query(collection(db, 'quizResults'), where('userId', '==', userId), orderBy('quizDate', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => {
        const data = d.data();
        return {
            ...data,
            id: d.id,
            quizDate: data.quizDate instanceof Timestamp ? data.quizDate.toDate() : new Date(),
        } as QuizResult;
    });
};


// --- Callable Function Wrappers ---

/**
 * Calls the 'addquizresult' backend function to save a quiz session's results.
 */
export const addQuizResult = async (result: Omit<QuizResult, 'id' | 'userId' | 'quizDate'>): Promise<HttpsCallableResult<{ success: boolean, id: string }>> => {
    return await addQuizResultFn(result);
};

/**
 * Calls the 'addattempt' backend function to save an MCQ attempt and update SM-2 data.
 */
export const addAttempt = async (data: { mcqId: string; isCorrect: boolean; selectedAnswer: string | null; sessionId?: string; confidenceRating?: string }): Promise<HttpsCallableResult<{ success: boolean }>> => {
    return await addAttemptFn(data);
};

/**
 * Calls the 'addFlashcardAttempt' backend function to save a flashcard rating and update SM-2 data.
 */
export const addFlashcardAttempt = async (data: { flashcardId: string, rating: 'again' | 'hard' | 'good' | 'easy' }): Promise<HttpsCallableResult<{ success: boolean }>> => {
    return await addFlashcardAttemptFn(data);
};

/**
 * Calls the 'togglebookmark' backend function to add or remove a bookmark.
 */
export const toggleBookmark = async (data: ToggleBookmarkCallableData): Promise<HttpsCallableResult<{ bookmarked: boolean, bookmarkedMcqs: string[], bookmarkedFlashcards: string[] }>> => {
    return await toggleBookmarkFn(data);
};

/**
 * Calls the 'deletecontentitem' backend function to delete an MCQ or Flashcard.
 */
export const deleteContentItem = async (data: DeleteContentItemCallableData): Promise<HttpsCallableResult<{ success: boolean; message: string }>> => {
    return await deleteContentItemFn(data);
};

/**
 * Calls the secure 'getUserLogs' backend function to fetch logs for the current user.
 */
export const getLogs = async (): Promise<LogEntry[]> => {
    try {
        const result = await getUserLogsFn();
        return result.data.logs;
    } catch (error) {
        console.error("Failed to fetch user logs:", error);
        return [];
    }
};

/**
 * Fetches goals for a specific user from the 'goals' subcollection.
 */
export const getGoals = async (uid: string): Promise<Goal[]> => {
    if (!uid) return [];
    try {
        const goalsQuery = query(collection(db, `users/${uid}/goals`), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(goalsQuery);
        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            targetDate: (doc.data().targetDate instanceof Timestamp) ? doc.data().targetDate.toDate() : doc.data().targetDate,
            createdAt: (doc.data().createdAt instanceof Timestamp) ? doc.data().createdAt.toDate() : doc.data().createdAt,
            updatedAt: (doc.data().updatedAt instanceof Timestamp) ? doc.data().updatedAt.toDate() : doc.data().updatedAt,
        } as Goal));
    } catch (error) {
        console.error("Failed to fetch user goals:", error);
        return [];
    }
};

/**
 * Calls the 'setGoal' backend function to create a new goal document for a specific user.
 */
export const setGoal = async (goal: Omit<GoalInput, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<HttpsCallableResult<{ success: boolean, goalId: string }>> => {
    return await setGoalFn(goal);
};

/**
 * Calls the 'updateGoal' backend function to update an existing goal.
 */
export const updateGoal = async (data: Partial<GoalInput> & { id: string }): Promise<HttpsCallableResult<{ success: boolean, message: string }>> => {
    return await updateGoalFn(data);
};

/**
 * Calls the 'deleteGoal' backend function to delete a goal.
 */
export const deleteGoal = async (goalId: string): Promise<HttpsCallableResult<{ success: boolean, message: string }>> => {
    return await deleteGoalFn({ goalId });
};

/**
 * Calls the 'getDailyGoal' backend function to fetch or generate a user's daily goal.
 */
export const getDailyGoal = async (userId: string): Promise<HttpsCallableResult<{ success: boolean, goal: Goal }>> => {
    return await getDailyGoalFn({ userId });
};