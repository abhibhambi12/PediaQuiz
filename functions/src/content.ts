import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "./firebaseAdmin";
import { ensureAuthenticated } from "./utils/auth";
import { convertDocTimestamps } from "./utils/serializers";
import { LIGHT_FUNCTION_OPTIONS } from "./config";
import type { AppData, Topic, MCQ, Flashcard, UserUpload } from "@pediaquiz/types";
import { FieldPath } from "firebase-admin/firestore";

export const getAppData = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureAuthenticated(request);

    try {
        const [topicsSnap, marrowTopicsSnap, mcqsSnap, marrowMcqsSnap, flashcardsSnap, keyTopicsSnap] = await Promise.all([
            db.collection('Topics').get(),
            db.collection('MarrowTopics').get(),
            db.collection('MasterMCQ').where('status', '==', 'approved').get(),
            db.collection('MarrowMCQ').where('status', '==', 'approved').get(),
            db.collection('Flashcards').where('status', '==', 'approved').get(),
            db.collection('KeyClinicalTopics').get()
        ]);

        const topics = topicsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Topic));
        const marrowTopics = marrowTopicsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Topic));
        
        const allTopics = [...topics, ...marrowTopics];

        const mcqs = mcqsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'mcq' } as MCQ));
        const marrowMcqs = marrowMcqsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'mcq' } as MCQ));
        
        const allMcqs = [...mcqs, ...marrowMcqs];

        const flashcards = flashcardsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'flashcard' } as Flashcard));
            
        const keyClinicalTopics = keyTopicsSnap.docs.map(doc => doc.data().name as string);

        const appData: AppData = { topics: allTopics, mcqs: allMcqs, flashcards, keyClinicalTopics };
        
        return convertDocTimestamps(appData);
    } catch (error: any) {
        logger.error("Error fetching app data:", error);
        throw new HttpsError("internal", "Failed to fetch application data.", error.message);
    }
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
        db.collection('MasterMCQ').where('status', '==', 'approved').where('tags', 'array-contains', tagName).get(),
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