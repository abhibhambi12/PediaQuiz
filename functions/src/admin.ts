import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "./firebaseAdmin";
import { ensureAdmin, ensureAuthenticated } from "./utils/auth";
import { convertDocTimestamps } from "./utils/serializers";
import { LIGHT_FUNCTION_OPTIONS, HEAVY_FUNCTION_OPTIONS } from "./config";
import { User, AIConfig, AdminAnalyticsData, ContentGenerationJob, AwaitingReviewData, Topic, Chapter } from "@pediaquiz/types";
import { FieldValue } from "firebase-admin/firestore";
import { createAuditLog } from "./utils/audit";
import * as admin from "firebase-admin";
import { ensureAiClientsInitialized, extractJsonFromAiResponse } from "./ai";
import { normalizeId } from "./utils/stringHelpers";

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
        .where('status', 'in', ['ocr_review', 'content_review', 'pending_approval', 'pending_assignment_review', 'pending_final_review', 'pending_generation_decision', 'pending_assignment'])
        .orderBy('createdAt', 'desc')
        .get();
    return snapshot.docs.map(doc => convertDocTimestamps(doc.data()));
});

export const getAIConfig = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    await ensureAdmin(request);
    const configDoc = await db.collection('adminConfig').doc('ai').get();
    if (configDoc.exists) {
        return configDoc.data() as AIConfig;
    }
    return {};
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
    const usersSnap = await db.collection('users').get();
    const quizzesSnap = await db.collection('quizResults').get();
    const mcqsSnap = await db.collection('MasterMCQ').where('status','==','approved').count().get();
    const marrowMcqsSnap = await db.collection('MarrowMCQ').where('status','==','approved').count().get();
    const flashcardsSnap = await db.collection('Flashcards').where('status','==','approved').count().get();

    return {
        totalUsers: usersSnap.size,
        totalQuizzesCompleted: quizzesSnap.size,
        totalContentItems: mcqsSnap.data().count + marrowMcqsSnap.data().count + flashcardsSnap.data().count
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

export const extractMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const userId = await ensureAdmin(request);
    const { powerfulModel } = await ensureAiClientsInitialized();
    const { uploadId } = request.data;

    const jobRef = db.collection("contentGenerationJobs").doc(uploadId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) throw new HttpsError('not-found', 'Job not found.');
    const sourceText = jobDoc.data()?.sourceText;
    if (!sourceText) throw new HttpsError('not-found', 'Source text not found in job.');

    try {
        const aiPrompt = `From the following Marrow content, extract all distinct high-yield multiple-choice questions (MCQs) and all distinct standalone explanation paragraphs. For each MCQ, precisely identify the question, its 4 options (A, B, C, D), and the single correct answer letter. For explanations, ensure each paragraph is complete and self-contained, representing a key concept. Return a strict JSON object with two arrays: 'mcqs' and 'orphanExplanations'.
        Example MCQ format: { "question": "...", "options": ["A.", "B.", "C.", "D."], "answer": "A", "explanation": "..." }
        Example Explanation format: "Paragraph of text explaining a concept."
        Content: ${sourceText}`;

        const result = await powerfulModel.generateContent(aiPrompt);
        const aiResponse = extractJsonFromAiResponse(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
        
        const extractedMcqs = (aiResponse.mcqs || []).map((mcq: any) => ({ ...mcq, source: 'Marrow_Extracted' }));
        const orphanExplanations = aiResponse.orphanExplanations || [];

        await jobRef.update({
            stagedContent: { extractedMcqs, orphanExplanations },
            suggestedNewMcqCount: orphanExplanations.length,
            updatedAt: FieldValue.serverTimestamp(),
            status: 'pending_generation_decision'
        });
        await createAuditLog({ userId, message: `Marrow content extracted for job ${uploadId}.`, context: { jobId: uploadId, mcqCount: extractedMcqs.length, explanationCount: orphanExplanations.length } });
        return { success: true, message: `Extracted ${extractedMcqs.length} MCQs and ${orphanExplanations.length} explanations.` };
    } catch (error: any) {
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion(`Marrow extraction failed: ${error.message}`) });
        throw new HttpsError('internal', `Failed to extract content: ${error.message}`);
    }
});

export const generateAndAnalyzeMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const userId = await ensureAdmin(request);
    const { powerfulModel, quickModel } = await ensureAiClientsInitialized();
    const { uploadId, count } = request.data;

    const jobRef = db.collection("contentGenerationJobs").doc(uploadId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) throw new HttpsError('not-found', 'Job not found.');
    
    const orphanExplanations = jobDoc.data()?.stagedContent?.orphanExplanations || [];
    if (count > orphanExplanations.length) throw new HttpsError('invalid-argument', 'Count exceeds available orphan explanations.');

    try {
        const explanationsToGenerateFrom = orphanExplanations.slice(0, count).join('\n\n');
        let generatedMcqs: any[] = [];
        if (explanationsToGenerateFrom) {
            const aiPrompt = `Generate exactly ${count} high-quality multiple-choice questions from the following medical explanations provided from Marrow content. For each MCQ, provide a clear question, 4 distinct options (A, B, C, D), the single correct answer letter, and a detailed explanation focusing on clinical relevance and key concepts. Make them challenging but fair, with plausible distractors. Assign 3-5 relevant, specific tags (e.g., 'anatomy', 'diagnosis', 'treatment') to each MCQ. Assign a difficulty level (easy, medium, hard). All tags should be lowercase. Provide the output in strict JSON format:
            [{"question": "...", "options": ["...", "...", "...", "..."], "answer": "A", "explanation": "...", "tags": ["...", "..."], "difficulty": "medium"}]
            Explanations: ${explanationsToGenerateFrom}`;

            const result = await powerfulModel.generateContent(aiPrompt);
            const generatedBatch = extractJsonFromAiResponse(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]');
            generatedMcqs = (generatedBatch || []).map((mcq: any) => ({
                ...mcq,
                source: 'Marrow_AI_Generated',
                difficulty: mcq.difficulty || 'medium',
                tags: (mcq.tags || []).map((tag: string) => tag.toLowerCase()),
            }));
        }

        const currentStagedMcqs = jobDoc.data()?.stagedContent?.extractedMcqs || [];
        const combinedMcqs = [...currentStagedMcqs, ...generatedMcqs];

        const classificationPrompt = `Analyze the main themes, key topics, and clinical relevance from the following combined Marrow MCQs. Suggest the single most suitable existing Marrow Topic Name (e.g., "General Medicine", "Pediatrics") and a specific Chapter Name within that topic (e.g., "Cardiology", "Nephrology") for these questions. Also, list 5-8 comprehensive key topics/tags that cover the entire content. All key topics should be lowercase. Provide the output in strict JSON format:
        {"suggestedTopic": "Topic Name", "suggestedChapter": "Chapter Name", "keyTopics": ["tag1", "tag2", "..."]}.
        If a new topic/chapter is absolutely necessary, explicitly state it, but prioritize existing.
        MCQ content excerpts (questions only, for brevity): ${combinedMcqs.map(mcq => mcq.question).join('\n')}`;

        const classificationResult = await quickModel.generateContent(classificationPrompt);
        const classificationResponse = extractJsonFromAiResponse(classificationResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');

        await jobRef.update({
            stagedContent: {
                extractedMcqs: currentStagedMcqs,
                generatedMcqs: generatedMcqs,
                orphanExplanations: orphanExplanations.slice(count)
            },
            suggestedTopic: classificationResponse.suggestedTopic || 'Uncategorized',
            suggestedChapter: classificationResponse.suggestedChapter || 'Miscellaneous',
            suggestedKeyTopics: (classificationResponse.keyTopics || []).map((tag: string) => tag.toLowerCase()),
            updatedAt: FieldValue.serverTimestamp(),
            status: 'pending_assignment'
        });
        await createAuditLog({ userId, message: `Generated ${generatedMcqs.length} Marrow MCQs for job ${uploadId}.`, context: { jobId: uploadId, generatedCount: generatedMcqs.length } });
        return { success: true, message: `Generated ${generatedMcqs.length} new MCQs and analyzed topics.` };
    } catch (error: any) {
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion(`AI generation/analysis failed: ${error.message}`) });
        throw new HttpsError('internal', `Failed to generate: ${error.message}`);
    }
});

export const approveMarrowContent = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const userId = await ensureAdmin(request);
    const { uploadId, topicName, chapterName, keyTopics } = request.data;
    const jobRef = db.collection("contentGenerationJobs").doc(uploadId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) throw new HttpsError('not-found', 'Job not found.');

    const stagedContent = jobDoc.data()?.stagedContent;
    if (!stagedContent) throw new HttpsError('failed-precondition', 'No staged content found.');

    const normalizedTopicId = normalizeId(topicName);
    const normalizedChapterId = normalizeId(chapterName);

    const allApprovedMcqs: any[] = [...(stagedContent.extractedMcqs || []), ...(stagedContent.generatedMcqs || [])].map((mcq: any) => {
        const newId = db.collection('MarrowMCQ').doc().id;
        return {
            id: newId,
            question: mcq.question || '',
            options: mcq.options || [],
            answer: mcq.answer || '',
            correctAnswer: mcq.correctAnswer || (mcq.answer && mcq.options?.[mcq.answer.charCodeAt(0) - 'A'.charCodeAt(0)]) || mcq.answer || '',
            explanation: mcq.explanation || '',
            topicName: topicName,
            topicId: normalizedTopicId,
            chapterName: chapterName,
            chapterId: normalizedChapterId,
            creatorId: userId,
            createdAt: FieldValue.serverTimestamp(),
            source: mcq.source || 'Marrow_Extracted',
            status: 'approved',
            uploadId: uploadId,
            tags: keyTopics.map((tag: string) => tag.toLowerCase()),
            difficulty: mcq.difficulty || 'medium',
            type: 'mcq',
        };
    });

    await db.runTransaction(async (transaction) => {
        const marrowTopicRef = db.collection('MarrowTopics').doc(normalizedTopicId);
        const topicDoc = await transaction.get(marrowTopicRef) as admin.firestore.DocumentSnapshot<Topic>;

        if (topicDoc.exists) {
            const currentTopicData = topicDoc.data()!;
            let chapters = (currentTopicData.chapters || []).filter((ch: string | Chapter): ch is Chapter => typeof ch === 'object');
            const existingChapterIndex = chapters.findIndex((c: Chapter) => c.id === normalizedChapterId);
            if (existingChapterIndex === -1) {
                chapters.push({ id: normalizedChapterId, name: chapterName, mcqCount: allApprovedMcqs.length, flashcardCount: 0, topicId: normalizedTopicId, topicName, source: 'Marrow' });
            } else {
                chapters[existingChapterIndex].mcqCount = (chapters[existingChapterIndex].mcqCount || 0) + allApprovedMcqs.length;
            }
            transaction.update(marrowTopicRef, {
                chapters: chapters,
                totalMcqCount: FieldValue.increment(allApprovedMcqs.length),
                updatedAt: FieldValue.serverTimestamp(),
            });
        } else {
            const newChapter: Chapter = { id: normalizedChapterId, name: chapterName, mcqCount: allApprovedMcqs.length, flashcardCount: 0, topicId: normalizedTopicId, topicName, source: 'Marrow' };
            transaction.set(marrowTopicRef, {
                id: normalizedTopicId, name: topicName, source: 'Marrow',
                chapters: [newChapter],
                chapterCount: 1,
                totalMcqCount: allApprovedMcqs.length,
                totalFlashcardCount: 0,
                createdAt: FieldValue.serverTimestamp(),
            });
        }
        
        allApprovedMcqs.forEach(mcq => transaction.set(db.collection('MarrowMCQ').doc(mcq.id), mcq));

        for (const topicTag of keyTopics) {
            const tagRef = db.collection('KeyClinicalTopics').doc(normalizeId(topicTag));
            transaction.set(tagRef, { name: topicTag.toLowerCase() }, { merge: true });
        }

        transaction.update(jobRef, { status: 'completed', updatedAt: FieldValue.serverTimestamp() });
    });

    await createAuditLog({ userId, message: `Approved Marrow content for job ${uploadId}.`, context: { jobId: uploadId, mcqCount: allApprovedMcqs.length, topicName, chapterName } });
    return { success: true, message: `Marrow content approved.` };
});

export const getStats = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const attemptsSnap = await db.collection('users').doc(userId).collection('attemptedMCQs').get();
    
    let total = 0;
    let correct = 0;
    const topicPerformance: Record<string, { total: number, correct: number, topic: string }> = {};

    for (const doc of attemptsSnap.docs) {
        const attempt = doc.data().latestAttempt;
        const mcqDoc = await db.collection('MasterMCQ').doc(doc.id).get(); // Simplified: only checks MasterMCQ
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
        overallStats: {
            attempted: total,
            correct: correct,
            accuracy: total > 0 ? (correct / total) * 100 : 0
        },
        topicPerformance: Object.values(topicPerformance)
            .map(t => ({...t, accuracy: t.total > 0 ? (t.correct / t.total) * 100 : 0}))
            .sort((a,b) => b.total - a.total) // Sort by most attempted
    };
});

export const getGeneratedContentForReview = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    await ensureAdmin(request);
    const { jobId } = request.data as { jobId: string };
    const jobDoc = await db.collection('contentGenerationJobs').doc(jobId).get();
    if (!jobDoc.exists) {
        throw new HttpsError('not-found', 'Job not found.');
    }
    const jobData = jobDoc.data() as ContentGenerationJob;
    return (jobData.finalAwaitingReviewData || { mcqs: [], flashcards: [] }) as AwaitingReviewData;
});

export const generateContentFromText = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const userId = await ensureAdmin(request);
    const { jobId, text, mcqCount, flashcardCount } = request.data as { jobId: string, text: string, mcqCount: number, flashcardCount: number };
    const jobRef = db.collection('contentGenerationJobs').doc(jobId);
    const { powerfulModel } = await ensureAiClientsInitialized();

    try {
        await jobRef.update({ sourceText: text, status: 'generating_content', updatedAt: FieldValue.serverTimestamp() });
        const aiPrompt = `Generate exactly ${mcqCount} MCQs and ${flashcardCount} flashcards from the text: ${text}. Return JSON: { \"mcqs\": [...], \"flashcards\": [...] }`;
        const result = await powerfulModel.generateContent(aiPrompt);
        const generatedContent = extractJsonFromAiResponse(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
        
        await jobRef.update({
            finalAwaitingReviewData: generatedContent,
            status: 'content_review',
            updatedAt: FieldValue.serverTimestamp(),
        });

        await createAuditLog({ userId, message: `Generated content from OCR text for job ${jobId}.` });
        return { success: true };
    } catch (error: any) {
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion(`Content generation failed: ${error.message}`) });
        throw new HttpsError('internal', `Failed to generate content: ${error.message}`);
    }
});