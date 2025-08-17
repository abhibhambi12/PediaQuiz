import { db, functions } from '../firebase';
import {
    collection,
    getDocs,
    doc,
    getDoc,
    setDoc,
    query,
    where,
    documentId,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { Topic, MCQ, Flashcard, Chapter } from '@pediaquiz/types';

// Callable Function for backend search
const searchContentFn = httpsCallable(functions, 'searchContent');
const updateChapterNotesFn = httpsCallable(functions, 'updateChapterNotes');

/**
 * Fetches all topics from BOTH 'Topics' and 'MarrowTopics' collections and merges them.
 * This is now the primary function for getting all topic data for the app.
 */
export const getTopics = async (): Promise<Topic[]> => {
    const topicsQuery = getDocs(collection(db, "Topics"));
    const marrowTopicsQuery = getDocs(collection(db, "MarrowTopics"));

    const [topicsSnapshot, marrowTopicsSnapshot] = await Promise.all([topicsQuery, marrowTopicsQuery]);

    const allTopics: Topic[] = [];

    // Process 'Topics' (General) which have a simple array of strings for chapters
    topicsSnapshot.forEach(doc => {
        const data = doc.data();
        const chaptersAsStrings = data.chapters as string[] || [];
        allTopics.push({
            id: doc.id,
            name: data.name,
            source: 'General',
            // Convert string chapters into the full Chapter object structure
            chapters: chaptersAsStrings.map(chapterName => ({
                id: chapterName.replace(/\s+/g, '_').toLowerCase(),
                name: chapterName,
                mcqCount: 0, // Note: Counts are not stored in this structure
                flashcardCount: 0,
                topicId: doc.id,
                source: 'General',
                topicName: data.name,
            })),
            chapterCount: chaptersAsStrings.length,
            totalMcqCount: data.totalMcqCount || 0,
            totalFlashcardCount: data.totalFlashcardCount || 0,
        });
    });

    // Process 'MarrowTopics' which already have the correct chapter object structure
    marrowTopicsSnapshot.forEach(doc => {
        const data = doc.data();
        allTopics.push({
            id: doc.id,
            name: data.name,
            source: 'Marrow',
            chapters: (data.chapters || []).map((ch: Chapter) => ({ ...ch, source: 'Marrow', topicName: data.name })),
            chapterCount: data.chapterCount || 0,
            totalMcqCount: data.totalMcqCount || 0,
            totalFlashcardCount: data.totalFlashcardCount || 0,
        });
    });

    return allTopics;
};

/**
 * Fetches multiple MCQs by their document IDs from BOTH MasterMCQ and MarrowMCQ.
 * This is essential for loading quiz sessions correctly.
 */
export const getMCQsByIds = async (mcqIds: string[]): Promise<MCQ[]> => {
    if (!mcqIds || mcqIds.length === 0) return [];

    const fetchedMcqs: MCQ[] = [];
    const chunkSize = 30; // Firestore 'in' query supports up to 30 elements

    for (let i = 0; i < mcqIds.length; i += chunkSize) {
        const chunk = mcqIds.slice(i, i + chunkSize);

        const masterQuery = query(collection(db, 'MasterMCQ'), where(documentId(), 'in', chunk));
        const marrowQuery = query(collection(db, 'MarrowMCQ'), where(documentId(), 'in', chunk));

        const [masterSnap, marrowSnap] = await Promise.all([getDocs(masterQuery), getDocs(marrowQuery)]);

        masterSnap.forEach(doc => fetchedMcqs.push({ id: doc.id, ...doc.data() } as MCQ));
        marrowSnap.forEach(doc => fetchedMcqs.push({ id: doc.id, ...doc.data() } as MCQ));
    }

    // Return MCQs in the same order as the input IDs
    return mcqIds.map(id => fetchedMcqs.find(mcq => mcq.id === id)).filter((mcq): mcq is MCQ => !!mcq);
};

/**
 * Fetches all content (MCQs and Flashcards) for a given chapter.
 * It handles the different data structures for General vs. Marrow content.
 */
export const getChapterContent = async (topicSource: 'General' | 'Marrow', chapterName: string): Promise<{ mcqs: MCQ[], flashcards: Flashcard[] }> => {
    const mcqCollection = topicSource === 'Marrow' ? 'MarrowMCQ' : 'MasterMCQ';

    const mcqQuery = query(collection(db, mcqCollection), where('chapter', '==', chapterName));
    const flashcardQuery = query(collection(db, 'Flashcards'), where('chapter', '==', chapterName));

    const [mcqSnap, flashcardSnap] = await Promise.all([getDocs(mcqQuery), getDocs(flashcardQuery)]);

    const mcqs = mcqSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MCQ));
    const flashcards = flashcardSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Flashcard));

    return { mcqs, flashcards };
};

/**
 * Calls the secure, scalable backend function for content search.
 */
export const searchContent = async (query: string, terms: string[] = []): Promise<{ mcqs: MCQ[], flashcards: Flashcard[] }> => {
    try {
        const result = await searchContentFn({ query, terms });
        return result.data as { mcqs: MCQ[], flashcards: Flashcard[] };
    } catch (error) {
        console.error("Error searching content:", error);
        return { mcqs: [], flashcards: [] };
    }
};

/**
 * Calls the secure backend function to save updated chapter notes.
 */
export const updateChapterNotes = async (data: { topicId: string, chapterId: string, newSummary: string, source: 'General' | 'Marrow' }) => {
    return await updateChapterNotesFn(data);
};