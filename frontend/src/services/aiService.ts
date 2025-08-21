// frontend/services/aiService.ts
// frontend/src/services/aiService.ts
// MODIFIED: Updated callable function definitions to match new types and added new callables
//          for gamification features (e.g., Daily Goal, Quick Fire, Theme).
//          Moved createCustomTest to firestoreService.ts.
//          CRITICAL: Re-enabled processManualTextInput as requested.
//          Added new callable wrappers for approved features.

import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { functions } from '@/firebase';
// Removed 'type' prefix to allow direct import and usage as values (e.g., in httpsCallable)
import {
    ChatMessage,
    MCQ,
    QuizResult,
    ToggleBookmarkCallableData,
    DeleteContentItemCallableData,
    Flashcard,
    Chapter,
    Topic,
    AssignmentSuggestion,
    UserUpload,
    SearchContentCallableData,
    ChatWithAssistantCallableData,
    GeneratePerformanceAdviceCallableData,
    GetQuizSessionFeedbackCallableData,
    GenerateChapterSummaryCallableData,
    GenerateWeaknessBasedTestCallableData,
    GetDailyWarmupQuizCallableData,
    GetHintCallableData,
    EvaluateFreeTextAnswerCallableData,
    CreateFlashcardFromMcqCallableData,
    CreateCustomTestCallableData, // Still imported for reference but will be moved from AI service
    GetDailyGoalCallableData,
    GenerateQuickFireTestCallableData,
    UpdateThemeCallableData,
    SendPushNotificationCallableData,
    ProcessManualTextInputCallableData,
    ExtractMarrowContentCallableData,
    GenerateAndAnalyzeMarrowContentCallableData,
    ApproveMarrowContentCallableData,
    ApproveContentCallableData,
    ResetUploadCallableData,
    ArchiveUploadCallableData,
    ReassignContentCallableData,
    PrepareForRegenerationCallableData,
    SuggestClassificationCallableData,
    PrepareBatchGenerationCallableData,
    StartAutomatedBatchGenerationCallableData,
    AutoAssignContentCallableData,
    UpdateChapterNotesCallableData,
    GetExpandedSearchTermsCallableData,
    GoalInput, // FIX: Import GoalInput
    GenerateCramSheetCallableData, // NEW: For Cram Sheets
    GetDailyGrindPlaylistCallableData, // NEW: For Daily Grind
    GetMockExamQuestionsCallableData, // NEW: For Mock Exam
    EvaluateDDxCallableData, // NEW: For DDx Game
    SuggestNewGoalCallableData, // NEW: For AI suggested goals
} from '@pediaquiz/types';

// Centralized callable function references (prefixed with _ for internal use)
const _chatWithAssistant = httpsCallable<ChatWithAssistantCallableData, { response: string }>(functions, 'chatWithAssistant');
const _generatePerformanceAdvice = httpsCallable<GeneratePerformanceAdviceCallableData, { advice: string }>(functions, 'generatePerformanceAdvice');
// Added difficulty to Pick<MCQ> for generateWeaknessBasedTestCallableData
const _generateWeaknessBasedTest = httpsCallable<{ allMcqs: Pick<MCQ, 'id' | 'topicId' | 'chapterId' | 'source' | 'tags' | 'difficulty'>[], testSize: number }, { mcqIds: string[] }>(functions, 'generateWeaknessBasedTest');
const _getDailyWarmupQuiz = httpsCallable<void, { mcqIds: string[] }>(functions, 'getDailyWarmupQuiz');
const _getQuizSessionFeedback = httpsCallable<GetQuizSessionFeedbackCallableData, { feedback: string }>(functions, 'getQuizSessionFeedback');
const _getExpandedSearchTerms = httpsCallable<{ query: string }, { terms: string[] }>(functions, 'getExpandedSearchTerms');
const _getHint = httpsCallable<{ mcqId: string }, { hint: string }>(functions, 'getHint');
const _evaluateFreeTextAnswer = httpsCallable<{ mcqId: string, userAnswer: string }, { isCorrect: boolean, feedback: string }>(functions, 'evaluateFreeTextAnswer');
const _createFlashcardFromMcq = httpsCallable<{ mcqId: string }, { flashcardId: string, message: string }>(functions, 'createFlashcardFromMcq');


// Admin Callable Function References
const _processManualTextInput = httpsCallable<ProcessManualTextInputCallableData, { success: boolean, uploadId: string, message: string }>(functions, 'processManualTextInput');
const _extractMarrowContent = httpsCallable<ExtractMarrowContentCallableData, { mcqCount: number, explanationCount: number }>(functions, 'extractMarrowContent');
const _generateAndAnalyzeMarrowContent = httpsCallable<GenerateAndAnalyzeMarrowContentCallableData, { success: boolean, message?: string }>(functions, 'generateAndAnalyzeMarrowContent');
const _approveMarrowContent = httpsCallable<ApproveMarrowContentCallableData, { success: boolean, message?: string }>(functions, 'approveMarrowContent');
const _approveContent = httpsCallable<ApproveContentCallableData, { success: boolean, message?: string }>(functions, 'approveContent');
const _resetUpload = httpsCallable<ResetUploadCallableData, { success: boolean, message: string }>(functions, 'resetUpload');
const _archiveUpload = httpsCallable<ArchiveUploadCallableData, { success: boolean, message: string }>(functions, 'archiveUpload');
const _reassignContent = httpsCallable<ReassignContentCallableData, { success: boolean, message: string }>(functions, 'reassignContent');
const _prepareForRegeneration = httpsCallable<PrepareForRegenerationCallableData, { success: boolean, message: string }>(functions, 'prepareForRegeneration');
const _suggestClassification = httpsCallable<SuggestClassificationCallableData, { success: boolean, suggestedTopic?: string, suggestedChapter?: string }>(functions, 'suggestClassification');
const _prepareBatchGeneration = httpsCallable<PrepareBatchGenerationCallableData, { success: boolean, totalBatches: number }>(functions, 'prepareBatchGeneration');
const _startAutomatedBatchGeneration = httpsCallable<StartAutomatedBatchGenerationCallableData, { success: boolean, message: string }>(functions, 'startAutomatedBatchGeneration');
const _autoAssignContent = httpsCallable<AutoAssignContentCallableData, { success: boolean, suggestions: AssignmentSuggestion[] }>(functions, 'autoAssignContent');
const _updateChapterNotes = httpsCallable<UpdateChapterNotesCallableData, { success: boolean, message: string }>(functions, 'updateChapterNotes');
const _generateChapterSummary = httpsCallable<GenerateChapterSummaryCallableData, { summary: string }>(functions, 'generateChapterSummary');

// NEW Callable Function References for Gamification and New Features
const _getDailyGoal = httpsCallable<GetDailyGoalCallableData, { success: boolean, goal: GoalInput }>(functions, 'getDailyGoal');
const _generateQuickFireTest = httpsCallable<GenerateQuickFireTestCallableData, { mcqIds: string[] }>(functions, 'generateQuickFireTest');
const _updateTheme = httpsCallable<UpdateThemeCallableData, { success: boolean, message: string }>(functions, 'updateTheme');
const _sendPushNotification = httpsCallable<SendPushNotificationCallableData, { success: boolean, message: string }>(functions, 'sendPushNotification');
const _generateCramSheet = httpsCallable<GenerateCramSheetCallableData, { success: boolean, cramSheetId: string }>(functions, 'generateCramSheet'); // NEW
const _getDailyGrindPlaylist = httpsCallable<GetDailyGrindPlaylistCallableData, { mcqIds: string[], flashcardIds: string[] }>(functions, 'getDailyGrindPlaylist'); // NEW
const _getMockExamQuestions = httpsCallable<GetMockExamQuestionsCallableData, { mcqIds: string[] }>(functions, 'getMockExamQuestions'); // NEW
const _evaluateDDx = httpsCallable<EvaluateDDxCallableData, { success: boolean, feedback: string }>(functions, 'evaluateDDx'); // NEW
const _suggestNewGoal = httpsCallable<SuggestNewGoalCallableData, { success: boolean, goal: GoalInput }>(functions, 'suggestNewGoal'); // NEW


// Exported functions for frontend components to use

// AI Chat & Advice
export const chatWithAssistant = async (data: ChatWithAssistantCallableData): Promise<HttpsCallableResult<{ response: string }>> => {
    return _chatWithAssistant(data);
};

export const generatePerformanceAdvice = async (data: GeneratePerformanceAdviceCallableData): Promise<HttpsCallableResult<{ advice: string }>> => {
    return _generatePerformanceAdvice(data);
};

// Quiz & Session Generation
// Updated type of allMcqs to include 'difficulty'
export const generateWeaknessBasedTest = async (data: { allMcqs: Pick<MCQ, 'id' | 'topicId' | 'chapterId' | 'source' | 'tags' | 'difficulty'>[], testSize: number }): Promise<HttpsCallableResult<{ mcqIds: string[] }>> => {
    return _generateWeaknessBasedTest(data);
};

export const getDailyWarmupQuiz = async (): Promise<HttpsCallableResult<{ mcqIds: string[] }>> => {
    return _getDailyWarmupQuiz();
};

export const getQuizSessionFeedback = async (data: GetQuizSessionFeedbackCallableData): Promise<HttpsCallableResult<{ feedback: string }>> => {
    return _getQuizSessionFeedback(data);
};

export const getExpandedSearchTerms = async (data: { query: string }): Promise<HttpsCallableResult<{ terms: string[] }>> => {
    return _getExpandedSearchTerms(data);
};

export const getHint = async (data: { mcqId: string }): Promise<HttpsCallableResult<{ hint: string }>> => {
    return _getHint(data);
};

// Explicitly export evaluateFreeTextAnswer
export const evaluateFreeTextAnswer = async (data: { mcqId: string, userAnswer: string }): Promise<HttpsCallableResult<{ isCorrect: boolean, feedback: string }>> => {
    return _evaluateFreeTextAnswer(data);
};

export const createFlashcardFromMcq = async (data: { mcqId: string }): Promise<HttpsCallableResult<{ flashcardId: string, message: string }>> => {
    return _createFlashcardFromMcq(data);
};

// Admin Content Pipeline Functions
export const processManualTextInput = async (data: ProcessManualTextInputCallableData): Promise<HttpsCallableResult<{ success: boolean, uploadId: string, message: string }>> => {
    return await _processManualTextInput(data);
};

export const extractMarrowContent = async (data: ExtractMarrowContentCallableData): Promise<HttpsCallableResult<{ mcqCount: number, explanationCount: number }>> => {
    return await _extractMarrowContent(data);
};

export const generateAndAnalyzeMarrowContent = async (data: GenerateAndAnalyzeMarrowContentCallableData): Promise<HttpsCallableResult<{ success: boolean, message?: string }>> => {
    return await _generateAndAnalyzeMarrowContent(data);
};

export const approveMarrowContent = async (data: ApproveMarrowContentCallableData): Promise<HttpsCallableResult<{ success: boolean, message?: string }>> => {
    return await _approveMarrowContent(data);
};

export const approveContent = async (data: ApproveContentCallableData): Promise<HttpsCallableResult<{ success: boolean, message?: string }>> => {
    return await _approveContent(data);
};

export const resetUpload = async (data: ResetUploadCallableData): Promise<HttpsCallableResult<{ success: boolean, message: string }>> => {
    return await _resetUpload(data);
};

export const archiveUpload = async (data: ArchiveUploadCallableData): Promise<HttpsCallableResult<{ success: boolean, message: string }>> => {
    return await _archiveUpload(data);
};

export const reassignContent = async (data: ReassignContentCallableData): Promise<HttpsCallableResult<{ success: boolean, message: string }>> => {
    return await _reassignContent(data);
};

export const prepareForRegeneration = async (data: PrepareForRegenerationCallableData): Promise<HttpsCallableResult<{ success: boolean, message: string }>> => {
    return await _prepareForRegeneration(data);
};

export const suggestClassification = async (data: SuggestClassificationCallableData): Promise<HttpsCallableResult<{ success: boolean, suggestedTopic?: string, suggestedChapter?: string }>> => {
    return await _suggestClassification(data);
};

export const prepareBatchGeneration = async (data: PrepareBatchGenerationCallableData): Promise<HttpsCallableResult<{ success: boolean, totalBatches: number }>> => {
    return await _prepareBatchGeneration(data);
};

export const startAutomatedBatchGeneration = async (data: StartAutomatedBatchGenerationCallableData): Promise<HttpsCallableResult<{ success: boolean, message: string }>> => {
    return await _startAutomatedBatchGeneration(data);
};

export const autoAssignContent = async (data: AutoAssignContentCallableData): Promise<HttpsCallableResult<{ success: boolean, suggestions: AssignmentSuggestion[] }>> => {
    return await _autoAssignContent(data);
};

export const updateChapterNotes = async (data: UpdateChapterNotesCallableData): Promise<HttpsCallableResult<{ success: boolean, message: string }>> => {
    return await _updateChapterNotes(data);
};

export const generateChapterSummary = async (data: GenerateChapterSummaryCallableData): Promise<HttpsCallableResult<{ summary: string }>> => {
    return await _generateChapterSummary(data);
};

// NEW: Gamification and Engagement Callables
export const getDailyGoal = async (data: GetDailyGoalCallableData): Promise<HttpsCallableResult<{ success: boolean, goal: GoalInput }>> => {
    return _getDailyGoal(data);
};

export const generateQuickFireTest = async (data: GenerateQuickFireTestCallableData): Promise<HttpsCallableResult<{ mcqIds: string[] }>> => {
    return _generateQuickFireTest(data);
};

export const updateTheme = async (data: UpdateThemeCallableData): Promise<HttpsCallableResult<{ success: boolean, message: string }>> => {
    return _updateTheme(data);
};

export const sendPushNotification = async (data: SendPushNotificationCallableData): Promise<HttpsCallableResult<{ success: boolean, message: string }>> => {
    return _sendPushNotification(data);
};

export const generateCramSheet = async (data: GenerateCramSheetCallableData): Promise<HttpsCallableResult<{ success: boolean, cramSheetId: string }>> => {
    return _generateCramSheet(data);
};

// Export getDailyGrindPlaylist
export const getDailyGrindPlaylist = async (data: GetDailyGrindPlaylistCallableData): Promise<HttpsCallableResult<{ mcqIds: string[], flashcardIds: string[] }>> => {
    return _getDailyGrindPlaylist(data);
};

export const getMockExamQuestions = async (data: GetMockExamQuestionsCallableData): Promise<HttpsCallableResult<{ mcqIds: string[] }>> => {
    return _getMockExamQuestions(data);
};

export const evaluateDDx = async (data: EvaluateDDxCallableData): Promise<HttpsCallableResult<{ success: boolean, feedback: string }>> => {
    return _evaluateDDx(data);
};

export const suggestNewGoal = async (data: SuggestNewGoalCallableData): Promise<HttpsCallableResult<{ success: boolean, goal: GoalInput }>> => {
    return _suggestNewGoal(data);
};