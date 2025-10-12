import { createApiCaller } from '@/utils/apiClient';
import type {
    AppData, Notification, AIConfig, AdminAnalyticsData, LogEntry,
    ClientQuizResult, MCQ, Flashcard, UserUpload,
    AddAttemptCallableData, AddFlashcardAttemptCallableData, AddTagCallableData,
    ApproveContentCallableData, ArchiveUploadCallableData,
    CreateCustomTestCallableData, CreateCustomTestCallableResponse, DeleteContentItemCallableData,
    DeleteGoalCallableData, DeleteTagCallableData, DeleteUserAccountCallableData,
    GetAIConfigCallableData, GetAdminAnalyticsCallableData,
    GetAppDataCallableData, GetNotificationsCallableData, GetQuizResultWithDetailsCallableData,
    MarkNotificationAsReadCallableData, FindContentByTextCallableData,
    ResetUploadCallableData, SearchContentCallableData,
    SetGoalCallableData,
    ToggleBookmarkCallableData, UpdateAIConfigCallableData, UpdateChapterNotesCallableData,
    UpdateContentItemCallableData, UpdateEmailCallableData, UpdateGoalCallableData,
    UpdatePasswordCallableData, UpdateTagCallableData, UpdateThemeCallableData,
    GetTagsCallableData, GetQuestionsByTagCallableData, GetUserStatsCallableData,
    AttemptedMCQDocument, Goal, ClientUser, User, QuizSession, ContentGenerationJob, ProcessManualTextInputCallableData, ExtractMarrowContentCallableData, ApproveMarrowContentCallableData
} from '@pediaquiz/types';

// App Data & Content Fetching
const _getAppData = createApiCaller<GetAppDataCallableData, AppData>('getAppData');
const _getQuizResultWithDetails = createApiCaller<GetQuizResultWithDetailsCallableData, { quizResult: ClientQuizResult, mcqs: MCQ[] }>('getQuizResultWithDetails');
const _searchContent = createApiCaller<SearchContentCallableData, { mcqs: MCQ[], flashcards: Flashcard[] }>('searchContent');
const _getTags = createApiCaller<GetTagsCallableData, { tags: string[] }>('getTags');
const _getQuestionsByTag = createApiCaller<GetQuestionsByTagCallableData, { mcqs: MCQ[] }>('getQuestionsByTag');
const _getUserUploads = createApiCaller<{ uploadIds: string[] }, { uploads: UserUpload[] }>('getUserUploads');
const _getMcqsByIds = createApiCaller<{ mcqIds: string[] }, { mcqs: MCQ[] }>('getMcqsByIds');
const _getFlashcardsByIds = createApiCaller<{ flashcardIds: string[] }, { flashcards: Flashcard[] }>('getFlashcardsByIds');
export const _getTopicContentIds = createApiCaller<{ topicId: string }, { mcqIds: string[], flashcardIds: string[] }>('getTopicContentIds');
export const _getChapterContent = createApiCaller<{ chapterId: string }, { mcqs: MCQ[], flashcards: Flashcard[] }>('getChapterContent');

// Quiz, Session, & Attempt Management
const _createCustomTest = createApiCaller<CreateCustomTestCallableData, CreateCustomTestCallableResponse>('createCustomTest');
const _addQuizResult = createApiCaller<Omit<ClientQuizResult, 'id' | 'userId' | 'quizDate'>, { success: boolean, id: string }>('addQuizResult');
const _addAttempt = createApiCaller<AddAttemptCallableData, { success: boolean, xpEarned: number }>('addAttempt');
const _addFlashcardAttempt = createApiCaller<AddFlashcardAttemptCallableData, { success: boolean, xpEarned: number }>('addFlashcardAttempt');
const _toggleBookmark = createApiCaller<ToggleBookmarkCallableData, { bookmarked: boolean }>('toggleBookmark');
const _createSession = createApiCaller<{ mode: QuizSession['mode'], mcqIds: string[], flashcardIds?: string[] }, { sessionId: string }>('createSession');
const _getSession = createApiCaller<{ sessionId: string }, QuizSession>('getSession');
const _updateSession = createApiCaller<{ sessionId: string, updates: Partial<QuizSession> }, { success: boolean }>('updateSession');
const _finishSession = createApiCaller<{ sessionId: string, answers: QuizSession['answers'] }, { success: boolean, resultId: string }>('finishSession');

// User Profile, Goals & Stats
const _getOrCreateUserProfile = createApiCaller<void, ClientUser>('getOrCreateUserProfile');
const _updateUserProfile = createApiCaller<{ updates: Partial<User> }, { success: boolean }>('updateUserProfile');
const _getAttemptedMCQs = createApiCaller<void, Record<string, AttemptedMCQDocument>>('getAttemptedMCQs');
const _getQuizResults = createApiCaller<{ limit?: number, startAfter?: any }, { results: ClientQuizResult[], lastVisible: any }>('getQuizResults');
const _getGoals = createApiCaller<void, Goal[]>('getGoals');
const _setGoal = createApiCaller<SetGoalCallableData, { success: boolean, goalId: string }>('setGoal');
const _updateGoal = createApiCaller<UpdateGoalCallableData, { success: boolean }>('updateGoal');
const _deleteGoal = createApiCaller<DeleteGoalCallableData, { success: boolean }>('deleteGoal');
const _updateEmail = createApiCaller<UpdateEmailCallableData, { success: boolean }>('updateEmail');
const _updatePassword = createApiCaller<UpdatePasswordCallableData, { success: boolean }>('updatePassword');
const _deleteUserAccount = createApiCaller<DeleteUserAccountCallableData, { success: boolean }>('deleteUserAccount');
const _updateTheme = createApiCaller<UpdateThemeCallableData, { success: boolean }>('updateTheme');
const _getLogs = createApiCaller<void, LogEntry[]>('getLogs');
const _getUserStats = createApiCaller<GetUserStatsCallableData, { overallStats: any, topicPerformance: any[] }>('getUserStats');
const _getNotifications = createApiCaller<GetNotificationsCallableData, { notifications: Notification[] }>('getNotifications');
const _markNotificationAsRead = createApiCaller<MarkNotificationAsReadCallableData, { success: boolean }>('markNotificationAsRead');

// Admin Functions
const _getAdminReviewJobs = createApiCaller<{ pipeline: 'general' | 'marrow' }, ContentGenerationJob[]>('getAdminReviewJobs');
const _processManualTextInput = createApiCaller<ProcessManualTextInputCallableData, { success: boolean, uploadId: string, message: string }>('processManualTextInput');
const _extractMarrowContent = createApiCaller<ExtractMarrowContentCallableData, { success: boolean, message: string }>('extractMarrowContent');
const _approveMarrowContent = createApiCaller<ApproveMarrowContentCallableData, { success: boolean, message?: string }>('approveMarrowContent');
const _approveContent = createApiCaller<ApproveContentCallableData, { success: boolean, message?: string }>('approveContent');
const _resetUpload = createApiCaller<ResetUploadCallableData, { success: boolean, message: string }>('resetUpload');
const _archiveUpload = createApiCaller<ArchiveUploadCallableData, { success: boolean, message: string }>('archiveUpload');
const _updateChapterNotes = createApiCaller<UpdateChapterNotesCallableData, { success: boolean, message: string }>('updateChapterNotes');
const _deleteContentItem = createApiCaller<DeleteContentItemCallableData, { success: boolean, message: string }>('deleteContentItem');
const _updateContentItem = createApiCaller<UpdateContentItemCallableData, { success: boolean }>('updateContentItem');
const _addTag = createApiCaller<AddTagCallableData, { success: boolean, message: string }>('addTag');
const _updateTag = createApiCaller<UpdateTagCallableData, { success: boolean, message: string }>('updateTag');
const _deleteTag = createApiCaller<DeleteTagCallableData, { success: boolean, message: string }>('deleteTag');
const _getAIConfig = createApiCaller<GetAIConfigCallableData, AIConfig>('getAIConfig');
const _updateAIConfig = createApiCaller<UpdateAIConfigCallableData, { success: boolean }>('updateAIConfig');
const _getAdminAnalytics = createApiCaller<GetAdminAnalyticsCallableData, AdminAnalyticsData>('getAdminAnalytics');
const _getUsers = createApiCaller<{ limit?: number; pageToken?: string }, { users: User[], nextPageToken?: string }>('getUsers');
const _setUserRole = createApiCaller<{ targetUid: string; newRole: User['role'] }, { success: boolean }>('setUserRole');
const _getAuditLogs = createApiCaller<{ limit?: number, startAfter?: string }, { logs: LogEntry[], lastVisible: string | null }>('getAuditLogs');
const _findContentByText = createApiCaller<FindContentByTextCallableData, { results: any[] }>('findContentByText');
const _recalculateAllCounts = createApiCaller<void, { success: boolean, message: string }>('recalculateAllCounts');


// --- EXPORTS ---
export const getAppData = async () => _getAppData({});
export const getQuizResultWithDetails = async (data: GetQuizResultWithDetailsCallableData) => _getQuizResultWithDetails(data);
export const searchContent = async (data: SearchContentCallableData) => _searchContent(data);
export const getTags = async () => _getTags({});
export const getQuestionsByTag = async (data: GetQuestionsByTagCallableData) => _getQuestionsByTag(data);
export const getUserUploads = async (data: { uploadIds: string[] }) => _getUserUploads(data);
export const getMcqsByIds = async (data: { mcqIds: string[] }) => _getMcqsByIds(data);
export const getFlashcardsByIds = async (data: { flashcardIds: string[] }) => _getFlashcardsByIds(data);
export const createCustomTest = async (data: CreateCustomTestCallableData) => _createCustomTest(data);
export const addQuizResult = async (result: Omit<ClientQuizResult, 'id' | 'userId' | 'quizDate'>) => _addQuizResult(result);
export const addAttempt = async (data: AddAttemptCallableData) => _addAttempt(data);
export const addFlashcardAttempt = async (data: AddFlashcardAttemptCallableData) => _addFlashcardAttempt(data);
export const toggleBookmark = async (data: ToggleBookmarkCallableData) => _toggleBookmark(data);
export const createSession = async (data: { mode: QuizSession['mode'], mcqIds: string[], flashcardIds?: string[] }) => _createSession(data);
export const getSession = async (data: { sessionId: string }) => _getSession(data);
export const updateSession = async (data: { sessionId: string, updates: Partial<QuizSession> }) => _updateSession(data);
export const finishSession = async (data: { sessionId: string, answers: QuizSession['answers'] }) => _finishSession(data);
export const getOrCreateUserProfile = async () => _getOrCreateUserProfile(undefined);
export const updateUserProfile = async (updates: { updates: Partial<User> }) => _updateUserProfile(updates);
export const getAttemptedMCQs = async () => _getAttemptedMCQs(undefined);
export const getQuizResults = async (data: { limit?: number, startAfter?: any } = {}) => _getQuizResults(data);
export const getGoals = async () => _getGoals(undefined);
export const setGoal = async (goal: SetGoalCallableData) => _setGoal(goal);
export const updateGoal = async (data: UpdateGoalCallableData) => _updateGoal(data);
export const deleteGoal = async (data: DeleteGoalCallableData) => _deleteGoal(data);
export const updateEmail = async (data: UpdateEmailCallableData) => _updateEmail(data);
export const updatePassword = async (data: UpdatePasswordCallableData) => _updatePassword(data);
export const deleteUserAccount = async (data: DeleteUserAccountCallableData) => _deleteUserAccount(data);
export const updateTheme = async (data: UpdateThemeCallableData) => _updateTheme(data);
export const getLogs = async () => _getLogs(undefined);
export const getUserStats = async () => _getUserStats({});
export const getNotifications = async (data: GetNotificationsCallableData) => _getNotifications(data);
export const markNotificationAsRead = async (data: MarkNotificationAsReadCallableData) => _markNotificationAsRead(data);
export const getAdminReviewJobs = async (data: { pipeline: 'general' | 'marrow' }) => _getAdminReviewJobs(data);
export const processManualTextInput = async (data: ProcessManualTextInputCallableData) => _processManualTextInput(data);
export const extractMarrowContent = async (data: ExtractMarrowContentCallableData) => _extractMarrowContent(data);
export const approveMarrowContent = async (data: ApproveMarrowContentCallableData) => _approveMarrowContent(data);
export const approveContent = async (data: ApproveContentCallableData) => _approveContent(data);
export const resetUpload = async (data: ResetUploadCallableData) => _resetUpload(data);
export const archiveUpload = async (data: ArchiveUploadCallableData) => _archiveUpload(data);
export const updateChapterNotes = async (data: UpdateChapterNotesCallableData) => _updateChapterNotes(data);
export const deleteContentItem = async (data: DeleteContentItemCallableData) => _deleteContentItem(data);
export const updateContentItem = async (data: UpdateContentItemCallableData) => _updateContentItem(data);
export const addTag = async (data: AddTagCallableData) => _addTag(data);
export const updateTag = async (data: UpdateTagCallableData) => _updateTag(data);
export const deleteTag = async (data: DeleteTagCallableData) => _deleteTag(data);
export const getAIConfig = async () => _getAIConfig({});
export const updateAIConfig = async (config: UpdateAIConfigCallableData) => _updateAIConfig(config);
export const getAdminAnalytics = async () => _getAdminAnalytics({});
export const getUsers = (data: { limit?: number; pageToken?: string }) => _getUsers(data);
export const setUserRole = (data: { targetUid: string; newRole: User['role'] }) => _setUserRole(data);
export const getAuditLogs = (data: { limit?: number, startAfter?: string }) => _getAuditLogs(data);
export const findContentByText = async (data: FindContentByTextCallableData) => _findContentByText(data);
export const recalculateAllCounts = async () => _recalculateAllCounts(undefined);