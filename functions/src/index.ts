import "./firebaseAdmin";

export * from "./auth";
export * from "./content";
export * from "./quiz";
export * from "./admin";
// Note: Renaming getAIConfig from ai.ts to avoid naming collision with admin.ts
export { 
    chatWithAssistant, getDailyWarmupQuiz, generateWeaknessBasedTest, getDailyGrindPlaylist, 
    getMockExamQuestions, generatePerformanceAdvice, getQuizSessionFeedback, getExpandedSearchTerms, 
    getHint, evaluateFreeTextAnswer, createFlashcardFromMcq, getDailyGoal, generateQuickFireTest, 
    evaluateDDx, suggestNewGoal 
} from "./ai";
export * from "./triggers";
export * from "./cram-sheets";
export * from "./logs";
export * from "./utils/logger";