import { doc, setDoc, getDoc, deleteDoc, serverTimestamp, Timestamp, collection, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase'; // Import Firestore instance
import type { QuizSession, MCQ } from '@pediaquiz/types'; // Import types from shared package

// Defines the structure for a quiz session, used for both MCQs and potentially Flashcards
// NOTE: The QuizSession interface was previously defined locally here. It has been removed
// to ensure consistency and is now imported from '@pediaquiz/types'.

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
  private static readonly SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours session duration

  /**
   * Creates a new quiz session in Firestore.
   * A new document is created in the 'quizSessions' collection, and the
   * user's 'activeSessionId' field is updated to link to this new session.
   * @param userId - The ID of the user starting the session.
   * @param mode - The mode of the quiz (e.g., 'practice', 'quiz', 'custom').
   * @param mcqIds - An array of MCQ IDs to be included in the session.
   * @returns A Promise resolving to the ID of the newly created session.
   */
  static async createSession(userId: string, mode: QuizSession['mode'], mcqIds: string[]): Promise<string> {
    const sessionDocRef = doc(collection(db, this.COLLECTION)); // Reference for a new document
    const sessionId = sessionDocRef.id; // Get the auto-generated ID
    const expiresAt = new Date(Date.now() + this.SESSION_DURATION_MS); // Calculate session expiry

    // Prepare session data object, ensuring Firestore Timestamp types for dates
    const sessionData: Omit<QuizSession, 'id' | 'createdAt' | 'expiresAt'> & {
      createdAt: ReturnType<typeof serverTimestamp>;
      expiresAt: Timestamp;
    } = {
      userId, mode, mcqIds, currentIndex: 0, answers: {}, markedForReview: [], isFinished: false,
      createdAt: serverTimestamp(), // Use Firestore server timestamp for creation time
      expiresAt: Timestamp.fromDate(expiresAt) // Store expiry as Firestore Timestamp
    };

    const userDocRef = doc(db, this.USER_COLLECTION, userId); // Reference to the user document

    // Perform operations atomically using Promise.all.
    // For more complex multi-document writes that require strong consistency,
    // Firestore transactions should be considered.
    await Promise.all([
      setDoc(sessionDocRef, sessionData), // Create the session document
      updateDoc(userDocRef, { activeSessionId: sessionId }) // Link session to user
    ]);

    return sessionId; // Return the new session ID
  }

  /**
   * Retrieves a quiz session from Firestore.
   * This method checks for session existence, user ownership, and expiry.
   * If an expired session is found, it is automatically deleted, and the
   * user's activeSessionId is cleared.
   * @param sessionId - The ID of the session to retrieve.
   * @param userId - The ID of the user requesting the session (for ownership verification).
   * @returns A Promise resolving to the QuizSession object or null if not found,
   *          does not belong to the user, or has expired.
   */
  static async getSession(sessionId: string, userId: string): Promise<QuizSession | null> {
    const sessionRef = doc(db, this.COLLECTION, sessionId);
    const sessionDoc = await getDoc(sessionRef);

    // Check if session exists and belongs to the correct user
    if (!sessionDoc.exists() || sessionDoc.data().userId !== userId) {
      return null;
    }

    const data = sessionDoc.data();
    // Convert Firestore Timestamp to Date object for application use
    const expiresAt = (data.expiresAt as Timestamp).toDate();

    // Check if the session has expired
    if (new Date() > expiresAt) {
      // Clean up expired session and update user's active session
      await this.deleteSession(sessionId);
      const userDocRef = doc(db, this.USER_COLLECTION, userId);
      await updateDoc(userDocRef, { activeSessionId: null });
      return null;
    }

    // Return the session data, ensuring createdAt is also converted to Date
    return {
      id: sessionId,
      ...data,
      createdAt: (data.createdAt as Timestamp).toDate(),
      expiresAt, // Already converted above
    } as QuizSession;
  }

  /**
   * Updates an existing quiz session document in Firestore.
   * This method uses `setDoc` with `merge: true` to update specific fields
   * without overwriting the entire document.
   * @param sessionId - The ID of the session to update.
   * @param updates - A partial QuizSession object containing fields to update.
   *                  Allows for updating date fields with Firestore Timestamp types.
   */
  static async updateSession(
    sessionId: string,
    updates: Partial<Omit<QuizSession, 'id' | 'createdAt' | 'expiresAt'>> & {
      createdAt?: ReturnType<typeof serverTimestamp>;
      expiresAt?: Timestamp;
    }
  ): Promise<void> {
    // Use merge: true to update specific fields without overwriting the entire document
    await setDoc(doc(db, this.COLLECTION, sessionId), updates, { merge: true });
  }

  /**
   * Deletes a quiz session document from Firestore.
   * Note: This method only deletes the session document itself.
   * Calling code is responsible for clearing the `activeSessionId` from the user document
   * if this deletion is not part of an expiry cleanup (which `getSession` handles).
   * @param sessionId - The ID of the session to delete.
   */
  static async deleteSession(sessionId: string): Promise<void> {
    await deleteDoc(doc(db, this.COLLECTION, sessionId));
  }
}