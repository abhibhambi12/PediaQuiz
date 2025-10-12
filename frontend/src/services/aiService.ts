import { createApiCaller } from '@/utils/apiClient';
import type {
  ChatWithAssistantCallableData,
  GeneratePerformanceAdviceCallableData,
  GetQuizSessionFeedbackCallableData,
  GenerateChapterSummaryCallableData,
  GenerateWeaknessBasedTestCallableData,
  GetDailyWarmupQuizCallableData,
  GetExpandedSearchTermsCallableData,
  GetHintCallableData,
  EvaluateFreeTextAnswerCallableData,
  CreateFlashcardFromMcqCallableData,
  GoalInput,
  GetDailyGoalCallableData,
  GenerateQuickFireTestCallableData,
  EvaluateDDxCallableData,
  SuggestNewGoalCallableData,
  GenerateCramSheetCallableData,
  GetDailyGrindPlaylistCallableData,
  GetMockExamQuestionsCallableData,
  GenerateAndAnalyzeMarrowContentCallableData,
  SuggestClassificationCallableData,
} from '@pediaquiz/types';

const _chatWithAssistant = createApiCaller<
  ChatWithAssistantCallableData,
  { response: string }
>('chatWithAssistant');
const _generatePerformanceAdvice = createApiCaller<
  GeneratePerformanceAdviceCallableData,
  { advice: string }
>('generatePerformanceAdvice');
const _generateWeaknessBasedTest = createApiCaller<
  GenerateWeaknessBasedTestCallableData,
  { mcqIds: string[] }
>('generateWeaknessBasedTest');
const _getDailyWarmupQuiz = createApiCaller<
  GetDailyWarmupQuizCallableData,
  { mcqIds: string[] }
>('getDailyWarmupQuiz');
const _getQuizSessionFeedback = createApiCaller<
  GetQuizSessionFeedbackCallableData,
  { feedback: string }
>('getQuizSessionFeedback');
const _getExpandedSearchTerms = createApiCaller<
  GetExpandedSearchTermsCallableData,
  { terms: string[] }
>('getExpandedSearchTerms');
const _getHint = createApiCaller<GetHintCallableData, { hint: string }>('getHint');
const _evaluateFreeTextAnswer = createApiCaller<
  EvaluateFreeTextAnswerCallableData,
  { isCorrect: boolean; feedback: string }
>('evaluateFreeTextAnswer');
const _createFlashcardFromMcq = createApiCaller<
  CreateFlashcardFromMcqCallableData,
  { flashcardId: string; message: string }
>('createFlashcardFromMcq');
const _generateChapterSummary = createApiCaller<
  GenerateChapterSummaryCallableData,
  { summary: string }
>('generateChapterSummary');
const _generateAndAnalyzeMarrowContent = createApiCaller<
  GenerateAndAnalyzeMarrowContentCallableData,
  { success: boolean; message?: string }
>('generateAndAnalyzeMarrowContent');
const _suggestClassification = createApiCaller<
  SuggestClassificationCallableData,
  { success: boolean; suggestedTopic?: string; suggestedChapter?: string }
>('suggestClassification');
const _getDailyGoal = createApiCaller<
  GetDailyGoalCallableData,
  { success: boolean; goal: GoalInput }
>('getDailyGoal');
const _generateQuickFireTest = createApiCaller<
  GenerateQuickFireTestCallableData,
  { mcqIds: string[] }
>('generateQuickFireTest');
const _evaluateDDx = createApiCaller<
  EvaluateDDxCallableData,
  { success: boolean; feedback: string }
>('evaluateDDx');
const _suggestNewGoal = createApiCaller<
  SuggestNewGoalCallableData,
  { success: boolean; goal: GoalInput }
>('suggestNewGoal');
// FIX: Updated the response type to include the `content` property, which is
// expected by the UI, resolving a type mismatch.
const _generateCramSheet = createApiCaller<
  GenerateCramSheetCallableData,
  { success: boolean; cramSheetId: string; content: string }
>('generateAndSaveCramSheet');
const _getDailyGrindPlaylist = createApiCaller<
  GetDailyGrindPlaylistCallableData,
  { mcqIds: string[]; flashcardIds: string[] }
>('getDailyGrindPlaylist');
const _getMockExamQuestions = createApiCaller<
  GetMockExamQuestionsCallableData,
  { mcqIds: string[] }
>('getMockExamQuestions');

export const chatWithAssistant = async (data: ChatWithAssistantCallableData) =>
  _chatWithAssistant(data);
export const generatePerformanceAdvice = async (
  data: GeneratePerformanceAdviceCallableData
) => _generatePerformanceAdvice(data);
export const generateWeaknessBasedTest = async (
  data: GenerateWeaknessBasedTestCallableData
) => _generateWeaknessBasedTest(data);
export const getDailyWarmupQuiz = async (data?: GetDailyWarmupQuizCallableData) =>
  _getDailyWarmupQuiz(data || {});
export const getQuizSessionFeedback = async (
  data: GetQuizSessionFeedbackCallableData
) => _getQuizSessionFeedback(data);
export const getExpandedSearchTerms = async (
  data: GetExpandedSearchTermsCallableData
) => _getExpandedSearchTerms(data);
export const getHint = async (data: GetHintCallableData) => _getHint(data);
export const evaluateFreeTextAnswer = async (
  data: EvaluateFreeTextAnswerCallableData
) => _evaluateFreeTextAnswer(data);
export const createFlashcardFromMcq = async (
  data: CreateFlashcardFromMcqCallableData
) => _createFlashcardFromMcq(data);
export const generateChapterSummary = async (
  data: GenerateChapterSummaryCallableData
) => _generateChapterSummary(data);
export const getDailyGoal = async (data: GetDailyGoalCallableData) =>
  _getDailyGoal(data);
export const generateQuickFireTest = async (
  data: GenerateQuickFireTestCallableData
) => _generateQuickFireTest(data);
export const evaluateDDx = async (data: EvaluateDDxCallableData) =>
  _evaluateDDx(data);
export const suggestNewGoal = async (data: SuggestNewGoalCallableData) =>
  _suggestNewGoal(data);
export const generateCramSheet = async (data: GenerateCramSheetCallableData) =>
  _generateCramSheet(data);
export const getDailyGrindPlaylist = async (
  data: GetDailyGrindPlaylistCallableData
) => _getDailyGrindPlaylist(data);
export const getMockExamQuestions = async (
  data: GetMockExamQuestionsCallableData
) => _getMockExamQuestions(data);
export const generateAndAnalyzeMarrowContent = async (
  data: GenerateAndAnalyzeMarrowContentCallableData
) => _generateAndAnalyzeMarrowContent(data);
export const suggestClassification = async (
  data: SuggestClassificationCallableData
) => _suggestClassification(data);