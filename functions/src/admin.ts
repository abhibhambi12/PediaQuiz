import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "./firebaseAdmin";
import { ensureAdmin, ensureAuthenticated } from "./utils/auth";
import { convertDocTimestamps } from "./utils/serializers";
import { LIGHT_FUNCTION_OPTIONS, HEAVY_FUNCTION_OPTIONS } from "./config";
import { User, AIConfig, AdminAnalyticsData, ContentGenerationJob, AwaitingReviewData, MCQ, Flashcard, AssignmentSuggestion, Topic, Chapter, ContentStatus } from "@pediaquiz/types";
import { FieldValue } from "firebase-admin/firestore";
import { createAuditLog } from "./utils/audit";
import * as admin from "firebase-admin";
import { ensureAiClientsInitialized } from "./ai";
import { getSanitizedJsonFromAiResponse } from "./utils/ai-helpers";
import { normalizeId } from "./utils/stringHelpers";

function hydrateContentObject(
    partialObject: Partial<MCQ | Flashcard>, 
    type: 'mcq' | 'flashcard', 
    assignment: { topicName: string; chapterName: string; }, 
    userId: string, 
    uploadId: string,
    isMarrow: boolean,
    finalChapterId: string
): MCQ | Flashcard {
    const normalizedTopicId = normalizeId(assignment.topicName);
    const collectionName = isMarrow ? 'MarrowMCQ' : (type === 'mcq' ? 'MasterMCQ' : 'Flashcards');
    const newId = db.collection(collectionName).doc().id;

    let source: MCQ['source'] | Flashcard['source'];
    if (partialObject.source) {
        source = partialObject.source as any;
    } else if (isMarrow) {
        source = type === 'mcq' ? 'Marrow_AI_Generated' : 'Marrow';
    } else {
        source = 'AI_Generated';
    }

    const baseObject = {
        id: newId,
        topicName: assignment.topicName,
        chapterName: assignment.chapterName,
        topicId: normalizedTopicId,
        chapterId: finalChapterId,
        creatorId: userId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        source: source,
        status: 'approved' as ContentStatus,
        uploadId: uploadId,
        tags: partialObject.tags || [],
    };

    if (type === 'mcq') {
        const partialMcq = partialObject as Partial<MCQ>;
        return {
            ...baseObject,
            type: 'mcq',
            question: partialMcq.question || '',
            options: Array.isArray(partialMcq.options) ? partialMcq.options : [],
            answer: partialMcq.answer || '',
            correctAnswer: partialMcq.correctAnswer || '',
            explanation: partialMcq.explanation || '',
            difficulty: partialMcq.difficulty || 'medium',
        };
    } else {
        const partialFc = partialObject as Partial<Flashcard>;
        return {
            ...baseObject,
            type: 'flashcard',
            front: partialFc.front || '',
            back: partialFc.back || '',
        };
    }
}

export const getUsers = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    await ensureAdmin(request);
    const { limit = 50, pageToken } = request.data as { limit?: number; pageToken?: string };
    try {
        const listUsersResult = await admin.auth().listUsers(limit, pageToken);
        const uids = listUsersResult.users.map(u => u.uid);
        if (uids.length === 0) return { users: [], nextPageToken: null };
        const userDocs = await db.collection('users').where('uid', 'in', uids).get();
        const usersData = userDocs.docs.map(doc => convertDocTimestamps(doc.data())) as User[];
        return { users: usersData, nextPageToken: listUsersResult.pageToken };
    } catch (error: any) {
        logger.error("Error listing users:", error);
        throw new HttpsError("internal", "Could not list users.", error.message);
    }
});

export const setUserRole = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const adminId = await ensureAdmin(request);
    const { targetUid, newRole } = request.data as { targetUid: string, newRole: User['role'] };
    if (!['student', 'resident', 'faculty', 'admin'].includes(newRole)) {
        throw new HttpsError('invalid-argument', 'Invalid role specified.');
    }
    try {
        await admin.auth().setCustomUserClaims(targetUid, { role: newRole });
        await db.collection('users').doc(targetUid).update({ role: newRole });
        await createAuditLog({ userId: adminId, message: `Set user role for ${targetUid} to ${newRole}.` });
        return { success: true, message: `User ${targetUid} has been assigned the role: ${newRole}.` };
    } catch (error: any) {
        logger.error(`Failed to set role for user ${targetUid}`, error);
        throw new HttpsError('internal', 'An error occurred while setting the user role.', error.message);
    }
});

export const getAdminReviewJobs = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    await ensureAdmin(request);
    const { pipeline } = request.data as { pipeline: 'general' | 'marrow' };
    const snapshot = await db.collection('contentGenerationJobs')
        .where('pipeline', '==', pipeline)
        .where('status', 'in', ['ocr_review', 'content_review', 'generating_content', 'pending_marrow_extraction', 'pending_marrow_analysis', 'pending_generation_decision', 'pending_assignment'])
        .get();
    const jobs = snapshot.docs.map(doc => convertDocTimestamps(doc.data()));
    jobs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return jobs;
});

export const getAIConfig = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    await ensureAdmin(request);
    const configDoc = await db.collection('adminConfig').doc('ai').get();
    return configDoc.exists ? configDoc.data() as AIConfig : {};
});

export const updateAIConfig = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const adminId = await ensureAdmin(request);
    const config = request.data as AIConfig;
    await db.collection('adminConfig').doc('ai').set({ ...config, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await createAuditLog({ userId: adminId, message: "Updated AI configuration." });
    return { success: true };
});

export const getAdminAnalytics = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    await ensureAdmin(request);
    const [ usersSnap, quizzesSnap, masterMcqCountSnap, marrowMcqCountSnap, flashcardCountSnap ] = await Promise.all([
        db.collection('users').count().get(),
        db.collection('quizResults').count().get(),
        db.collection('MasterMCQ').where('status','==','approved').count().get(),
        db.collection('MarrowMCQ').where('status','==','approved').count().get(),
        db.collection('Flashcards').where('status','==','approved').count().get()
    ]);
    return {
        totalUsers: usersSnap.data().count,
        totalQuizzesCompleted: quizzesSnap.data().count,
        totalContentItems: masterMcqCountSnap.data().count + marrowMcqCountSnap.data().count + flashcardCountSnap.data().count,
        masterMcqCount: masterMcqCountSnap.data().count,
        marrowMcqCount: marrowMcqCountSnap.data().count,
        flashcardCount: flashcardCountSnap.data().count,
        dailyActivity: [], quizModeBreakdown: {}, topContent: [],
    } as AdminAnalyticsData;
});

export const addTag = onCall(LIGHT_FUNCTION_OPTIONS, async(request) => {
    const adminId = await ensureAdmin(request);
    const { tagName } = request.data;
    const tagId = normalizeId(tagName);
    await db.collection('KeyClinicalTopics').doc(tagId).set({ name: tagName.toLowerCase(), createdAt: FieldValue.serverTimestamp() });
    await createAuditLog({ userId: adminId, message: `Added tag: ${tagName}` });
    return { success: true, message: 'Tag added' };
});

export const updateTag = onCall(LIGHT_FUNCTION_OPTIONS, async(request) => {
    const adminId = await ensureAdmin(request);
    const { oldTagName, newTagName } = request.data;
    const oldTagId = normalizeId(oldTagName);
    const newTagId = normalizeId(newTagName);
    if (oldTagId === newTagId) return { success: true, message: `Tag name effectively unchanged.` };
    const oldTagRef = db.collection('KeyClinicalTopics').doc(oldTagId);
    const newTagRef = db.collection('KeyClinicalTopics').doc(newTagId);
    const mcqsSnapshot = await db.collection('MasterMCQ').where('tags', 'array-contains', oldTagName.toLowerCase()).get();
    const marrowMcqsSnapshot = await db.collection('MarrowMCQ').where('tags', 'array-contains', oldTagName.toLowerCase()).get();
    const flashcardsSnapshot = await db.collection('Flashcards').where('tags', 'array-contains', oldTagName.toLowerCase()).get();
    await db.runTransaction(async (transaction) => {
        transaction.delete(oldTagRef);
        transaction.set(newTagRef, { name: newTagName.toLowerCase(), createdAt: FieldValue.serverTimestamp() });
        mcqsSnapshot.docs.forEach(doc => {
            const updatedTags = Array.from(new Set(doc.data().tags.filter((t:string) => t !== oldTagName.toLowerCase()).concat(newTagName.toLowerCase())));
            transaction.update(doc.ref, { tags: updatedTags });
        });
        marrowMcqsSnapshot.docs.forEach(doc => {
            const updatedTags = Array.from(new Set(doc.data().tags.filter((t:string) => t !== oldTagName.toLowerCase()).concat(newTagName.toLowerCase())));
            transaction.update(doc.ref, { tags: updatedTags });
        });
        flashcardsSnapshot.docs.forEach(doc => {
            const updatedTags = Array.from(new Set(doc.data().tags.filter((t:string) => t !== oldTagName.toLowerCase()).concat(newTagName.toLowerCase())));
            transaction.update(doc.ref, { tags: updatedTags });
        });
    });
    await createAuditLog({ userId: adminId, message: `Updated tag from ${oldTagName} to ${newTagName}` });
    return { success: true, message: 'Tag updated' };
});

export const deleteTag = onCall(LIGHT_FUNCTION_OPTIONS, async(request) => {
    const adminId = await ensureAdmin(request);
    const { tagName } = request.data;
    const tagId = normalizeId(tagName);
    const tagRef = db.collection('KeyClinicalTopics').doc(tagId);
    const mcqsSnapshot = await db.collection('MasterMCQ').where('tags', 'array-contains', tagName.toLowerCase()).get();
    const marrowMcqsSnapshot = await db.collection('MarrowMCQ').where('tags', 'array-contains', tagName.toLowerCase()).get();
    const flashcardsSnapshot = await db.collection('Flashcards').where('tags', 'array-contains', tagName.toLowerCase()).get();
    await db.runTransaction(async (transaction) => {
        transaction.delete(tagRef);
        mcqsSnapshot.docs.forEach(doc => transaction.update(doc.ref, { tags: FieldValue.arrayRemove(tagName.toLowerCase()) }));
        marrowMcqsSnapshot.docs.forEach(doc => transaction.update(doc.ref, { tags: FieldValue.arrayRemove(tagName.toLowerCase()) }));
        flashcardsSnapshot.docs.forEach(doc => transaction.update(doc.ref, { tags: FieldValue.arrayRemove(tagName.toLowerCase()) }));
    });
    await createAuditLog({ userId: adminId, message: `Deleted tag: ${tagName}` });
    return { success: true, message: 'Tag deleted' };
});

export const processManualTextInput = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const userId = await ensureAdmin(request);
    const { fileName, rawText, isMarrow } = request.data;
    const pipeline: ContentGenerationJob['pipeline'] = isMarrow ? 'marrow' : 'general';
    const jobRef = db.collection("contentGenerationJobs").doc();
    const newJob: Partial<ContentGenerationJob> = {
        id: jobRef.id, userId, fileName,
        createdAt: FieldValue.serverTimestamp(),
        pipeline, sourceText: rawText, title: fileName,
        status: 'ocr_review'
    };
    await jobRef.set(newJob);
    await createAuditLog({ userId, message: `Manually submitted content: ${fileName}.`, context: { jobId: jobRef.id, pipeline } });
    return { success: true, uploadId: jobRef.id, message: `Content submitted. Job ID: ${jobRef.id}` };
});

export const getStats = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const attemptsSnap = await db.collection('users').doc(userId).collection('attemptedMCQs').get();
    let total = 0;
    let correct = 0;
    const topicPerformance: Record<string, { total: number, correct: number, topic: string }> = {};
    for (const doc of attemptsSnap.docs) {
        const attempt = doc.data().latestAttempt;
        const mcqDoc = await db.collection('MasterMCQ').doc(doc.id).get();
        if (mcqDoc.exists) {
            const topic = mcqDoc.data()?.topicName || 'Unknown';
            if (!topicPerformance[topic]) {
                topicPerformance[topic] = { total: 0, correct: 0, topic };
            }
            topicPerformance[topic].total++;
            total++;
            if (attempt.isCorrect) {
                topicPerformance[topic].correct++;
                correct++;
            }
        }
    }
    return {
        overallStats: { attempted: total, correct: correct, accuracy: total > 0 ? (correct / total) * 100 : 0 },
        topicPerformance: Object.values(topicPerformance).map(t => ({...t, accuracy: t.total > 0 ? (t.correct / t.total) * 100 : 0})).sort((a,b) => b.total - a.total)
    };
});

export const getGeneratedContentForReview = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    await ensureAdmin(request);
    const { jobId } = request.data as { jobId: string };
    const jobDoc = await db.collection('contentGenerationJobs').doc(jobId).get();
    if (!jobDoc.exists) { throw new HttpsError('not-found', 'Job not found.'); }
    const jobData = jobDoc.data() as ContentGenerationJob;
    return (jobData.finalAwaitingReviewData || { mcqs: [], flashcards: [] }) as AwaitingReviewData;
});

export const generateContentFromText = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const userId = await ensureAdmin(request);
    const { jobId, text, mcqCount, flashcardCount } = request.data as { jobId: string, text: string, mcqCount: number, flashcardCount: number };
    const jobRef = db.collection('contentGenerationJobs').doc(jobId);
    try {
        await jobRef.update({ 
            sourceText: text, 
            status: 'generating_content', 
            updatedAt: FieldValue.serverTimestamp(),
            suggestedPlan: { mcqCount, flashcardCount },
        });
        await createAuditLog({ userId, message: `Initiated content generation from OCR text for job ${jobId}.` });
        return { success: true };
    } catch (error: any) {
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion(`Failed to initiate generation: ${error.message}`) });
        throw new HttpsError('internal', `Failed to initiate generation: ${error.message}`);
    }
});

export const updateContentItem = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const adminId = await ensureAdmin(request);
    const { id, type, collectionName, updates } = request.data as { id: string; type: 'mcq' | 'flashcard'; collectionName: 'MasterMCQ' | 'MarrowMCQ' | 'Flashcards'; updates: Partial<MCQ | Flashcard>; };
    if (!['MasterMCQ', 'MarrowMCQ', 'Flashcards'].includes(collectionName)) { throw new HttpsError('invalid-argument', 'Invalid collection name provided.'); }
    const docRef = db.collection(collectionName).doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) { throw new HttpsError('not-found', `Document with ID ${id} not found.`); }
    const sanitizedUpdates = { ...updates };
    delete (sanitizedUpdates as any).id;
    delete (sanitizedUpdates as any).creatorId;
    delete (sanitizedUpdates as any).createdAt;
    await docRef.update({ ...sanitizedUpdates, updatedAt: FieldValue.serverTimestamp(), updatedBy: adminId });
    await createAuditLog({ userId: adminId, message: `Updated ${type} item.`, context: { documentId: id } });
    return { success: true };
});

export const suggestClassification = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    await ensureAdmin(request);
    const { quickModel } = await ensureAiClientsInitialized();
    const { contentText, topicsList } = request.data as { contentText: string; topicsList: string[]; };
    if (!contentText || !topicsList || topicsList.length === 0) { throw new HttpsError('invalid-argument', 'Content text and a list of topics are required.'); }
    try {
        const aiPrompt = `Analyze the following newly generated medical questions and determine the single best-fitting Topic and Chapter for them from the provided list. The content is for a pediatric medical education app. Respond with a strict JSON object containing your best guess: {"suggestedTopic": "Topic Name", "suggestedChapter": "Chapter Name"}.
        Available Topics:
        ${topicsList.join('\n')}
        Content to Analyze:
        ${contentText.substring(0, 8000)}...`; 
        const result = await quickModel.generateContent(aiPrompt);
        const textResponse = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const aiResponse = await getSanitizedJsonFromAiResponse(textResponse);
        return { success: true, suggestedTopic: aiResponse.suggestedTopic, suggestedChapter: aiResponse.suggestedChapter };
    } catch (error: any) {
        throw new HttpsError('internal', `Failed to get AI classification: ${error.message}`);
    }
});

export const resetUpload = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const adminId = await ensureAdmin(request);
    const { uploadId } = request.data as { uploadId: string };
    const jobRef = db.collection('contentGenerationJobs').doc(uploadId);
    const doc = await jobRef.get();
    if (!doc.exists) { throw new HttpsError('not-found', 'Job not found.'); }
    await jobRef.update({ status: 'ocr_review', updatedAt: FieldValue.serverTimestamp() });
    await createAuditLog({ userId: adminId, message: `Reset job ${uploadId}.` });
    return { success: true, message: "Job has been reset." };
});

export const archiveUpload = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const adminId = await ensureAdmin(request);
    const { uploadId } = request.data as { uploadId: string };
    const jobRef = db.collection('contentGenerationJobs').doc(uploadId);
    await jobRef.update({ status: 'archived', updatedAt: FieldValue.serverTimestamp() });
    await createAuditLog({ userId: adminId, message: `Archived job ${uploadId}.` });
    return { success: true, message: "Job archived." };
});

export const reassignContent = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const adminId = await ensureAdmin(request);
    await createAuditLog({ userId: adminId, message: `Reassign content called.` });
    return { success: true, message: "Reassign feature not fully implemented." };
});

export const extractMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const userId = await ensureAdmin(request);
    const { uploadId } = request.data as { uploadId: string };
    const jobRef = db.collection("contentGenerationJobs").doc(uploadId);
    if (!(await jobRef.get()).exists) throw new HttpsError('not-found', 'Job not found.');
    try {
        await jobRef.update({ status: 'pending_marrow_extraction', updatedAt: FieldValue.serverTimestamp() });
        await createAuditLog({ userId, message: `Initiated Marrow extraction for job ${uploadId}.`});
        return { success: true, message: "Marrow extraction started." };
    } catch (error: any) {
        throw new HttpsError('internal', `Failed to start extraction: ${error.message}`);
    }
});

export const generateAndAnalyzeMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const userId = await ensureAdmin(request);
    const { uploadId, count } = request.data as { uploadId: string, count: number };
    const jobRef = db.collection("contentGenerationJobs").doc(uploadId);
    if (!(await jobRef.get()).exists) throw new HttpsError('not-found', 'Job not found.');
    try {
        await jobRef.update({
            suggestedNewMcqCount: count,
            status: 'pending_marrow_analysis',
            updatedAt: FieldValue.serverTimestamp(),
        });
        await createAuditLog({ userId, message: `Initiated Marrow analysis for job ${uploadId}.` });
        return { success: true, message: "Generation and analysis started." };
    } catch (error: any) {
        throw new HttpsError('internal', `Failed to start analysis: ${error.message}`);
    }
});

export const approveMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const userId = await ensureAdmin(request);
    const { uploadId, topicName, chapterName, keyTopics } = request.data as { uploadId: string; topicName: string; chapterName: string; keyTopics: string[] };
    const jobRef = db.collection("contentGenerationJobs").doc(uploadId);
    logger.info(`Starting approveMarrowContent for job ${uploadId}`);
    try {
        await db.runTransaction(async (transaction) => {
            const jobDoc = await transaction.get(jobRef);
            if (!jobDoc.exists) throw new HttpsError('not-found', 'Job not found.');
            const jobData = jobDoc.data() as ContentGenerationJob;
            const stagedContent = jobData.stagedContent;
            if (!stagedContent) throw new HttpsError('failed-precondition', 'No staged content found.');

            const topicId = normalizeId(topicName);
            const chapterId = normalizeId(chapterName);
            const topicRef = db.collection('MarrowTopics').doc(topicId);
            const topicSnapshot = await transaction.get(topicRef);

            const allMcqsToCreate = [...(stagedContent.extractedMcqs || []), ...(stagedContent.generatedMcqs || [])];

            if (!topicSnapshot.exists) {
                // Topic does not exist, create it with the new chapter
                const newChapter: Chapter = {
                    id: chapterId, name: chapterName, mcqCount: 0, flashcardCount: 0,
                    topicId: topicId, source: 'Marrow', topicName: topicName,
                };
                const newTopic: Topic = {
                    id: topicId, name: topicName, chapters: [newChapter], chapterCount: 1,
                    totalMcqCount: 0, totalFlashcardCount: 0, source: 'Marrow',
                };
                transaction.set(topicRef, newTopic);
            } else {
                // Topic exists, check if chapter exists
                const topicData = topicSnapshot.data() as Topic;
                const chapterExists = (topicData.chapters || []).some(c => c.id === chapterId);
                if (!chapterExists) {
                    const newChapter: Chapter = {
                        id: chapterId, name: chapterName, mcqCount: 0, flashcardCount: 0,
                        topicId: topicId, source: 'Marrow', topicName: topicName,
                    };
                    transaction.update(topicRef, { chapters: FieldValue.arrayUnion(newChapter), chapterCount: FieldValue.increment(1) });
                }
            }

            const finalMcqs = allMcqsToCreate.map((mcq: Partial<MCQ>) => {
                const hydrated = hydrateContentObject(mcq, 'mcq', { topicName, chapterName }, userId, uploadId, true, chapterId);
                hydrated.tags = Array.from(new Set([...(hydrated.tags || []), ...keyTopics.map((t: string) => t.toLowerCase())]));
                return hydrated;
            });

            finalMcqs.forEach(mcq => transaction.set(db.collection('MarrowMCQ').doc(mcq.id), mcq));
            transaction.update(jobRef, { status: 'completed', updatedAt: FieldValue.serverTimestamp() });
        });
        await createAuditLog({ userId, message: `Approved Marrow content for job ${uploadId}.`});
        return { success: true, message: `Marrow content approved.` };
    } catch (error: any) {
        logger.error(`Transaction failed for approveMarrowContent job ${uploadId}:`, error);
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion(`Approval transaction failed: ${error.message}`) });
        throw new HttpsError('internal', `Failed to approve Marrow content: ${error.message}`);
    }
});

export const approveContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const userId = await ensureAdmin(request);
    const { uploadId, assignments } = request.data as { uploadId: string, assignments: AssignmentSuggestion[] };
    const jobRef = db.collection("contentGenerationJobs").doc(uploadId);
    logger.info(`Starting approveContent for job ${uploadId}`, { assignments });
    try {
        await db.runTransaction(async (transaction) => {
            const jobDoc = await transaction.get(jobRef);
            if (!jobDoc.exists) { throw new HttpsError('not-found', `Job with ID ${uploadId} not found.`); }
            const isMarrow = jobDoc.data()?.pipeline === 'marrow';
            const topicCollectionName = isMarrow ? 'MarrowTopics' : 'Topics';
            const mcqCollectionName = isMarrow ? 'MarrowMCQ' : 'MasterMCQ';
            for (const assignment of assignments) {
                const { topicName, chapterName, isNewChapter } = assignment;
                const topicId = normalizeId(topicName);
                const topicRef = db.collection(topicCollectionName).doc(topicId);
                const topicSnapshot = await transaction.get(topicRef);
                if (!topicSnapshot.exists) { throw new HttpsError('not-found', `Topic "${topicName}" not found.`); }
                const topicData = topicSnapshot.data() as Topic;
                let finalChapterId = '';
                if (isNewChapter) {
                    finalChapterId = normalizeId(chapterName);
                    const newChapter: Chapter = {
                        id: finalChapterId, name: chapterName, mcqCount: 0, flashcardCount: 0,
                        topicId: topicId, source: isMarrow ? 'Marrow' : 'General', topicName: topicName,
                    };
                    transaction.update(topicRef, { chapters: FieldValue.arrayUnion(newChapter) });
                } else {
                    const existingChapter = (topicData.chapters || []).find(c => c.name === chapterName);
                    if (!existingChapter) { throw new HttpsError('not-found', `Chapter "${chapterName}" not found.`); }
                    finalChapterId = existingChapter.id;
                }
                const newMcqs = (assignment.mcqs || []).map((mcq: Partial<MCQ>) => 
                    hydrateContentObject(mcq, 'mcq', assignment, userId, uploadId, isMarrow, finalChapterId)
                );
                const newFlashcards = (assignment.flashcards || []).map((fc: Partial<Flashcard>) => 
                    hydrateContentObject(fc, 'flashcard', assignment, userId, uploadId, isMarrow, finalChapterId)
                );
                newMcqs.forEach((mcq) => transaction.set(db.collection(mcqCollectionName).doc(mcq.id), mcq));
                newFlashcards.forEach((fc) => transaction.set(db.collection('Flashcards').doc(fc.id), fc));
            }
            transaction.update(jobRef, { status: 'completed', updatedAt: FieldValue.serverTimestamp() });
        });
        await createAuditLog({ userId, message: `Approved and saved content for job ${uploadId}.` });
        return { success: true, message: `Content from job ${uploadId} has been approved and saved successfully.` };
    } catch (error: any) {
        logger.error(`Transaction failed for approveContent job ${uploadId}:`, error);
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion(`Approval transaction failed: ${error.message}`) });
        throw new HttpsError('internal', `Failed to approve content: ${error.message}`);
    }
});

export const findContentByText = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    await ensureAdmin(request);
    const { searchText } = request.data as { searchText: string };
    if (!searchText) { throw new HttpsError('invalid-argument', 'Search text must be provided.'); }
    const results: any[] = [];
    const collectionsToSearch = ['MasterMCQ', 'MarrowMCQ'];
    for (const collection of collectionsToSearch) {
        const snap = await db.collection(collection).where('question', '>=', searchText).where('question', '<=', searchText + '\uf8ff').get();
        snap.forEach(doc => results.push({ collection, id: doc.id, ...doc.data() }));
    }
    const flashcardSnap = await db.collection('Flashcards').where('front', '>=', searchText).where('front', '<=', searchText + '\uf8ff').get();
    flashcardSnap.forEach(doc => results.push({ collection: 'Flashcards', id: doc.id, ...doc.data() }));
    return { results: convertDocTimestamps(results) };
});

export const recalculateAllCounts = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const adminId = await ensureAdmin(request);
    logger.info("Recalculate all content counts triggered by admin.", { adminId });
    const topicCollections = ['Topics', 'MarrowTopics'];
    const batch = db.batch();
    try {
        for (const collectionName of topicCollections) {
            const isMarrow = collectionName === 'MarrowTopics';
            const mcqCollectionName = isMarrow ? 'MarrowMCQ' : 'MasterMCQ';
            const topicsSnap = await db.collection(collectionName).get();
            if (topicsSnap.empty) continue;
            for (const topicDoc of topicsSnap.docs) {
                const topicData = topicDoc.data() as Topic;
                let topicTotalMcqs = 0;
                let topicTotalFlashcards = 0;
                if (!topicData.chapters || !Array.isArray(topicData.chapters)) continue;
                const updatedChapters = await Promise.all(topicData.chapters.map(async (chapter) => {
                    const mcqQuery = db.collection(mcqCollectionName).where('chapterId', '==', chapter.id);
                    const mcqCountSnap = await mcqQuery.count().get();
                    const chapterMcqCount = mcqCountSnap.data().count;
                    const flashcardQuery = db.collection('Flashcards').where('chapterId', '==', chapter.id);
                    const flashcardCountSnap = await flashcardQuery.count().get();
                    const chapterFlashcardCount = flashcardCountSnap.data().count;
                    topicTotalMcqs += chapterMcqCount;
                    topicTotalFlashcards += chapterFlashcardCount;
                    return { ...chapter, mcqCount: chapterMcqCount, flashcardCount: chapterFlashcardCount };
                }));
                batch.update(topicDoc.ref, {
                    chapters: updatedChapters,
                    totalMcqCount: topicTotalMcqs,
                    totalFlashcardCount: topicTotalFlashcards
                });
            }
        }
        await batch.commit();
        const message = "Successfully recalculated and updated all topic and chapter counts.";
        logger.info(message);
        await createAuditLog({ userId: adminId, message: "Triggered a full recount of all content." });
        return { success: true, message };
    } catch (error: any) {
        logger.error("Error during recount process:", error);
        throw new HttpsError('internal', `Failed to recalculate counts: ${error.message}`);
    }
});


export const searchContentById = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    await ensureAdmin(request);
    const { docId } = request.data as { docId: string };
    if (!docId) { throw new HttpsError('invalid-argument', 'A document ID must be provided.'); }
    const collections = ['MasterMCQ', 'MarrowMCQ', 'Flashcards'];
    for (const collection of collections) {
        const docRef = db.collection(collection).doc(docId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            return {
                found: true,
                collection: collection,
                data: convertDocTimestamps(docSnap.data()),
            };
        }
    }
    return { found: false, message: `No content found with ID: ${docId}` };
});