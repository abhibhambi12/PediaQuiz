// --- CORRECTED FILE: scripts/deployFunctionsSequential.js ---

const { execSync } = require('child_process');
const path = require('path');

// Determine the path to the firebase executable in node_modules/.bin
const firebasePath = path.resolve(__dirname, '../node_modules/.bin/firebase');

// --- CORRECTED: Comprehensive and accurate list of all functions to deploy ---
// This list MUST match the function exports in functions/src/index.ts
const FUNCTIONS_LIST = [
    // Auth & Storage Triggers (V2) - Note: onUserCreate is V1, handled separately
    "onFileUploaded",
    "onContentReadyForReview",

    // Core User Data Management
    "addquizresult",
    "addattempt",
    "togglebookmark",
    "addFlashcardAttempt",

    // Admin Content Pipeline & Management
    "processManualTextInput", // Confirmed in aiService.ts and used by frontend
    "extractMarrowContent",
    "generateAndAnalyzeMarrowContent",
    "approveMarrowContent",
    "approveContent",
    "deletecontentitem",
    "resetUpload",
    "archiveUpload",
    "reassignContent",
    "prepareForRegeneration",
    "suggestClassification",
    "prepareBatchGeneration",
    "startAutomatedBatchGeneration",
    "autoAssignContent", // Present in functions/src/index.ts from prompt, needs to be deployed
    "updateChapterNotes",
    "generateGeneralContent", // Confirmed in aiService.ts and used by frontend

    // AI Features
    "chatWithAssistant",
    "generatePerformanceAdvice",
    "generateWeaknessBasedTest",
    "getDailyWarmupQuiz", // Confirmed in aiService.ts and used by frontend
    "getQuizSessionFeedback", // Confirmed in aiService.ts and used by frontend
    "getExpandedSearchTerms", // Confirmed in aiService.ts and used by frontend
    "generateAndStageMarrowMcqs", // Confirmed in aiService.ts and used by frontend
    "generateChapterSummary", // Confirmed in aiService.ts and used by frontend

    // Scheduled Function
    "cleanupExpiredSessions",
];
// --- END OF CORRECTION ---

async function deploySequentially() {
    console.log(`Starting sequential deployment of ${FUNCTIONS_LIST.length} functions...`);

    // First, run the local build and packaging steps once.
    console.log("\n--- Running local build and packaging steps (from deploy-functions.sh's logic)...");
    try {
        // CORRECTED: Call deploy-functions.sh using its full path relative to this script.
        execSync(`bash ${path.resolve(__dirname, '../deploy-functions.sh')} build-only`, { stdio: 'inherit' });
        console.log("--- Local build and packaging complete. ---");
    } catch (error) {
        console.error("Fatal error during local build and packaging:", error.message);
        process.exit(1);
    }

    // Deploy V1 functions (like onUserCreate) as a group first, if they are defined as V1 functions
    // (Firebase handles V1 functions differently, often deploying them as part of a group based on source).
    // The provided firebase.json implies onUserCreate is a functionsV1 trigger, not a callable,
    // so it might be implicitly deployed. For callable/explicit V2 functions, the loop below is for them.
    // If 'onUserCreate' is specifically a V1-style trigger (like functions.auth.user().onCreate),
    // it's often deployed by the `firebase deploy --only functions` command implicitly when its source is included.
    // However, if the intent was to deploy V1 callables specifically, they'd need to be listed.
    // For now, relying on firebase.json and V2 functions being explicit.
    // If you explicitly wanted to target a V1 function, you would add a `firebase deploy --only functions:onUserCreate` here.
    // Since it's omitted in `FUNCTIONS_LIST` (as it's a trigger, not onCall), no explicit V1 deploy command is added here.

    for (const funcName of FUNCTIONS_LIST) {
        try {
            console.log(`\n--- Deploying function: ${funcName} ---`);
            // Execute firebase deploy for a single function.
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