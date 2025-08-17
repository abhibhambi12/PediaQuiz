import { db } from '../firebase';
import {
    collection,
    getDocs,
    doc,
    getDoc,
    setDoc,
    query,
    where,
} from 'firebase/firestore';

export const getBookmarks = async (uid: string) => {
    const q = query(collection(db, 'bookmarks'), where('userId', '==', uid));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

export const getFlashcards = async (sessionId: string) => {
    const snapshot = await getDocs(collection(db, `sessions/${sessionId}/flashcards`));
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

export const getQuestions = async () => {
    const snapshot = await getDocs(collection(db, 'questions'));
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

export const getMCQs = async (sessionId: string) => {
    const snapshot = await getDocs(collection(db, `sessions/${sessionId}/mcqs`));
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

export const getQuizResults = async (quizId: string) => {
    const docRef = doc(db, 'quizResults', quizId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
};

export const searchContent = async (queryString: string) => {
    // Placeholder: Implement actual search logic (e.g., Algolia or Firestore query)
    const snapshot = await getDocs(collection(db, 'content'));
    return snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((item) => item.title?.toLowerCase().includes(queryString.toLowerCase()));
};

export const createTest = async (test: { title: string; questions: string[] }) => {
    const docRef = doc(collection(db, 'tests'));
    await setDoc(docRef, test);
    return docRef.id;
};

export const getLogs = async () => {
    const snapshot = await getDocs(collection(db, 'logs'));
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

export const getQuestionsByTag = async (tag: string) => {
    const q = query(collection(db, 'questions'), where('tags', 'array-contains', tag));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

export const getTags = async () => {
    const snapshot = await getDocs(collection(db, 'tags'));
    return snapshot.docs.map((doc) => doc.id);
};