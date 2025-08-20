import { db, functions } from '@/firebase';
import {
    collection,
    getDocs,
    doc,
    getDoc,
    query,
    where,
    documentId,
    Timestamp,
    orderBy,
    QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type {
    Topic,
    Chapter,
    MCQ,
    Flashcard,
    UserUpload,
    CreateCustomTestCallableData,
    SearchContentCallableData,
} from '@pediaquiz/types';
import { normalizeId } from '@/utils/helpers';

// Callable Function references (kept here as they interact directly with Firestore entities like Topics)
const createCustomTestFn = httpsCallable<CreateCustomTestCallableData, { success: boolean, testId: string, questions: string[] }>(functions, 'createCustomTest');
const searchContentFn = httpsCallable<SearchContentCallableData, { mcqs: MCQ[], flashcards: Flashcard[] }>(functions, 'searchContent');

/**
 * Fetches all topics (General and Marrow) and calculates their MCQ/Flashcard counts
 * by querying content collections.
 */
export const getTopics = async (): Promise<Topic[]> => {
    try {
        // Fetch all approved MCQs and Flashcards to accurately count them per chapter/topic.
        // This is necessary because counts are not automatically aggregated in topic/chapter docs.
        const [
            generalTopicSnapshot,
            marrowTopicSnapshot,
            masterMcqSnapshot,
            marrowMcqSnapshot,
            flashcardSnapshot,
        ] = await Promise.all([
            getDocs(collection(db, "Topics")),
            getDocs(collection(db, "MarrowTopics")),
            getDocs(query(collection(db, "MasterMCQ"), where('status', '==', 'approved'))),
            getDocs(query(collection(db, "MarrowMCQ"), where('status', '==', 'approved'))),
            getDocs(query(collection(db, "Flashcards"), where('status', '==', 'approved'))),
        ]);

        const allMcqs: MCQ[] = [
            ...masterMcqSnapshot.docs.map((doc: QueryDocumentSnapshot) => ({ ...doc.data(), id: doc.id } as MCQ)),
            ...marrowMcqSnapshot.docs.map((doc: QueryDocumentSnapshot) => ({ ...doc.data(), id: doc.id } as MCQ)),
        ];
        const allFlashcards: Flashcard[] = flashcardSnapshot.docs.map((doc: QueryDocumentSnapshot) => ({ ...doc.data(), id: doc.id } as Flashcard));

        // Create count maps for efficient lookup by normalized topic_chapter ID
        const mcqCounts = new Map<string, number>();
        allMcqs.forEach(mcq => {
            const topicId = normalizeId(mcq.topicId || mcq.topicName);
            const chapterId = normalizeId(mcq.chapterId || mcq.chapterName);
            const key = `${topicId}_${chapterId}`;
            mcqCounts.set(key, (mcqCounts.get(key) || 0) + 1);
        });

        const flashcardCounts = new Map<string, number>();
        allFlashcards.forEach(fc => {
            const topicId = normalizeId(fc.topicId || fc.topicName);
            const chapterId = normalizeId(fc.chapterId || fc.chapterName);
            const key = `${topicId}_${chapterId}`;
            flashcardCounts.set(key, (flashcardCounts.get(key) || 0) + 1);
        });

        const allTopics: Topic[] = [];

        // Process General Topics: Chapters are strings, summaryNotes are in subcollection
        generalTopicSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            const topicId = normalizeId(docSnap.id);
            const topicName = data.name || 'Unnamed Topic';

            const chapters: Chapter[] = (data.chapters || [])
                .filter((ch: any) => typeof ch === 'string' && ch)
                .map((chapterName: string): Chapter => {
                    const chapterId = normalizeId(chapterName);
                    const countKey = `${topicId}_${chapterId}`;
                    return {
                        id: chapterId,
                        name: chapterName,
                        mcqCount: mcqCounts.get(countKey) || 0,
                        flashcardCount: flashcardCounts.get(countKey) || 0,
                        topicId: topicId,
                        source: 'General',
                        topicName: topicName,
                    };
                })
                .sort((a: Chapter, b: Chapter) => a.name.localeCompare(b.name));

            allTopics.push({
                ...data,
                id: topicId,
                name: topicName,
                chapters: chapters,
                chapterCount: chapters.length,
                totalMcqCount: chapters.reduce((sum, ch) => sum + ch.mcqCount, 0),
                totalFlashcardCount: chapters.reduce((sum, ch) => sum + ch.flashcardCount, 0),
                source: 'General',
            } as Topic);
        });

        // Process Marrow Topics: Chapters are objects, summaryNotes are embedded
        marrowTopicSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            const topicId = normalizeId(docSnap.id);
            const topicName = data.name || 'Unnamed Topic';

            const chapters: Chapter[] = (data.chapters || [])
                .filter((ch: any) => ch && typeof ch === 'object' && ch.name)
                .map((chData: any): Chapter => {
                    const chapterId = normalizeId(chData.name); // Normalize name to get ID from Marrow chapter object
                    const countKey = `${topicId}_${chapterId}`;
                    return {
                        ...chData, // Retain existing properties like summaryNotes, sourceUploadIds
                        id: chapterId,
                        name: chData.name,
                        mcqCount: mcqCounts.get(countKey) || 0, // Recalculate from fetched data
                        flashcardCount: flashcardCounts.get(countKey) || 0, // Recalculate from fetched data
                        topicId: topicId,
                        source: 'Marrow',
                        topicName: topicName,
                    };
                })
                .sort((a: Chapter, b: Chapter) => a.name.localeCompare(b.name));

            allTopics.push({
                ...data,
                id: topicId,
                name: topicName,
                chapters: chapters,
                chapterCount: chapters.length,
                totalMcqCount: chapters.reduce((sum, ch) => sum + ch.mcqCount, 0),
                totalFlashcardCount: chapters.reduce((sum, ch) => sum + ch.flashcardCount, 0),
                source: 'Marrow',
            } as Topic);
        });

        // Sort all topics alphabetically before returning
        return allTopics.sort((a, b) => a.name.localeCompare(b.name));

    } catch (error: any) {
        console.error("Error fetching topics and chapters:", error);
        throw new Error(`Failed to load topics: ${error.message || "Unknown error."}`);
    }
};

export async function getChapterContent(chapterId: string): Promise<{ mcqs: MCQ[], flashcards: Flashcard[] }> {
    if (!chapterId) return { mcqs: [], flashcards: [] };
    try {
        const mcqQuery = query(collection(db, 'MasterMCQ'), where('chapterId', '==', chapterId), where('status', '==', 'approved'));
        const marrowMcqQuery = query(collection(db, 'MarrowMCQ'), where('chapterId', '==', chapterId), where('status', '==', 'approved'));
        const flashcardQuery = query(collection(db, 'Flashcards'), where('chapterId', '==', chapterId), where('status', '==', 'approved'));
        const [mcqSnapshot, marrowMcqSnapshot, flashcardSnapshot] = await Promise.all([
            getDocs(mcqQuery),
            getDocs(marrowMcqQuery),
            getDocs(flashcardQuery)
        ]);
        const mcqs: MCQ[] = [
            ...mcqSnapshot.docs.map((doc: QueryDocumentSnapshot) => ({ ...doc.data(), id: doc.id } as MCQ)),
            ...marrowMcqSnapshot.docs.map((doc: QueryDocumentSnapshot) => ({ ...doc.data(), id: doc.id } as MCQ)),
        ];
        const flashcards: Flashcard[] = flashcardSnapshot.docs.map((doc: QueryDocumentSnapshot) => ({ ...doc.data(), id: doc.id } as Flashcard));
        return { mcqs, flashcards };
    } catch (error: any) {
        console.error(`Error fetching content for chapter ${chapterId}:`, error);
        throw new Error(`Failed to load chapter content: ${error.message || "Unknown error."}`);
    }
}

export const getMCQsByIds = async (mcqIds: string[]): Promise<MCQ[]> => {
    if (!mcqIds || mcqIds.length === 0) return [];
    const fetchedMcqs: MCQ[] = [];
    // Firestore 'in' query supports up to 10 items. Chunking is required for more.
    const chunkSize = 10;
    for (let i = 0; i < mcqIds.length; i += chunkSize) {
        const chunk = mcqIds.slice(i, i + chunkSize);
        if (chunk.length === 0) continue; // Should not happen with correct loop, but as a guard

        // Fetch from both MasterMCQ and MarrowMCQ collections
        const masterQuery = query(collection(db, 'MasterMCQ'), where(documentId(), 'in', chunk));
        const marrowQuery = query(collection(db, 'MarrowMCQ'), where(documentId(), 'in', chunk));

        const [masterSnap, marrowSnap] = await Promise.all([getDocs(masterQuery), getDocs(marrowQuery)]);

        masterSnap.forEach((doc: QueryDocumentSnapshot) => fetchedMcqs.push({ id: doc.id, ...doc.data() } as MCQ));
        marrowSnap.forEach((doc: QueryDocumentSnapshot) => fetchedMcqs.push({ id: doc.id, ...doc.data() } as MCQ));
    }
    // Ensure order is preserved and duplicates are handled if any IDs existed in both collections
    const mcqMap = new Map(fetchedMcqs.map((mcq: MCQ) => [mcq.id, mcq]));
    return mcqIds.map(id => mcqMap.get(id)).filter((mcq): mcq is MCQ => !!mcq);
};

export const getFlashcardsByIds = async (flashcardIds: string[]): Promise<Flashcard[]> => {
    if (!flashcardIds || flashcardIds.length === 0) return [];
    const fetchedFlashcards: Flashcard[] = [];
    const chunkSize = 10;
    for (let i = 0; i < flashcardIds.length; i += chunkSize) {
        const chunk = flashcardIds.slice(i, i + chunkSize);
        if (chunk.length === 0) continue;
        const q = query(collection(db, 'Flashcards'), where(documentId(), 'in', chunk));
        const snapshot = await getDocs(q);
        snapshot.forEach((doc: QueryDocumentSnapshot) => fetchedFlashcards.push({ id: doc.id, ...doc.data() } as Flashcard));
    }
    const flashcardMap = new Map(fetchedFlashcards.map((fc: Flashcard) => [fc.id, fc]));
    return flashcardIds.map(id => flashcardMap.get(id)).filter((fc): fc is Flashcard => !!fc);
};

export async function getUserUploadDocuments(uploadIds: string[]): Promise<UserUpload[]> {
    if (!uploadIds || uploadIds.length === 0) return [];
    try {
        const docRef = collection(db, 'contentGenerationJobs');
        const chunkSize = 10;
        const promises: Promise<UserUpload[]>[] = [];
        for (let i = 0; i < uploadIds.length; i += chunkSize) {
            const chunk = uploadIds.slice(i, i + chunkSize);
            if (chunk.length === 0) continue;
            const q = query(docRef, where(documentId(), 'in', chunk));
            promises.push(
                getDocs(q).then(querySnapshot =>
                    querySnapshot.docs.map((doc: QueryDocumentSnapshot) => {
                        const data = doc.data();
                        return { ...data, id: doc.id, createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(), updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : undefined, } as UserUpload;
                    })
                )
            );
        }
        const results = await Promise.all(promises);
        return results.flat();
    } catch (error: any) {
        console.error("Error fetching user upload documents by IDs:", error);
        throw new Error(`Failed to fetch original upload documents: ${error.message || "Unknown error."}`);
    }
}

export const getTags = async (): Promise<string[]> => {
    try {
        const snapshot = await getDocs(collection(db, 'KeyClinicalTopics'));
        // Normalize tags to lowercase when fetched to ensure consistent querying
        return snapshot.docs.map((doc: QueryDocumentSnapshot) => (doc.data().name as string).toLowerCase());
    } catch (error: any) {
        console.error("Error fetching tags:", error);
        throw new Error(`Failed to load tags: ${error.message || "Unknown error."}`);
    }
};

export const getQuestionsByTag = async (tagName: string): Promise<MCQ[]> => {
    if (!tagName) return [];
    try {
        // Ensure tagName is normalized to lowercase for querying
        const normalizedTagName = tagName.toLowerCase();
        const masterQuery = query(collection(db, 'MasterMCQ'), where('tags', 'array-contains', normalizedTagName), where('status', '==', 'approved'));
        const marrowQuery = query(collection(db, 'MarrowMCQ'), where('tags', 'array-contains', normalizedTagName), where('status', '==', 'approved'));
        const [masterSnap, marrowSnap] = await Promise.all([getDocs(masterQuery), getDocs(marrowQuery)]);
        const mcqs: MCQ[] = [];
        masterSnap.forEach(doc => mcqs.push({ id: doc.id, ...doc.data() } as MCQ));
        marrowSnap.forEach(doc => mcqs.push({ id: doc.id, ...doc.data() } as MCQ));
        return mcqs;
    } catch (error: any) {
        console.error(`Error fetching questions for tag "${tagName}":`, error);
        throw new Error(`Failed to load questions for tag: ${error.message || "Unknown error."}`);
    }
};

export const searchContent = async (queryText: string, terms: string[]): Promise<{ mcqs: MCQ[], flashcards: Flashcard[] }> => {
    try {
        const response = await searchContentFn({ query: queryText, terms });
        return response.data;
    } catch (error: any) {
        console.error("Error calling searchContent function:", error);
        throw new Error(`Search failed: ${error.message || "Unknown error."}`);
    }
};

export const getQuestions = async (collectionName: 'MasterMCQ' | 'MarrowMCQ'): Promise<MCQ[]> => {
    const q = query(collection(db, collectionName), where('status', '==', 'approved'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MCQ));
};

export const createCustomTest = async (data: CreateCustomTestCallableData) => {
    return await createCustomTestFn(data);
};