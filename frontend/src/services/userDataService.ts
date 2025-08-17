import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { UserData } from '../../types';

export const getUserData = async (uid: string): Promise<UserData> => {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? (docSnap.data() as UserData) : {};
};

export const getGoals = async (uid: string) => {
    const snapshot = await getDocs(collection(db, `users/${uid}/goals`));
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

export const setGoal = async (uid: string, goal: { title: string }) => {
    const docRef = doc(collection(db, `users/${uid}/goals`));
    await setDoc(docRef, goal);
};

export const getStats = async (uid: string) => {
    const docRef = doc(db, 'users', uid, 'stats', 'summary');
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : { quizzesCompleted: 0, averageScore: 0, studyTime: 0 };
};