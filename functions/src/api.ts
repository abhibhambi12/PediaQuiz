import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { HEAVY_FUNCTION_OPTIONS } from "./config";
import * as logger from "firebase-functions/logger";

import * as auth from "./auth";
import * as content from "./content";
import * as quiz from "./quiz";
import * as admin from "./admin";
import * as ai from "./ai";
import * as cram from "./cram-sheets";
import * as logs from "./logs";
import * as clientLogger from "./utils/logger";

type TaskRunner = (request: CallableRequest<any>) => any | Promise<any>;

const tasks: { [key: string]: TaskRunner } = {
  // Auth Tasks
  getOrCreateUserProfile: auth.getOrCreateUserProfile.run,
  updateUserProfile: auth.updateUserProfile.run,
  updateEmail: auth.updateEmail.run,
  updatePassword: auth.updatePassword.run,
  deleteUserAccount: auth.deleteUserAccount.run,
  updateTheme: auth.updateTheme.run,
  
  // Content Tasks
  getAppData: content.getAppData.run,
  getTags: content.getTags.run,
  getQuestionsByTag: content.getQuestionsByTag.run,
  getUserUploads: content.getUserUploads.run,
  getChapterContent: content.getChapterContent.run,
  getMcqsByIds: content.getMcqsByIds.run,
  getTopicContentIds: quiz.getTopicContentIds.run, 
  searchContent: content.searchContent.run,

  // Quiz & Session Tasks
  createSession: quiz.createSession.run,
  getSession: quiz.getSession.run,
  updateSession: quiz.updateSession.run,
  finishSession: quiz.finishSession.run,
  addAttempt: quiz.addAttempt.run,
  addFlashcardAttempt: quiz.addFlashcardAttempt.run,
  toggleBookmark: quiz.toggleBookmark.run,
  createCustomTest: quiz.createCustomTest.run,
  getAttemptedMCQs: quiz.getAttemptedMCQs.run,
  getQuizResults: quiz.getQuizResults.run,
  getQuizResultWithDetails: quiz.getQuizResultWithDetails.run,
  getGoals: quiz.getGoals.run,
  setGoal: quiz.setGoal.run,
  updateGoal: quiz.updateGoal.run,
  deleteGoal: quiz.deleteGoal.run,
  getUserStats: quiz.getUserStats.run,
  getNotifications: quiz.getNotifications.run,
  markNotificationAsRead: quiz.markNotificationAsRead.run,

  // Admin Tasks
  getUsers: admin.getUsers.run,
  setUserRole: admin.setUserRole.run,
  getAdminReviewJobs: admin.getAdminReviewJobs.run,
  getAIConfig: admin.getAIConfig.run,
  updateAIConfig: admin.updateAIConfig.run,
  getAdminAnalytics: admin.getAdminAnalytics.run,
  addTag: admin.addTag.run,
  updateTag: admin.updateTag.run,
  deleteTag: admin.deleteTag.run,
  processManualTextInput: admin.processManualTextInput.run,
  extractMarrowContent: admin.extractMarrowContent.run,
  generateAndAnalyzeMarrowContent: admin.generateAndAnalyzeMarrowContent.run,
  approveMarrowContent: admin.approveMarrowContent.run,
  generateContentFromText: admin.generateContentFromText.run,
  approveContent: admin.approveContent.run,
  updateContentItem: admin.updateContentItem.run,
  suggestClassification: admin.suggestClassification.run,
  resetUpload: admin.resetUpload.run,
  archiveUpload: admin.archiveUpload.run,
  recalculateAllCounts: admin.recalculateAllCounts.run,
  findContentByText: admin.findContentByText.run,
  
  // AI Tasks
  chatWithAssistant: ai.chatWithAssistant.run,
  getDailyWarmupQuiz: ai.getDailyWarmupQuiz.run,
  generateWeaknessBasedTest: ai.generateWeaknessBasedTest.run,
  getDailyGrindPlaylist: ai.getDailyGrindPlaylist.run,
  getMockExamQuestions: ai.getMockExamQuestions.run,
  generatePerformanceAdvice: ai.generatePerformanceAdvice.run,
  getQuizSessionFeedback: ai.getQuizSessionFeedback.run,
  getExpandedSearchTerms: ai.getExpandedSearchTerms.run,
  getHint: ai.getHint.run,
  evaluateFreeTextAnswer: ai.evaluateFreeTextAnswer.run,
  createFlashcardFromMcq: ai.createFlashcardFromMcq.run,
  getDailyGoal: ai.getDailyGoal.run,
  generateQuickFireTest: ai.generateQuickFireTest.run,
  evaluateDDx: ai.evaluateDDx.run,
  suggestNewGoal: ai.suggestNewGoal.run,

  // Cram Sheet Tasks
  generateAndSaveCramSheet: cram.generateAndSaveCramSheet.run,
  
  // Logging Tasks
  getAuditLogs: logs.getAuditLogs.run,
  logClientError: clientLogger.logClientError.run,
};

export const api = onCall({ 
    ...HEAVY_FUNCTION_OPTIONS, 
    cors: ["https://pediaquizapp.web.app", "https://pediaquiz.netlify.app", "http://localhost:5173", "http://127.0.0.1:5173"] 
}, async (request) => {
  const { task, data } = request.data as { task: string; data: any };
  
  if (!task || !tasks[task]) {
    logger.error(`No task found with the name: ${task}`);
    throw new HttpsError('not-found', `The function task '${task}' does not exist.`);
  }

  logger.info(`Executing task: ${task}`, { uid: request.auth?.uid });
  const reconstructedRequest: CallableRequest = { ...request, data };
  return tasks[task](reconstructedRequest);
});