import { doc, setDoc, getDoc, deleteDoc, serverTimestamp, Timestamp, collection, updateDoc, runTransaction, query, where, deleteField, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import { QuizSession, Attempt } from '@pediaquiz/types'; // Removed 'type' prefix for direct usage

/**
 * Manages quiz session data in Firestore, including creation, retrieval,
 * updates, and deletion of sessions. It also handles linking sessions to users
 * and managing session expiry.
 */
export class SessionManager {
  /**
   * The name of the Firestore collection for quiz sessions.
   */
  private static readonly COLLECTION = 'quizSessions';
  /**
   * The name of the Firestore collection for user documents.
   */
  private static readonly USER_COLLECTION = 'users';
  /**
   * The duration a quiz session remains active, in milliseconds (4 hours).
   */
  private static readonly SESSION_DURATION_MS = 4 * 60 * 60 * 1000;

  /**
   * Creates a new quiz session in Firestore.
   * @param userId - The ID of the user starting the session.
   * @param mode - The mode of the quiz (e.g., 'practice', 'quiz', 'custom').
   * @param mcqIds - An array of MCQ IDs to be included in the session.
   * @param flashcardIds - (NEW) An array of Flashcard IDs to be included in the session.
   * @returns A Promise resolving to the ID of the newly created session.
   */
  static async createSession(userId: string, mode: QuizSession['mode'], mcqIds: string[], flashcardIds: string[] = []): Promise<string> { // Added flashcardIds with default empty array
    const sessionDocRef = doc(collection(db, this.COLLECTION));
    const sessionId = sessionDocRef.id;
    const expiresAt = new Date(Date.now() + this.SESSION_DURATION_MS);

    const sessionData: Omit<QuizSession, 'id' | 'createdAt' | 'expiresAt' | 'updatedAt'> & {
      createdAt: ReturnType<typeof serverTimestamp>;
      expiresAt: Timestamp;
    } = {
      userId, mode, mcqIds, flashcardIds, currentIndex: 0, answers: {}, markedForReview: [], isFinished: false, // Added flashcardIds here
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt)
    };

    const userDocRef = doc(db, this.USER_COLLECTION, userId);

    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userDocRef);
      if (userDoc.exists()) {
        const currentActiveSessionId = userDoc.data()?.activeSessionId as string | undefined;
        if (currentActiveSessionId) {
          const existingSessionRef = doc(db, this.COLLECTION, currentActiveSessionId);
          const existingSessionDoc = await transaction.get(existingSessionRef);
          if (existingSessionDoc.exists()) {
            const existingSessionData = existingSessionDoc.data() as QuizSession;
            if (!existingSessionData.isFinished && (existingSessionData.expiresAt as Timestamp).toDate() > new Date()) {
              transaction.delete(existingSessionRef);
              console.log(`Cleaned up old active session ${currentActiveSessionId} for user ${userId} within create transaction.`); // Use console.log for frontend
            } else {
              transaction.update(userDocRef, { activeSessionId: deleteField() });
              console.log(`Cleared stale activeSessionId for user ${userId}: ${currentActiveSessionId}.`); // Use console.log for frontend
            }
          }
        }
      }

      transaction.set(sessionDocRef, sessionData);
      transaction.update(userDocRef, { activeSessionId: sessionId });
    });

    return sessionId;
  }

  /**
   * Retrieves a quiz session from Firestore.
   * @param sessionId - The ID of the session to retrieve.
   * @param userId - The ID of the user requesting the session (for ownership verification).
   * @returns A Promise resolving to the QuizSession object or null.
   */
  static async getSession(sessionId: string, userId: string): Promise<QuizSession | null> {
    const sessionRef = doc(db, this.COLLECTION, sessionId);
    const sessionDoc = await getDoc(sessionRef);

    if (!sessionDoc.exists() || sessionDoc.data()?.userId !== userId) {
      return null;
    }

    const data = sessionDoc.data();
    const expiresAt = (data.expiresAt as Timestamp).toDate();

    if (new Date() > expiresAt) {
      await this.deleteSession(sessionId, userId);
      console.log(`Session ${sessionId} for user ${userId} expired. Deleted.`); // Use console.log for frontend
      return null;
    }

    return {
      id: sessionId,
      ...data,
      createdAt: (data.createdAt as Timestamp).toDate(),
      expiresAt,
    } as QuizSession;
  }

  /**
   * Updates an existing quiz session document in Firestore using a transaction.
   * @param sessionId - The ID of the session to update.
   * @param updates - A partial QuizSession object containing fields to update.
   */
  static async updateSession(
    sessionId: string,
    updates: Partial<Omit<QuizSession, 'createdAt' | 'expiresAt'>>
  ): Promise<void> {
    const sessionRef = doc(db, this.COLLECTION, sessionId);
    await runTransaction(db, async (transaction) => {
      transaction.update(sessionRef, { ...updates, updatedAt: serverTimestamp() });
    });
  }

  /**
   * Deletes a quiz session document from Firestore, along with associated
   * attempted MCQs and quiz results.
   * @param sessionId - The ID of the session to delete.
   * @param userId - The ID of the user associated with the session.
   */
  static async deleteSession(sessionId: string, userId: string): Promise<void> {
    const userDocRef = doc(db, this.USER_COLLECTION, userId);
    const sessionRef = doc(db, this.COLLECTION, sessionId);

    await runTransaction(db, async (transaction) => {
      transaction.delete(sessionRef);

      const attemptedMcqsQuery = query(collection(db, `users/${userId}/attemptedMCQs`), where('latestAttempt.sessionId', '==', sessionId));
      const attemptedMcqsSnapshot = await getDocs(attemptedMcqsQuery);
      attemptedMcqsSnapshot.docs.forEach(doc => {
        const data = doc.data() as { latestAttempt: Attempt };
        if (data.latestAttempt) {
          transaction.update(doc.ref, { 'latestAttempt.sessionId': deleteField() });
        }
      });

      const quizResultsQuery = query(collection(db, `quizResults`), where('sessionId', '==', sessionId), where('userId', '==', userId));
      const quizResultsSnapshot = await getDocs(quizResultsQuery);
      quizResultsSnapshot.docs.forEach(doc => transaction.delete(doc.ref));

      const userDoc = await transaction.get(userDocRef);
      if (userDoc.exists() && userDoc.data()?.activeSessionId === sessionId) {
        transaction.update(userDocRef, { activeSessionId: deleteField() });
      }
    });
    console.log(`Session ${sessionId} and associated data updated/deleted for user ${userId}.`); // Use console.log for frontend
  }
}