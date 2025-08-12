// FILE: scripts/deployFunctionsSequential.js

const { execSync } = require('child_process');
const path = require('path');

// Determine the path to the firebase executable in node_modules/.bin
const firebasePath = path.resolve(__dirname, '../node_modules/.bin/firebase');

// --- CORRECTED: Comprehensive and accurate list of all functions to deploy ---
// This list MUST match the function exports in functions/src/index.ts
const FUNCTIONS_LIST = [
    // Auth & Core Triggers
    "onUserCreate",
    "onFileUploaded",
    "onContentReadyForReview",

    // Core User Data Management (existing and new)
    "addquizresult",
    "addattempt",
    "togglebookmark",
    "addFlashcardAttempt", // NEW FUNCTION

    // Admin Content Pipeline & Management
    "createUploadFromText",
    "processMarrowText", // NEW FUNCTION
    "extractMarrowContent",
    "generateAndAnalyzeMarrowContent",
    "approveMarrowContent",
    "approveContent", // Existing, but confirming presence
    "deletecontentitem", // Existing, but confirming presence
    "resetUpload", // Existing, but confirming presence
    "archiveUpload", // Existing, but confirming presence
    "reassignContent", // Existing, but confirming presence
    "prepareForRegeneration", // Existing, but confirming presence
    "suggestClassification", // Existing, but confirming presence
    "prepareBatchGeneration", // Existing, but confirming presence
    "startAutomatedBatchGeneration", // Existing, but confirming presence
    // Note: functions like `generateGeneralContent` or `approveGeneralContent` are called from AdminUploadCard.tsx
    // but might not be explicitly listed here if they are part of a larger process.
    // If they exist as separate `onCall` exports in `functions/src/index.ts`, they should be added here.

    // AI Features (existing and new)
    "chatWithAssistant",
    "generatePerformanceAdvice",
    "generateWeaknessBasedTest",
    "getDailyWarmupQuiz",
    "getQuizSessionFeedback",
    "getExpandedSearchTerms",
    // If `generateChapterSummary` exists in index.ts, add it here too.

    // New Scheduled Function
    "cleanupExpiredSessions", // NEW FUNCTION
];
// --- END OF CORRECTION ---

async function deploySequentially() {
    console.log(`Starting sequential deployment of ${FUNCTIONS_LIST.length} functions...`);

    // First, run the local build and packaging steps once.
    // This calls the `deploy-functions.sh` script in 'build-only' mode,
    // which is responsible for building all workspaces and preparing `functions/dist`.
    console.log("\n--- Running local build and packaging steps (from deploy-functions.sh's logic)...");
    try {
        // CORRECTED: Call deploy-functions.sh using its full path relative to this script.
        execSync(`bash ${path.resolve(__dirname, '../deploy-functions.sh')} build-only`, { stdio: 'inherit' });
        console.log("--- Local build and packaging complete. ---");
    } catch (error) {
        console.error("Fatal error during local build and packaging:", error.message);
        process.exit(1);
    }

    for (const funcName of FUNCTIONS_LIST) {
        try {
            console.log(`\n--- Deploying function: ${funcName} ---`);
            // Execute firebase deploy for a single function.
            // The firebase.json 'source' property is now correctly set to 'functions/dist'.
            // So, `firebase deploy --only functions:functionName` will deploy the correct code.
            execSync(`${firebasePath} deploy --only functions:${funcName}`, { stdio: 'inherit' });
            console.log(`--- Successfully deployed: ${funcName} ---`);
        } catch (error) {
            console.error(`--- Error deploying ${funcName}:`, error.message);
            console.error("Deployment failed for this function. Stopping sequential deployment.");
            process.exit(1);
        }
    }

    console.log("\n✅ All functions deployed sequentially!");
}

deploySequentially();