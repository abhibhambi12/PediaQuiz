// workspaces/frontend/src/services/aiService.ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';
import type { 
    ChatMessage, 
    GenerateWeaknessBasedTestCallableData, 
    AddFlashcardAttemptCallableData,
    PlanContentGenerationCallableData,
    ExecuteContentGenerationCallableData,
    ApproveGeneratedContentCallableData,
    ProcessManualTextInputCallableData,
    GetDailyWarmupQuizCallableData
} from '@pediaquiz/types';

/**
 * A generic wrapper for Firebase Callable Functions that handles extracting the `data` property.
 * This simplifies calls in components and hooks.
 * @param functionName The name of the Cloud Function to call.
 * @param data The payload to send to the function.
 * @returns A promise that resolves with the data returned by the function.
 */
const callFirebaseFunction = async <T, R>(functionName: string, data: T): Promise<R> => {
  try {
    const func = httpsCallable<T, R>(functions, functionName);
    const result = await func(data);
    return result.data;
  } catch (error) {
    console.error(`Error calling Firebase function '${functionName}':`, error);
    // Re-throw the error to be caught by react-query's onError handler
    throw error;
  }
};

export const chatWithAssistant = (data: { prompt: string, history: ChatMessage[] }) => 
  callFirebaseFunction<{ prompt: string, history: ChatMessage[] }, { response: string }>('chatWithAssistant', data);

export const generatePerformanceAdvice = (data: { overallAccuracy: number, strongTopics: string[], weakTopics: string[] }) => 
  callFirebaseFunction<{ overallAccuracy: number, strongTopics: string[], weakTopics: string[] }, { advice: string }>('generatePerformanceAdvice', data);

export const generateWeaknessBasedTest = (data: GenerateWeaknessBasedTestCallableData) => 
  callFirebaseFunction<GenerateWeaknessBasedTestCallableData, { mcqIds: string[] }>('generateWeaknessBasedTest', data);

export const updateChapterNotes = (data: { topicId: string, chapterId: string, newSummary: string, source: 'General' | 'Marrow' }) => 
  callFirebaseFunction<{ topicId: string, chapterId: string, newSummary: string, source: 'General' | 'Marrow' }, { success: boolean }>('updateChapterNotes', data);

export const processManualTextInput = (data: ProcessManualTextInputCallableData) => 
  callFirebaseFunction<ProcessManualTextInputCallableData, { success: boolean, uploadId: string, message: string }>('processManualTextInput', data);

export const getDailyWarmupQuiz = (data: Omit<GetDailyWarmupQuizCallableData, 'userId'>) => 
  callFirebaseFunction<Omit<GetDailyWarmupQuizCallableData, 'userId'>, { mcqIds: string[] }>('getDailyWarmupQuiz', data);

export const getQuizSessionFeedback = (data: { quizResultId: string }) => 
  callFirebaseFunction<{ quizResultId: string }, { feedback: string }>('getQuizSessionFeedback', data);

export const getExpandedSearchTerms = (data: { query: string }) => 
  callFirebaseFunction<{ query: string }, { terms: string[] }>('getExpandedSearchTerms', data);

export const generateChapterSummary = (data: { uploadIds: string[] }) => 
  callFirebaseFunction<{ uploadIds: string[] }, { summary: string }>('generateChapterSummary', data);

export const addFlashcardAttempt = (data: AddFlashcardAttemptCallableData) => 
  callFirebaseFunction<AddFlashcardAttemptCallableData, { success: boolean }>('addFlashcardAttempt', data);

export const getHint = (data: { mcqId: string }) => 
  callFirebaseFunction<{ mcqId: string }, { hint: string }>('getHint', data);

export const evaluateFreeTextAnswer = (data: { mcqId: string, userAnswer: string }) => 
  callFirebaseFunction<{ mcqId: string, userAnswer: string }, { isCorrect: boolean, feedback: string }>('evaluateFreeTextAnswer', data);

export const createFlashcardFromMcq = (data: { mcqId: string }) => 
  callFirebaseFunction<{ mcqId: string }, { flashcardId: string }>('createFlashcardFromMcq', data);

export const planContentGeneration = (data: PlanContentGenerationCallableData) => 
  callFirebaseFunction<PlanContentGenerationCallableData, { success: boolean, jobId: string, plan: any }>('planContentGeneration', data);

export const executeContentGeneration = (data: ExecuteContentGenerationCallableData) => 
  callFirebaseFunction<ExecuteContentGenerationCallableData, { success: boolean, message: string }>('executeContentGeneration', data);

export const approveGeneratedContent = (data: ApproveGeneratedContentCallableData) => 
  callFirebaseFunction<ApproveGeneratedContentCallableData, { success: boolean, message: string }>('approveGeneratedContent', data);

export const generateAndStageMarrowMcqs = (data: { uploadId: string, count: number }) => 
  callFirebaseFunction<{ uploadId: string, count: number }, { success: boolean, message: string }>('generateAndStageMarrowMcqs', data);

export const generateGeneralContent = (data: { uploadId: string, count: number }) => 
  callFirebaseFunction<{ uploadId: string, count: number }, { success: boolean, message: string }>('generateGeneralContent', data);

export const resetUpload = (data: { uploadId: string }) =>
  callFirebaseFunction<{ uploadId: string }, { success: boolean, message: string }>('resetUpload', data);

export const archiveUpload = (data: { uploadId: string }) =>
  callFirebaseFunction<{ uploadId: string }, { success: boolean, message: string }>('archiveUpload', data);