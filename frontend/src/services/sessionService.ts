import { doc, setDoc, getDoc, deleteDoc, serverTimestamp, Timestamp, collection, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import type { MCQ } from '@pediaquiz/types';

export interface QuizSession {
  id: string;
  userId: string;
  mode: 'practice' | 'quiz' | 'custom' | 'weakness' | 'incorrect' | 'mock' | 'review_due' | 'warmup';
  mcqIds: string[];
  currentIndex: number;
  answers: Record<number, string | null>;
  markedForReview: number[];
  isFinished: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export class SessionManager {
  private static readonly COLLECTION = 'quizSessions';
  private static readonly USER_COLLECTION = 'users';
  private static readonly SESSION_DURATION_MS = 4 * 60 * 60 * 1000;

  static async createSession(userId: string, mode: QuizSession['mode'], mcqIds: string[]): Promise<string> {
    const sessionDocRef = doc(collection(db, this.COLLECTION));
    const sessionId = sessionDocRef.id;
    const expiresAt = new Date(Date.now() + this.SESSION_DURATION_MS);

    const sessionData = {
      userId, mode, mcqIds, currentIndex: 0, answers: {}, markedForReview: [], isFinished: false,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt)
    };

    const userDocRef = doc(db, this.USER_COLLECTION, userId);

    await Promise.all([
      setDoc(sessionDocRef, sessionData),
      updateDoc(userDocRef, { activeSessionId: sessionId })
    ]);

    return sessionId;
  }

  static async getSession(sessionId: string, userId: string): Promise<QuizSession | null> {
    const sessionRef = doc(db, this.COLLECTION, sessionId);
    const sessionDoc = await getDoc(sessionRef);
    if (!sessionDoc.exists() || sessionDoc.data().userId !== userId) return null;

    const data = sessionDoc.data();
    const expiresAt = (data.expiresAt as Timestamp).toDate();
    if (new Date() > expiresAt) {
      await this.deleteSession(sessionId);
      const userDocRef = doc(db, this.USER_COLLECTION, userId);
      await updateDoc(userDocRef, { activeSessionId: null });
      return null;
    }

    return {
      id: sessionId, ...data,
      createdAt: (data.createdAt as Timestamp).toDate(),
      expiresAt,
    } as QuizSession;
  }

  static async updateSession(sessionId: string, updates: Partial<QuizSession>): Promise<void> {
    await setDoc(doc(db, this.COLLECTION, sessionId), updates, { merge: true });
  }

  static async deleteSession(sessionId: string): Promise<void> {
    await deleteDoc(doc(db, this.COLLECTION, sessionId));
  }
}