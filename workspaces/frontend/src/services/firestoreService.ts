// --- CORRECTED FILE: workspaces/frontend/src/services/firestoreService.ts ---

import { collection, getDocs, query, where, Timestamp, QueryDocumentSnapshot, documentId } from "firebase/firestore";
import { db } from "@/firebase";
import type { Topic, Chapter, MCQ, Flashcard, UserUpload } from "@pediaquiz/types";

/**
 * Fetches all topics and their chapters, including calculated MCQ/Flashcard counts.
 * This is the new, efficient way to get the main structure of the app content.
 */
export async function getTopicsAndChapters(): Promise<Topic[]> {
  try {
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

    const mcqCounts = new Map<string, number>();
    const flashcardCounts = new Map<string, number>();

    const processCounts = (snapshot: any, countsMap: Map<string, number>, type: 'mcq' | 'flashcard') => {
        snapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
            const data = doc.data();
            const topicId = data.topicId;
            const chapterId = data.chapterId;
            if(topicId && chapterId) {
                const key = `${topicId}_${chapterId}`;
                countsMap.set(key, (countsMap.get(key) || 0) + 1);
            }
        });
    };
    
    processCounts(masterMcqSnapshot, mcqCounts, 'mcq');
    processCounts(marrowMcqSnapshot, mcqCounts, 'mcq');
    processCounts(flashcardSnapshot, flashcardCounts, 'flashcard');
    
    const topicsMap = new Map<string, Topic>();

    const processTopics = (snapshot: any, source: 'General' | 'Marrow') => {
        snapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
            const data = doc.data();
            const topicId = doc.id;
            
            const chapters: Chapter[] = (data.chapters || []).map((chapterData: any): Chapter => {
                const chapterName = chapterData.name;
                const chapterId = chapterData.id;
                const countKey = `${topicId}_${chapterId}`;
                return { 
                    id: chapterId, 
                    name: chapterName, 
                    mcqCount: mcqCounts.get(countKey) || 0, 
                    flashcardCount: flashcardCounts.get(countKey) || 0, 
                    topicId: topicId,
                    source: source,
                    summaryNotes: chapterData.summaryNotes || null,
                    originalTextRefIds: chapterData.originalTextRefIds || []
                };
            }).sort((a: Chapter, b: Chapter) => a.name.localeCompare(b.name));

            const totalMcqCount = chapters.reduce((sum, ch) => sum + ch.mcqCount, 0);
            const totalFlashcardCount = chapters.reduce((sum, ch) => sum + ch.flashcardCount, 0);
            
            topicsMap.set(topicId, {
                id: topicId,
                name: data.name,
                chapters,
                chapterCount: chapters.length,
                totalMcqCount,
                totalFlashcardCount,
                source
            });
        });
    };

    processTopics(generalTopicSnapshot, 'General');
    processTopics(marrowTopicSnapshot, 'Marrow');
    
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
        const mcqQuery = query(collection(db, 'MasterMCQ'), where('chapterId', '==', chapterId), where('status', '==', 'approved'));
        const marrowMcqQuery = query(collection(db, 'MarrowMCQ'), where('chapterId', '==', chapterId), where('status', '==', 'approved'));
        const flashcardQuery = query(collection(db, 'Flashcards'), where('chapterId', '==', chapterId), where('status', '==', 'approved'));

        const [mcqSnapshot, marrowMcqSnapshot, flashcardSnapshot] = await Promise.all([
            getDocs(mcqQuery), getDocs(marrowMcqQuery), getDocs(flashcardQuery)
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