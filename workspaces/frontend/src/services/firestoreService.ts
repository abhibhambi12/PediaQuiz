// FILE: workspaces/frontend/src/services/firestoreService.ts

import { collection, getDocs, query, where, Timestamp, QueryDocumentSnapshot, documentId } from "firebase/firestore";
import { db } from "@/firebase";
import type { Topic, Chapter, MCQ, Flashcard, UserUpload } from "@pediaquiz/types";

const normalizeId = (name: string): string => {
  if (typeof name !== 'string') return 'unknown';
  return name.replace(/\s+/g, '_').toLowerCase();
};

/**
 * Fetches all topics and their chapters, including MCQ/Flashcard counts.
 * This replaces the "topics" part of the old getAppData.
 */
export async function getTopicsAndChapters(): Promise<Topic[]> {
  try {
    // Fetch all approved MCQs and Flashcards to calculate counts
    const [
      generalTopicSnapshot,
      marrowTopicSnapshot,
      masterMcqSnapshot,
      marrowMcqSnapshot,
      flashcardSnapshot
    ] = await Promise.all([
      getDocs(collection(db, "Topics")),
      getDocs(collection(db, "MarrowTopics")),
      getDocs(query(collection(db, "MasterMCQ"), where("status", "==", "approved"))),
      getDocs(query(collection(db, "MarrowMCQ"), where("status", "==", "approved"))),
      getDocs(query(collection(db, "Flashcards"), where("status", "==", "approved")))
    ]);

    // Calculate MCQ and Flashcard counts per topic/chapter
    const mcqCounts = new Map<string, number>();
    const flashcardCounts = new Map<string, number>();

    [...masterMcqSnapshot.docs, ...marrowMcqSnapshot.docs].forEach(doc => {
      const data = doc.data();
      const topicId = normalizeId(data.topicId || data.topic);
      const chapterId = normalizeId(data.chapterId || data.chapter);
      const key = `${topicId}_${chapterId}`;
      mcqCounts.set(key, (mcqCounts.get(key) || 0) + 1);
    });

    flashcardSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const topicId = normalizeId(data.topicId || data.topic);
      const chapterId = normalizeId(data.chapterId || data.chapter);
      const key = `${topicId}_${chapterId}`;
      flashcardCounts.set(key, (flashcardCounts.get(key) || 0) + 1);
    });

    const topicsMap = new Map<string, Topic>();

    // Process General Topics
    generalTopicSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const topicId = normalizeId(doc.id);
        const topicName = data.name || doc.id;
        const chapters: Chapter[] = (data.chapters || []).map((chapterData: any): Chapter => {
            const chapterName = typeof chapterData === 'string' ? chapterData : chapterData.name;
            const chapterId = normalizeId(chapterName);
            const countKey = `${topicId}_${chapterId}`;
            return { id: chapterId, name: chapterName, mcqCount: mcqCounts.get(countKey) || 0, flashcardCount: flashcardCounts.get(countKey) || 0, topicId, source: 'General' };
        }).sort((a: Chapter, b: Chapter) => a.name.localeCompare(b.name));
        
        topicsMap.set(topicId, {
          id: topicId, name: topicName, chapters, chapterCount: chapters.length,
          totalMcqCount: chapters.reduce((sum, ch) => sum + ch.mcqCount, 0),
          totalFlashcardCount: chapters.reduce((sum, ch) => sum + ch.flashcardCount, 0),
          source: 'General'
        });
    });
    
    // Process Marrow Topics
    marrowTopicSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const topicIdBase = normalizeId(doc.id);
        const topicName = data.name;
        const chapters: Chapter[] = (data.chapters || []).map((chData: any): Chapter => {
            const chapterId = normalizeId(chData.id);
            const countKey = `${topicIdBase}_${chapterId}`;
            return { ...chData, id: chapterId, mcqCount: mcqCounts.get(countKey) || 0, flashcardCount: flashcardCounts.get(countKey) || 0, topicId: topicIdBase, source: 'Marrow' };
        }).sort((a: Chapter, b: Chapter) => a.name.localeCompare(b.name));

        // Handle potential ID conflicts between General and Marrow topics
        let finalTopicId = topicIdBase;
        if (topicsMap.has(topicIdBase) && topicsMap.get(topicIdBase)?.source === 'General') {
             finalTopicId = `${topicIdBase}_marrow`;
             let counter = 1;
             while(topicsMap.has(finalTopicId)) {
                 finalTopicId = `${topicIdBase}_marrow_${counter}`;
                 counter++;
             }
        }

        topicsMap.set(finalTopicId, {
            id: finalTopicId, name: topicName, chapters, chapterCount: chapters.length,
            totalMcqCount: chapters.reduce((sum, ch) => sum + ch.mcqCount, 0),
            totalFlashcardCount: chapters.reduce((sum, ch) => sum + ch.flashcardCount, 0),
            source: 'Marrow'
        });
    });

    return Array.from(topicsMap.values()).sort((a: Topic, b: Topic) => a.name.localeCompare(b.name));

  } catch (error: any) {
    console.error("Error fetching topics and chapters:", error);
    throw new Error(`Failed to load topics: ${error.message || "Unknown error."}`);
  }
}

/**
 * Fetches all MCQs and Flashcards specifically for a given chapter.
 * This is used for ChapterDetailPage and MCQSessionPage to load content on demand.
 */
export async function getChapterContent(chapterId: string): Promise<{ mcqs: MCQ[]; flashcards: Flashcard[] }> {
    if (!chapterId) return { mcqs: [], flashcards: [] };

    try {
        const mcqQuery = query(
            collection(db, 'MasterMCQ'),
            where('chapterId', '==', chapterId),
            where('status', '==', 'approved')
        );
        const marrowMcqQuery = query(
            collection(db, 'MarrowMCQ'),
            where('chapterId', '==', chapterId),
            where('status', '==', 'approved')
        );
        const flashcardQuery = query(
            collection(db, 'Flashcards'),
            where('chapterId', '==', chapterId),
            where('status', '==', 'approved')
        );

        const [mcqSnapshot, marrowMcqSnapshot, flashcardSnapshot] = await Promise.all([
            getDocs(mcqQuery),
            getDocs(marrowMcqQuery),
            getDocs(flashcardQuery)
        ]);

        const mcqs: MCQ[] = [
            ...mcqSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as MCQ)),
            ...marrowMcqSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as MCQ)),
        ];

        const flashcards: Flashcard[] = flashcardSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Flashcard));

        return { mcqs, flashcards };
    } catch (error: any) {
        console.error(`Error fetching content for chapter ${chapterId}:`, error);
        throw new Error(`Failed to load chapter content: ${error.message || "Unknown error."}`);
    }
}

/**
 * Fetches UserUpload documents by their IDs. Used for retrieving original text references.
 */
export async function getUserUploadDocuments(uploadIds: string[]): Promise<UserUpload[]> {
    if (!uploadIds || uploadIds.length === 0) return [];
    try {
        const docRef = collection(db, 'userUploads');
        const q = query(docRef, where(documentId(), 'in', uploadIds));
        const querySnapshot = await getDocs(q);
        const uploads: UserUpload[] = [];
        querySnapshot.forEach((doc: QueryDocumentSnapshot) => {
            const data = doc.data();
            uploads.push({
                ...data, id: doc.id,
                createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
                updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : undefined,
            } as UserUpload);
        });
        return uploads;
    } catch (error) {
        console.error("Error fetching user upload documents by IDs:", error);
        throw error;
    }
}

// NOTE: The old getAppData() is implicitly deprecated by removing its implementation.
// Components should be refactored to use getTopicsAndChapters, getChapterContent, or other specific queries.
// During Step C, we will update all frontend components to use these new, granular functions.