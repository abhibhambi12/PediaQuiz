// functions/src/content.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "./firebaseAdmin";
import { ensureAuthenticated } from "./utils/auth";
import { convertDocTimestamps } from "./utils/serializers";
import { LIGHT_FUNCTION_OPTIONS } from "./config";
import type { AppData, Topic, MCQ, Flashcard, UserUpload, SearchContentCallableData } from "@pediaquiz/types";
import { FieldPath } from "firebase-admin/firestore";

export const getAppData = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureAuthenticated(request);
    try {
        const [topicsSnap, marrowTopicsSnap, keyTopicsSnap] = await Promise.all([
            db.collection('Topics').get(),
            db.collection('MarrowTopics').get(),
            db.collection('KeyClinicalTopics').get()
        ]);

        const topics = topicsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), source: 'General' } as Topic));
        const marrowTopics = marrowTopicsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), source: 'Marrow' } as Topic));
        
        const allTopics = [...topics, ...marrowTopics];
        const keyClinicalTopics = keyTopicsSnap.docs.map(doc => doc.data().name as string);

        const appData: AppData = { topics: allTopics, mcqs: [], flashcards: [], keyClinicalTopics };
        
        return convertDocTimestamps(appData);
    } catch (error: any) {
        logger.error("Error fetching app data:", error);
        throw new HttpsError("internal", "Failed to fetch application data.", error.message);
    }
});

export const getChapterContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureAuthenticated(request);
    const { chapterId } = request.data as { chapterId: string };
    if (!chapterId) {
        throw new HttpsError("invalid-argument", "A chapterId must be provided.");
    }
    
    try {
        const [mcqsSnap, marrowMcqsSnap, flashcardsSnap] = await Promise.all([
            db.collection('MasterMCQ').where('chapterId', '==', chapterId).where('status', 'in', ['approved', null]).get(),
            db.collection('MarrowMCQ').where('chapterId', '==', chapterId).where('status', '==', 'approved').get(),
            db.collection('Flashcards').where('chapterId', '==', chapterId).where('status', 'in', ['approved', null]).get()
        ]);

        const mcqs = mcqsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'mcq' } as MCQ));
        const marrowMcqs = marrowMcqsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'mcq' } as MCQ));
        const flashcards = flashcardsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'flashcard' } as Flashcard));

        return convertDocTimestamps({ mcqs: [...mcqs, ...marrowMcqs], flashcards });
    } catch (error: any) {
        logger.error(`Error fetching content for chapter ${chapterId}:`, error);
        throw new HttpsError("internal", "Failed to fetch chapter content.", error.message);
    }
});

export const getMcqsByIds = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureAuthenticated(request);
    const { mcqIds } = request.data as { mcqIds: string[] };
    if (!mcqIds || mcqIds.length === 0) {
        return { mcqs: [] };
    }

    const chunks: string[][] = [];
    for (let i = 0; i < mcqIds.length; i += 30) {
        chunks.push(mcqIds.slice(i, i + 30));
    }

    const results: MCQ[] = [];
    for (const chunk of chunks) {
        const [masterSnap, marrowSnap] = await Promise.all([
            db.collection('MasterMCQ').where(FieldPath.documentId(), 'in', chunk).get(),
            db.collection('MarrowMCQ').where(FieldPath.documentId(), 'in', chunk).get(),
        ]);
        masterSnap.forEach(doc => results.push({ id: doc.id, ...doc.data(), type: 'mcq' } as MCQ));
        marrowSnap.forEach(doc => results.push({ id: doc.id, ...doc.data(), type: 'mcq' } as MCQ));
    }
    
    const orderedResults = mcqIds.map(id => results.find(mcq => mcq.id === id)).filter(Boolean) as MCQ[];
    
    return { mcqs: convertDocTimestamps(orderedResults) };
});

export const getTags = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureAuthenticated(request);
    const tagsSnap = await db.collection('KeyClinicalTopics').orderBy('name').get();
    return { tags: tagsSnap.docs.map(doc => doc.data().name as string) };
});

export const getQuestionsByTag = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureAuthenticated(request);
    const { tagName } = request.data as { tagName: string };
    
    const results: MCQ[] = [];
    const [masterSnap, marrowSnap] = await Promise.all([
        db.collection('MasterMCQ').where('status', 'in', ['approved', null]).where('tags', 'array-contains', tagName).get(),
        db.collection('MarrowMCQ').where('status', '==', 'approved').where('tags', 'array-contains', tagName).get(),
    ]);

    masterSnap.forEach(doc => results.push({ id: doc.id, ...doc.data(), type: 'mcq' } as MCQ));
    marrowSnap.forEach(doc => results.push({ id: doc.id, ...doc.data(), type: 'mcq' } as MCQ));
    
    return { mcqs: convertDocTimestamps(results) };
});

export const getUserUploads = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { uploadIds } = request.data as { uploadIds: string[] };
    if (!uploadIds || uploadIds.length === 0) return { uploads: [] };

    const uploads: UserUpload[] = [];
    const chunkSize = 30;
    for (let i = 0; i < uploadIds.length; i += chunkSize) {
        const chunk = uploadIds.slice(i, i + chunkSize);
        const uploadsSnap = await db.collection('contentGenerationJobs').where(FieldPath.documentId(), 'in', chunk).get();
        uploadsSnap.forEach(doc => {
            if (doc.data().userId === userId || request.auth?.token.role === 'admin') {
                uploads.push({ id: doc.id, ...doc.data() } as UserUpload);
            }
        });
    }

    return { uploads: convertDocTimestamps(uploads) };
});

// --- FINAL BUILD FIX: IMPLEMENT MISSING FUNCTION ---
// This function was referenced in `api.ts` and called by the client, but it was
// never implemented. This implementation resolves the critical build error.
export const searchContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureAuthenticated(request);
    const { query } = request.data as SearchContentCallableData;

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
        throw new HttpsError('invalid-argument', 'A search query with at least 3 characters must be provided.');
    }
    
    const lowerCaseQuery = query.toLowerCase().trim();
    
    const mcqQuery = db.collectionGroup('MasterMCQ').where('tags', 'array-contains', lowerCaseQuery).limit(20).get();
    const marrowMcqQuery = db.collectionGroup('MarrowMCQ').where('tags', 'array-contains', lowerCaseQuery).limit(20).get();
    const flashcardQuery = db.collectionGroup('Flashcards').where('tags', 'array-contains', lowerCaseQuery).limit(20).get();

    const [mcqSnap, marrowMcqSnap, flashcardSnap] = await Promise.all([mcqQuery, marrowMcqQuery, flashcardQuery]);
    
    const mcqs = mcqSnap.docs.map(doc => doc.data() as MCQ);
    const marrowMcqs = marrowMcqSnap.docs.map(doc => doc.data() as MCQ);
    const flashcards = flashcardSnap.docs.map(doc => doc.data() as Flashcard);

    return {
        mcqs: convertDocTimestamps([...mcqs, ...marrowMcqs]),
        flashcards: convertDocTimestamps(flashcards),
    };
});