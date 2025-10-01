import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { VertexAI, GenerativeModel, Content } from "@google-cloud/vertexai";
import { db } from "./firebaseAdmin";
import { ensureAuthenticated } from "./utils/auth";
import { LOCATION, PROJECT_ID, DEFAULT_AI_CONFIG, LIGHT_FUNCTION_OPTIONS, HEAVY_FUNCTION_OPTIONS } from "./config";
import type { AIConfig, ChatMessage, GetDailyWarmupQuizCallableData, GetMockExamQuestionsCallableData, MCQ, ClientQuizResult, GenerateWeaknessBasedTestCallableData, GoalInput } from "@pediaquiz/types";
import { FieldPath, Timestamp, FieldValue } from "firebase-admin/firestore";
import { createAuditLog } from "./utils/audit";
import { extractJson } from "./utils/stringHelpers";

let vertexAI: VertexAI;
let powerfulModel: GenerativeModel;
let quickModel: GenerativeModel;

export async function getAIConfig(): Promise<AIConfig> {
    const configDoc = await db.collection('adminConfig').doc('ai').get();
    if (configDoc.exists) {
        return configDoc.data() as AIConfig;
    }
    // Return default config with placeholder timestamps if not found
    return {
        ...DEFAULT_AI_CONFIG,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    };
}

export async function ensureAiClientsInitialized() {
    if (!vertexAI) {
        const aiConfig = await getAIConfig();
        vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
        powerfulModel = vertexAI.getGenerativeModel({ model: aiConfig.powerfulModel });
        quickModel = vertexAI.getGenerativeModel({ model: aiConfig.quickModel });
        logger.info("Vertex AI clients initialized with specified models.");
    }
    return { powerfulModel, quickModel };
}

export { extractJson as extractJsonFromAiResponse } from "./utils/stringHelpers";

export const chatWithAssistant = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { powerfulModel } = await ensureAiClientsInitialized();
    const { prompt, history, context } = request.data as { 
        prompt: string, 
        history: ChatMessage[], 
        context?: { mcqId?: string; flashcardId?: string; chapterId?: string; chapterNotes?: string; } 
    };
    
    const chatHistoryForAI: Content[] = history.map((message: ChatMessage) => ({
        role: message.sender === 'user' ? 'user' : 'model',
        parts: [{ text: message.text }]
    }));
    
    let contextPrompt = '';
    if (context?.mcqId) {
        const mcqDoc = await db.collection('MasterMCQ').doc(context.mcqId).get();
        const mcqData = mcqDoc.exists ? mcqDoc.data() : null;
        if (mcqData) contextPrompt += `\n\nContext: This conversation is about the MCQ \"${mcqData.question}\". Explanation: \"${mcqData.explanation || ''}\".`;
    }

    const chat = powerfulModel.startChat({ history: chatHistoryForAI });
    const result = await chat.sendMessage(prompt + contextPrompt);
    
    await createAuditLog({ userId, message: `Used AI Assistant. Prompt: \"${prompt.substring(0, 100)}...\"`});
    return { response: result.response.candidates?.[0]?.content.parts[0].text || "Sorry, I couldn't generate a response." };
});

export const getDailyWarmupQuiz = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureAuthenticated(request);
    const { count = 10 } = request.data as GetDailyWarmupQuizCallableData;
    const mcqsRef = db.collection('MasterMCQ');
    const randomKey = mcqsRef.doc().id;
    
    const snapshot = await mcqsRef
        .where(FieldPath.documentId(), '>=', randomKey)
        .where('status', '==', 'approved')
        .limit(count)
        .get();
    
    let mcqIds = snapshot.docs.map(doc => doc.id);
    if (mcqIds.length < count) {
        const remaining = await mcqsRef
            .where(FieldPath.documentId(), '<', randomKey)
            .where('status', '==', 'approved')
            .limit(count - mcqIds.length)
            .get();
        mcqIds = mcqIds.concat(remaining.docs.map(doc => doc.id));
    }
    
    return { mcqIds };
});

export const generateWeaknessBasedTest = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { testSize } = request.data as GenerateWeaknessBasedTestCallableData;

    const attemptsSnapshot = await db.collection('users').doc(userId).collection('attemptedMCQs')
        .where('latestAttempt.isCorrect', '==', false)
        .limit(testSize * 5)
        .get();
        
    const incorrectAttempts = attemptsSnapshot.docs.map(doc => doc.id);

    if (incorrectAttempts.length === 0) return { mcqIds: [] };

    const selectedIds = incorrectAttempts.sort(() => 0.5 - Math.random()).slice(0, testSize);
    
    await createAuditLog({ userId, message: `Generated a weakness-based test with ${selectedIds.length} questions.` });
    return { mcqIds: selectedIds };
});

export const getDailyGrindPlaylist = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { mcqCount = 10, flashcardCount = 10 } = request.data;
    const now = Timestamp.now();
    const mcqQuery = db.collection('users').doc(userId).collection('attemptedMCQs').where('latestAttempt.nextReviewDate', '<=', now).limit(mcqCount);
    const flashcardQuery = db.collection('users').doc(userId).collection('attemptedFlashcards').where('nextReviewDate', '<=', now).limit(flashcardCount);
    const [mcqSnap, flashcardSnap] = await Promise.all([mcqQuery.get(), flashcardQuery.get()]);
    return { mcqIds: mcqSnap.docs.map(doc => doc.id), flashcardIds: flashcardSnap.docs.map(doc => doc.id) };
});

export const getMockExamQuestions = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    ensureAuthenticated(request);
    const { chapterIds, questionCount } = request.data as GetMockExamQuestionsCallableData;
    if (!chapterIds || chapterIds.length === 0 || !questionCount || questionCount <= 0) {
        throw new HttpsError('invalid-argument', 'Chapter IDs and a positive question count are required.');
    }
    let allMcqIds: string[] = [];
    const chunkSize = 30;
    for (let i = 0; i < chapterIds.length; i += chunkSize) {
        const chunk = chapterIds.slice(i, i + chunkSize);
        const mcqSnap = await db.collection('MasterMCQ').where('chapterId', 'in', chunk).where('status', '==', 'approved').select().get();
        mcqSnap.forEach(doc => allMcqIds.push(doc.id));
    }
    const shuffled = allMcqIds.sort(() => 0.5 - Math.random());
    return { mcqIds: shuffled.slice(0, questionCount) };
});

export const generatePerformanceAdvice = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    ensureAuthenticated(request);
    const { powerfulModel } = await ensureAiClientsInitialized();
    const { overallAccuracy, strongTopics, weakTopics } = request.data;
    const prompt = `Generate personalized study advice and encouragement for a dedicated medical student based on their quiz performance. Frame it positively to motivate continued learning.
    Overall Accuracy: ${overallAccuracy.toFixed(1)}%
    Strong Topics: ${strongTopics.join(', ') || 'N/A'}
    Weak Topics: ${weakTopics.join(', ') || 'N/A'}

    Provide actionable tips, effective study strategies, and strong encouragement to keep them engaged. Conclude with a strong call to action to continue studying. Suggest reviewing specific incorrect questions or starting a weakness test. Use emojis where appropriate to make it more engaging.`;
    const result = await powerfulModel.generateContent(prompt);
    return { advice: result.response.candidates?.[0]?.content?.parts?.[0]?.text || "Could not generate advice." };
});

export const getQuizSessionFeedback = onCall(HEAVY_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { powerfulModel } = await ensureAiClientsInitialized();
    const { quizResultId } = request.data;
    const resultDoc = await db.collection('quizResults').doc(quizResultId).get();
    if (!resultDoc.exists || resultDoc.data()?.userId !== userId) throw new HttpsError("not-found", "Quiz result not found.");
    
    const resultData = resultDoc.data() as ClientQuizResult;
    const mcqIds = resultData.results.map(r => r.mcqId);
    if (mcqIds.length === 0) return { feedback: "No questions to analyze." };

    const mcqDocs = await db.collection('MasterMCQ').where(FieldPath.documentId(), 'in', mcqIds).get();
    const mcqsById = new Map(mcqDocs.docs.map(doc => [doc.id, doc.data() as MCQ]));
    const analysisData = resultData.results.map(r => ({ question: mcqsById.get(r.mcqId)?.question, topic: mcqsById.get(r.mcqId)?.topicName, isCorrect: r.isCorrect }));
    const prompt = `Analyze this pediatric quiz performance. Provide concise, actionable feedback focusing on weak topics. Data: ${JSON.stringify(analysisData)}`;
    const result = await powerfulModel.generateContent(prompt);
    return { feedback: result.response.candidates?.[0]?.content?.parts?.[0]?.text || "Could not generate feedback." };
});

export const getExpandedSearchTerms = onCall(LIGHT_FUNCTION_OPTIONS, async(request) => {
    ensureAuthenticated(request);
    const { quickModel } = await ensureAiClientsInitialized();
    const { query } = request.data;
    const prompt = `Expand the medical search query \"${query}\" into up to 5 highly relevant and clinically related terms or synonyms. Respond with a JSON array of strings.`;
    const result = await quickModel.generateContent(prompt);
    return { terms: extractJson(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]') };
});

export const getHint = onCall(LIGHT_FUNCTION_OPTIONS, async(request) => {
    ensureAuthenticated(request);
    const { quickModel } = await ensureAiClientsInitialized();
    const { mcqId } = request.data;
    const mcqDoc = await db.collection('MasterMCQ').doc(mcqId).get();
    if (!mcqDoc.exists) throw new HttpsError('not-found', 'MCQ not found');
    const prompt = `Provide a short, one-sentence hint for the following MCQ without revealing the answer: ${mcqDoc.data()?.question}`;
    const result = await quickModel.generateContent(prompt);
    return { hint: result.response.candidates?.[0]?.content?.parts?.[0]?.text || 'No hint available.' };
});

export const evaluateFreeTextAnswer = onCall(LIGHT_FUNCTION_OPTIONS, async(request) => {
    ensureAuthenticated(request);
    const { powerfulModel } = await ensureAiClientsInitialized();
    const { mcqId, userAnswer } = request.data;
    const mcqDoc = await db.collection('MasterMCQ').doc(mcqId).get();
    if (!mcqDoc.exists) throw new HttpsError('not-found', 'MCQ not found');
    const correctAnswer = mcqDoc.data()?.correctAnswer;
    const prompt = `Is the user's answer \"${userAnswer}\" a correct or acceptable alternative for \"${correctAnswer}\"? Respond with a JSON object: {\"isCorrect\": boolean, \"feedback\": \"Brief explanation\"}.`;
    const result = await powerfulModel.generateContent(prompt);
    return extractJson(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
});

export const createFlashcardFromMcq = onCall(LIGHT_FUNCTION_OPTIONS, async(request) => {
    const userId = ensureAuthenticated(request);
    const { powerfulModel } = await ensureAiClientsInitialized();
    const { mcqId } = request.data;
    const mcqDoc = await db.collection('MasterMCQ').doc(mcqId).get();
    if (!mcqDoc.exists) throw new HttpsError('not-found', 'MCQ not found');
    const mcq = mcqDoc.data() as MCQ;
    const prompt = `Create a concise flashcard from this MCQ. The front should be a question, the back a direct answer. Front: \"${mcq.question}\", Back: \"${mcq.correctAnswer}\". Explanation: \"${mcq.explanation}\". Respond with a JSON object: {\"front\": \"...\", \"back\": \"...\"}.`;
    const result = await powerfulModel.generateContent(prompt);
    const flashcardData = extractJson(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    const newFlashcardRef = db.collection('Flashcards').doc();
    await newFlashcardRef.set({
        ...flashcardData,
        id: newFlashcardRef.id,
        topicName: mcq.topicName,
        chapterName: mcq.chapterName,
        topicId: mcq.topicId,
        chapterId: mcq.chapterId,
        status: 'approved',
        source: 'AI_Generated_From_MCQ',
        creatorId: userId,
        createdAt: FieldValue.serverTimestamp()
    });
    return { flashcardId: newFlashcardRef.id, message: 'Flashcard created' };
});

export const getDailyGoal = onCall(LIGHT_FUNCTION_OPTIONS, async(request) => {
    ensureAuthenticated(request);
    return { success: true, goal: { title: 'Review 10 MCQs', targetValue: 10, currentValue: 2 }};
});

export const generateQuickFireTest = onCall(LIGHT_FUNCTION_OPTIONS, async(request) => {
    ensureAuthenticated(request);
    const { testSize } = request.data;
    const mcqSnap = await db.collection('MasterMCQ').where('status','==','approved').limit(testSize).get();
    return { mcqIds: mcqSnap.docs.map(d => d.id) };
});

export const evaluateDDx = onCall(HEAVY_FUNCTION_OPTIONS, async(request) => {
    const userId = ensureAuthenticated(request);
    const { powerfulModel } = await ensureAiClientsInitialized();
    const { clinicalFindings, userAnswer } = request.data;
    const aiPrompt = `You are a highly experienced pediatric clinician. Given the following clinical findings, evaluate the user's proposed differential diagnoses.
    1. State if the user's answer is good, acceptable, or needs significant improvement.
    2. Provide concise, high-yield feedback:
       - If correct/acceptable, briefly explain why the user's answers are strong.
       - If incorrect/needs improvement, provide the top 3 most likely diagnoses and briefly explain why.
       - Also, provide 1-2 critical distinguishing features for the top diagnoses.
       - Use relevant emojis frequently (e.g., 🔬, 🩺, 💊, 👶, ❤️‍🩹, 🧠).
    3. Respond with a JSON object: {\"success\": true/false, \"feedback\": \"Your markdown feedback string.\"}. The success field should be true if the user's answer is good or acceptable, false otherwise.
    Clinical Findings: ${clinicalFindings}
    User's Differential Diagnoses: ${userAnswer}`;
    const result = await powerfulModel.generateContent(aiPrompt);
    const aiResponse = extractJson(result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    await createAuditLog({ userId, message: `Submitted DDx. Result: ${aiResponse.success ? 'Success' : 'Needs Work'}.` });
    return { success: aiResponse.success, feedback: aiResponse.feedback };
});

export const suggestNewGoal = onCall(LIGHT_FUNCTION_OPTIONS, async(request) => {
    ensureAuthenticated(request);
    const { weakTopics } = request.data as { weakTopics?: string[] };
    let goal: Partial<GoalInput> = { title: 'Complete 20 general MCQs', targetValue: 20, type: 'mcq_count' };
    if (weakTopics && weakTopics.length > 0) {
        goal = { title: `Practice 15 MCQs on ${weakTopics[0]}`, targetValue: 15, type: 'mcq_count' };
    }
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return { success: true, goal: {...goal, targetDate: endOfToday.toISOString() } };
});