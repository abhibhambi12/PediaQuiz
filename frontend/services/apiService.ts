import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';
import type {
    AppData, Notification, AIConfig, AdminAnalyticsData, LogEntry,
    AssignmentSuggestion, ClientQuizResult, MCQ, Flashcard, UserUpload,
    AddAttemptCallableData, AddFlashcardAttemptCallableData, AddTagCallableData,
    ApproveContentCallableData, ApproveMarrowContentCallableData, ArchiveUploadCallableData,
    AutoAssignContentCallableData, CreateCustomTestCallableData, DeleteContentItemCallableData,
    DeleteGoalCallableData, DeleteTagCallableData, DeleteUserAccountCallableData,
    ExtractMarrowContentCallableData, GetAIConfigCallableData, GetAdminAnalyticsCallableData,
    GetAppDataCallableData, GetNotificationsCallableData, GetQuizResultWithDetailsCallableData,
    MarkNotificationAsReadCallableData, PrepareBatchGenerationCallableData,
    PrepareForRegenerationCallableData, ProcessManualTextInputCallableData,
    ReassignContentCallableData, ResetUploadCallableData, SearchContentCallableData,
    SetGoalCallableData, StartAutomatedBatchGenerationCallableData,
    ToggleBookmarkCallableData, UpdateAIConfigCallableData, UpdateChapterNotesCallableData,
    UpdateContentItemCallableData, UpdateEmailCallableData, UpdateGoalCallableData,
    UpdatePasswordCallableData, UpdateTagCallableData, UpdateThemeCallableData,
    GetTagsCallableData, GetQuestionsByTagCallableData, GetUserStatsCallableData,
    AttemptedMCQs, Goal, ClientUser, User, QuizSession, ContentGenerationJob
} from '@pediaquiz/types';

// App Data & Content Fetching
const _getAppData = httpsCallable<GetAppDataCallableData, AppData>(functions, 'getAppData');
const _getQuizResultWithDetails = httpsCallable<GetQuizResultWithDetailsCallableData, { quizResult: ClientQuizResult, mcqs: MCQ[] }>(functions, 'getQuizResultWithDetails');
const _searchContent = httpsCallable<SearchContentCallableData, { mcqs: MCQ[], flashcards: Flashcard[] }>(functions, 'searchContent');
const _getTags = httpsCallable<GetTagsCallableData, { tags: string[] }>(functions, 'getTags');
const _getQuestionsByTag = httpsCallable<GetQuestionsByTagCallableData, { mcqs: MCQ[] }>(functions, 'getQuestionsByTag');
const _getUserUploads = httpsCallable<{ uploadIds: string[] }, { uploads: UserUpload[] }>(functions, 'getUserUploads');

// Quiz, Session, & Attempt Management
const _createCustomTest = httpsCallable<CreateCustomTestCallableData, { success: boolean, testId: string }>(functions, 'createCustomTest');
const _addQuizResult = httpsCallable<Omit<ClientQuizResult, 'id' | 'userId' | 'quizDate'>, { success: boolean, id: string }>(functions, 'addQuizResult');
const _addAttempt = httpsCallable<AddAttemptCallableData, { success: boolean, xpEarned: number }>(functions, 'addAttempt');
const _addFlashcardAttempt = httpsCallable<AddFlashcardAttemptCallableData, { success: boolean, xpEarned: number }>(functions, 'addFlashcardAttempt');
const _toggleBookmark = httpsCallable<ToggleBookmarkCallableData, { bookmarked: boolean }>(functions, 'toggleBookmark');
const _createSession = httpsCallable<{ mode: QuizSession['mode'], mcqIds: string[], flashcardIds?: string[] }, { sessionId: string }>(functions, 'createSession');
const _getSession = httpsCallable<{ sessionId: string }, QuizSession>(functions, 'getSession');
const _updateSession = httpsCallable<{ sessionId: string, updates: Partial<QuizSession> }, { success: boolean }>(functions, 'updateSession');
const _finishSession = httpsCallable<{ sessionId: string, answers: QuizSession['answers'] }, { success: boolean, resultId: string }>(functions, 'finishSession');

// User Profile, Goals & Stats
const _getOrCreateUserProfile = httpsCallable<void, ClientUser>(functions, 'getOrCreateUserProfile');
const _updateUserProfile = httpsCallable<{ updates: Partial<User> }, { success: boolean }>(functions, 'updateUserProfile');
const _getAttemptedMCQs = httpsCallable<void, AttemptedMCQs>(functions, 'getAttemptedMCQs');
const _getQuizResults = httpsCallable<void, ClientQuizResult[]>(functions, 'getQuizResults');
const _getGoals = httpsCallable<void, Goal[]>(functions, 'getGoals');
const _setGoal = httpsCallable<SetGoalCallableData, { success: boolean, goalId: string }>(functions, 'setGoal');
const _updateGoal = httpsCallable<UpdateGoalCallableData, { success: boolean }>(functions, 'updateGoal');
const _deleteGoal = httpsCallable<DeleteGoalCallableData, { success: boolean }>(functions, 'deleteGoal');
const _updateEmail = httpsCallable<UpdateEmailCallableData, { success: boolean }>(functions, 'updateEmail');
const _updatePassword = httpsCallable<UpdatePasswordCallableData, { success: boolean }>(functions, 'updatePassword');
const _deleteUserAccount = httpsCallable<DeleteUserAccountCallableData, { success: boolean }>(functions, 'deleteUserAccount');
const _updateTheme = httpsCallable<UpdateThemeCallableData, { success: boolean }>(functions, 'updateTheme');
const _getLogs = httpsCallable<void, LogEntry[]>(functions, 'getUserLogs');
const _getUserStats = httpsCallable<GetUserStatsCallableData, { overallStats: any, topicPerformance: any }>(functions, 'getUserStats');
const _getNotifications = httpsCallable<GetNotificationsCallableData, { notifications: Notification[] }>(functions, 'getNotifications');
const _markNotificationAsRead = httpsCallable<MarkNotificationAsReadCallableData, { success: boolean }>(functions, 'markNotificationAsRead');

// Admin Functions
const _getAdminReviewJobs = httpsCallable<{ pipeline: 'general' | 'marrow' }, ContentGenerationJob[]>(functions, 'getAdminReviewJobs');
const _processManualTextInput = httpsCallable<ProcessManualTextInputCallableData, { success: boolean, uploadId: string, message: string }>(functions, 'processManualTextInput');
const _extractMarrowContent = httpsCallable<ExtractMarrowContentCallableData, { success: boolean, message: string }>(functions, 'extractMarrowContent');
const _approveMarrowContent = httpsCallable<ApproveMarrowContentCallableData, { success: boolean, message?: string }>(functions, 'approveMarrowContent');
const _approveContent = httpsCallable<ApproveContentCallableData, { success: boolean, message?: string }>(functions, 'approveContent');
const _resetUpload = httpsCallable<ResetUploadCallableData, { success: boolean, message: string }>(functions, 'resetUpload');
const _archiveUpload = httpsCallable<ArchiveUploadCallableData, { success: boolean, message: string }>(functions, 'archiveUpload');
const _reassignContent = httpsCallable<ReassignContentCallableData, { success: boolean, message: string }>(functions, 'reassignContent');
const _prepareForRegeneration = httpsCallable<PrepareForRegenerationCallableData, { success: boolean, message: string }>(functions, 'prepareForRegeneration');
const _prepareBatchGeneration = httpsCallable<PrepareBatchGenerationCallableData, { success: boolean, totalBatches: number }>(functions, 'prepareBatchGeneration');
const _startAutomatedBatchGeneration = httpsCallable<StartAutomatedBatchGenerationCallableData, { success: boolean, message: string }>(functions, 'startAutomatedBatchGeneration');
const _autoAssignContent = httpsCallable<AutoAssignContentCallableData, { success: boolean, suggestions: AssignmentSuggestion[] }>(functions, 'autoAssignContent');
const _updateChapterNotes = httpsCallable<UpdateChapterNotesCallableData, { success: boolean, message: string }>(functions, 'updateChapterNotes');
const _deleteContentItem = httpsCallable<DeleteContentItemCallableData, { success: boolean, message: string }>(functions, 'deleteContentItem');
const _updateContentItem = httpsCallable<UpdateContentItemCallableData, { success: boolean }>(functions, 'updateContentItem');
const _addTag = httpsCallable<AddTagCallableData, { success: boolean, message: string }>(functions, 'addTag');
const _updateTag = httpsCallable<UpdateTagCallableData, { success: boolean, message: string }>(functions, 'updateTag');
const _deleteTag = httpsCallable<DeleteTagCallableData, { success: boolean, message: string }>(functions, 'deleteTag');
const _getAIConfig = httpsCallable<GetAIConfigCallableData, AIConfig>(functions, 'getAdminAIConfig');
const _updateAIConfig = httpsCallable<UpdateAIConfigCallableData, { success: boolean }>(functions, 'updateAIConfig');
const _getAdminAnalytics = httpsCallable<GetAdminAnalyticsCallableData, AdminAnalyticsData>(functions, 'getAdminAnalytics');


export const getAppData = async () => _getAppData();
export const getQuizResultWithDetails = async (data: GetQuizResultWithDetailsCallableData) => _getQuizResultWithDetails(data);
export const searchContent = async (data: SearchContentCallableData) => _searchContent(data);
export const getTags = async () => _getTags();
export const getQuestionsByTag = async (data: GetQuestionsByTagCallableData) => _getQuestionsByTag(data);
export const getUserUploads = async (data: { uploadIds: string[] }) => _getUserUploads(data);
export const createCustomTest = async (data: CreateCustomTestCallableData) => _createCustomTest(data);
export const addQuizResult = async (result: Omit<ClientQuizResult, 'id' | 'userId' | 'quizDate'>) => _addQuizResult(result);
export const addAttempt = async (data: AddAttemptCallableData) => _addAttempt(data);
export const addFlashcardAttempt = async (data: AddFlashcardAttemptCallableData) => _addFlashcardAttempt(data);
export const toggleBookmark = async (data: ToggleBookmarkCallableData) => _toggleBookmark(data);
export const createSession = async (mode: QuizSession['mode'], mcqIds: string[], flashcardIds?: string[]) => _createSession({ mode, mcqIds, flashcardIds });
export const getSession = async (sessionId: string) => _getSession({ sessionId });
export const updateSession = async (sessionId: string, updates: Partial<QuizSession>) => _updateSession({ sessionId, updates });
export const finishSession = async (sessionId: string, answers: QuizSession['answers']) => _finishSession({ sessionId, answers });
export const getOrCreateUserProfile = async () => _getOrCreateUserProfile();
export const updateUserProfile = async (updates: { updates: Partial<User> }) => _updateUserProfile(updates);
export const getAttemptedMCQs = async () => _getAttemptedMCQs();
export const getQuizResults = async () => _getQuizResults();
export const getGoals = async () => _getGoals();
export const setGoal = async (goal: SetGoalCallableData) => _setGoal(goal);
export const updateGoal = async (data: UpdateGoalCallableData) => _updateGoal(data);
export const deleteGoal = async (data: DeleteGoalCallableData) => _deleteGoal(data);
export const updateEmail = async (data: UpdateEmailCallableData) => _updateEmail(data);
export const updatePassword = async (data: UpdatePasswordCallableData) => _updatePassword(data);
export const deleteUserAccount = async (data: DeleteUserAccountCallableData) => _deleteUserAccount(data);
export const updateTheme = async (data: UpdateThemeCallableData) => _updateTheme(data);
export const getLogs = async () => _getLogs();
export const getUserStats = async () => _getUserStats();
export const getNotifications = async (data: GetNotificationsCallableData) => _getNotifications(data);
export const markNotificationAsRead = async (data: MarkNotificationAsReadCallableData) => _markNotificationAsRead(data);
export const getAdminReviewJobs = async (data: { pipeline: 'general' | 'marrow' }) => _getAdminReviewJobs(data);
export const processManualTextInput = async (data: ProcessManualTextInputCallableData) => _processManualTextInput(data);
export const extractMarrowContent = async (data: ExtractMarrowContentCallableData) => _extractMarrowContent(data);
export const approveMarrowContent = async (data: ApproveMarrowContentCallableData) => _approveMarrowContent(data);
export const approveContent = async (data: ApproveContentCallableData) => _approveContent(data);
export const resetUpload = async (data: ResetUploadCallableData) => _resetUpload(data);
export const archiveUpload = async (data: ArchiveUploadCallableData) => _archiveUpload(data);
export const reassignContent = async (data: ReassignContentCallableData) => _reassignContent(data);
export const prepareForRegeneration = async (data: PrepareForRegenerationCallableData) => _prepareForRegeneration(data);
export const prepareBatchGeneration = async (data: PrepareBatchGenerationCallableData) => _prepareBatchGeneration(data);
export const startAutomatedBatchGeneration = async (data: StartAutomatedBatchGenerationCallableData) => _startAutomatedBatchGeneration(data);
export const autoAssignContent = async (data: AutoAssignContentCallableData) => _autoAssignContent(data);
export const updateChapterNotes = async (data: UpdateChapterNotesCallableData) => _updateChapterNotes(data);
export const deleteContentItem = async (data: DeleteContentItemCallableData) => _deleteContentItem(data);
export const updateContentItem = async (data: UpdateContentItemCallableData) => _updateContentItem(data);
export const addTag = async (data: AddTagCallableData) => _addTag(data);
export const updateTag = async (data: UpdateTagCallableData) => _updateTag(data);
export const deleteTag = async (data: DeleteTagCallableData) => _deleteTag(data);
export const getAIConfig = async () => _getAIConfig();
export const updateAIConfig = async (config: UpdateAIConfigCallableData) => _updateAIConfig(config);
export const getAdminAnalytics = async () => _getAdminAnalytics();