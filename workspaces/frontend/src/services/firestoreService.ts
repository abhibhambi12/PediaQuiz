// workspaces/frontend/src/services/firestoreService.ts
import { collection, getDocs, query, where, Timestamp, QueryDocumentSnapshot, documentId } from "firebase/firestore";
import { db } from "@/firebase";
import type { AppData, Topic, Chapter, MCQ, Flashcard, LabValue, UserUpload } from "@pediaquiz/types";

// Helper to normalize topic/chapter IDs - needed for local filtering
const normalizeId = (name: string): string => {
  if (typeof name !== 'string') return 'unknown';
  return name.replace(/\s+/g, '_').toLowerCase();
};

export async function getAppData(): Promise<AppData> {
  try {
    const [
      generalTopicSnapshot,
      marrowTopicSnapshot,
      masterMcqSnapshot,
      marrowMcqSnapshot,
      flashcardSnapshot,
      keyClinicalTopicsSnapshot,
    ] = await Promise.all([
      getDocs(collection(db, "Topics")),
      getDocs(collection(db, "MarrowTopics")),
      getDocs(collection(db, "MasterMCQ")),
      getDocs(collection(db, "MarrowMCQ")),
      getDocs(collection(db, "Flashcards")),
      getDocs(collection(db, "KeyClinicalTopics")),
    ]);

    const allMcqs: MCQ[] = [];
    masterMcqSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
        const data = doc.data();
        allMcqs.push({ ...data, id: doc.id, source: 'Master', topicId: normalizeId(data.topic), chapterId: normalizeId(data.chapter), createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date() } as MCQ);
    });
    marrowMcqSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
        const data = doc.data();
        allMcqs.push({ ...data, id: doc.id, source: 'Marrow', topicId: normalizeId(data.topicId || data.topic), chapterId: normalizeId(data.chapterId || data.chapter), createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date() } as MCQ);
    });

    const allFlashcards: Flashcard[] = flashcardSnapshot.docs.map((doc: QueryDocumentSnapshot) => {
        const data = doc.data();
        return { ...data, id: doc.id, topicId: normalizeId(data.topic), chapterId: normalizeId(data.chapter), topicName: data.topic, chapterName: data.chapter, createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date() } as Flashcard;
    });
    
    const labValues: LabValue[] = [];
    const mcqCounts = new Map<string, number>();
    allMcqs.forEach(mcq => {
        const key = `${mcq.topicId}_${mcq.chapterId}`;
        mcqCounts.set(key, (mcqCounts.get(key) || 0) + 1);
    });

    const flashcardCounts = new Map<string, number>();
    allFlashcards.forEach(fc => {
        const key = `${fc.topicId}_${fc.chapterId}`;
        flashcardCounts.set(key, (flashcardCounts.get(key) || 0) + 1);
    });

    const topicsMap = new Map<string, Topic>();

    // Process General Topics
    generalTopicSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
        const data = doc.data();
        const topicId = normalizeId(doc.id);
        const topicName = data.name || doc.id;
        const rawChapters = (data.chapters || []) as any[];
        
        const chapters: Chapter[] = rawChapters.map((chapterName: string): Chapter => {
            const chapterId = normalizeId(chapterName);
            const countKey = `${topicId}_${chapterId}`;
            return { 
                id: chapterId, 
                name: chapterName, 
                mcqCount: mcqCounts.get(countKey) || 0,
                flashcardCount: flashcardCounts.get(countKey) || 0,
                topicId: topicId, 
                source: 'General' 
            };
        }).sort((a, b) => a.name.localeCompare(b.name));
        
        topicsMap.set(topicId, {
          id: topicId, name: topicName, chapters: chapters, chapterCount: chapters.length,
          totalMcqCount: chapters.reduce((sum, ch) => sum + ch.mcqCount, 0),
          totalFlashcardCount: chapters.reduce((sum, ch) => sum + ch.flashcardCount, 0),
          source: 'General'
        });
    });

    // Process Marrow Topics
    marrowTopicSnapshot.docs.forEach((doc: QueryDocumentSnapshot) => {
        const data = doc.data();
        const topicId = doc.id; // Marrow topics use the doc ID as the topicId
        const topicName = data.name;
        const rawChapters = (data.chapters || []) as any[];

        const chapters: Chapter[] = rawChapters.map((chData: any): Chapter => {
            const chapterId = chData.id;
            const countKey = `${topicId}_${chapterId}`;
            return { 
                ...chData, 
                id: chapterId,
                mcqCount: mcqCounts.get(countKey) || 0,
                flashcardCount: flashcardCounts.get(countKey) || 0,
                topicId: topicId,
                source: 'Marrow'
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        topicsMap.set(topicId, {
            id: topicId, name: topicName, chapters: chapters, chapterCount: chapters.length,
            totalMcqCount: chapters.reduce((sum, ch) => sum + ch.mcqCount, 0),
            totalFlashcardCount: chapters.reduce((sum, ch) => sum + ch.flashcardCount, 0),
            source: 'Marrow'
        });
    });

    const allProcessedTopics = Array.from(topicsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    const keyClinicalTopics: string[] = keyClinicalTopicsSnapshot.docs.map((doc: QueryDocumentSnapshot) => doc.data().name).sort();

    return {
      topics: allProcessedTopics, mcqs: allMcqs, flashcards: allFlashcards,
      labValues: labValues, keyClinicalTopics: keyClinicalTopics,
    };
  } catch (error: any) {
    console.error("Error fetching or processing app data:", error);
    throw new Error(`Failed to load data: ${error.message || "Unknown error."}`);
  }
}

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