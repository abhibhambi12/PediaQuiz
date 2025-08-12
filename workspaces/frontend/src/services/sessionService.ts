// FILE: workspaces/frontend/src/services/sessionService.ts

import { doc, setDoc, getDoc, deleteDoc, serverTimestamp, Timestamp, collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from '@/firebase';
import type { MCQ } from '@pediaquiz/types';

export interface QuizSession {
  id: string;
  userId: string;
  mode: 'practice' | 'quiz' | 'custom' | 'weakness' | 'incorrect' | 'mock' | 'review_due'; // Added 'review_due'
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
  private static readonly SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

  /**
   * Creates a new quiz session document in Firestore.
   * @param userId The ID of the user creating the session.
   * @param mode The mode of the quiz (e.g., 'custom', 'quiz').
   * @param mcqIds An array of MCQ IDs for the session.
   * @returns The ID of the newly created session.
   */
  static async createSession(
    userId: string,
    mode: QuizSession['mode'],
    mcqIds: string[]
  ): Promise<string> {
    const sessionDocRef = doc(collection(db, this.COLLECTION));
    const sessionId = sessionDocRef.id;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.SESSION_DURATION_MS);

    const sessionData: Omit<QuizSession, 'id' | 'createdAt'> = {
      userId,
      mode,
      mcqIds,
      currentIndex: 0,
      answers: {},
      markedForReview: [],
      isFinished: false,
      expiresAt,
    };

    await setDoc(sessionDocRef, {
      ...sessionData,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt)
    });

    return sessionId;
  }

  /**
   * Retrieves an existing quiz session from Firestore.
   * @param sessionId The ID of the session to retrieve.
   * @param userId The ID of the current user (for security checks).
   * @returns The QuizSession object or null if not found/expired/unauthorized.
   */
  static async getSession(sessionId: string, userId: string): Promise<QuizSession | null> {
    const sessionRef = doc(db, this.COLLECTION, sessionId);
    const sessionDoc = await getDoc(sessionRef);

    if (!sessionDoc.exists()) {
      return null;
    }

    const data = sessionDoc.data();
    
    // Security check: Ensure the session belongs to the requesting user
    if (data.userId !== userId) {
      console.error("Unauthorized attempt to access session.");
      return null;
    }

    // Check for expiration
    const expiresAt = (data.expiresAt as Timestamp).toDate();
    if (new Date() > expiresAt) {
      await this.deleteSession(sessionId); // Delete expired sessions
      return null;
    }

    // Convert Firestore Timestamps back to JavaScript Dates
    return {
      id: sessionId,
      ...data,
      createdAt: (data.createdAt as Timestamp).toDate(),
      expiresAt: expiresAt
    } as QuizSession;
  }

  /**
   * Updates a quiz session document in Firestore with new data.
   * @param sessionId The ID of the session to update.
   * @param updates An object containing the fields to update.
   */
  static async updateSession(sessionId: string, updates: Partial<QuizSession>): Promise<void> {
    const sessionRef = doc(db, this.COLLECTION, sessionId);
    // Convert Dates to Timestamps if present in updates before saving
    const updatesToFirestore: Record<string, any> = { ...updates };
    if (updatesToFirestore.createdAt instanceof Date) {
        updatesToFirestore.createdAt = Timestamp.fromDate(updatesToFirestore.createdAt);
    }
    if (updatesToFirestore.expiresAt instanceof Date) {
        updatesToFirestore.expiresAt = Timestamp.fromDate(updatesToFirestore.expiresAt);
    }
    await setDoc(sessionRef, updatesToFirestore, { merge: true });
  }

  /**
   * Deletes a quiz session document from Firestore.
   * @param sessionId The ID of the session to delete.
   */
  static async deleteSession(sessionId: string): Promise<void> {
    const sessionRef = doc(db, this.COLLECTION, sessionId);
    await deleteDoc(sessionRef);
  }
}

/**
 * Fetches a list of MCQs by their IDs from both MasterMCQ and MarrowMCQ collections.
 * Handles Firestore's 'in' query limit (max 10 values).
 * @param mcqIds An array of MCQ IDs to fetch.
 * @returns A Promise resolving to an array of MCQ objects, preserving original order.
 */
export async function getMcqsByIds(mcqIds: string[]): Promise<MCQ[]> {
    if (!mcqIds || mcqIds.length === 0) return [];
    
    const allMcqs: MCQ[] = [];
    const chunkSize = 10; // Firestore 'in' query limit is 10

    // Chunk the requests if mcqIds array is larger than 10
    for (let i = 0; i < mcqIds.length; i += chunkSize) {
        const chunk = mcqIds.slice(i, i + chunkSize);
        
        const masterQuery = query(collection(db, 'MasterMCQ'), where(documentId(), 'in', chunk));
        const marrowQuery = query(collection(db, 'MarrowMCQ'), where(documentId(), 'in', chunk));

        const [masterSnapshot, marrowSnapshot] = await Promise.all([
            getDocs(masterQuery),
            getDocs(marrowQuery),
        ]);

        masterSnapshot.forEach(doc => allMcqs.push({ id: doc.id, ...doc.data() } as MCQ));
        marrowSnapshot.forEach(doc => allMcqs.push({ id: doc.id, ...doc.data() } as MCQ));
    }

    // Preserve the original order of mcqIds using a map
    const mcqMap = new Map(allMcqs.map(mcq => [mcq.id, mcq]));
    return mcqIds.map(id => mcqMap.get(id)).filter(Boolean) as MCQ[];
}