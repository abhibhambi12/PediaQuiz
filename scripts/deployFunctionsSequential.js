const { execSync } = require('child_process');
const path = require('path');

// Determine the path to the firebase executable in node_modules/.bin
const firebasePath = path.resolve(__dirname, '../node_modules/.bin/firebase');

// List all functions explicitly to ensure ordered deployment.
// This list MUST match the function exports in functions/src/index.ts
// and reflect your project's functions.
const FUNCTIONS_LIST = [
    "onUserCreate",
    "onFileUploaded",
    "extractMarrowContent",
    "generateAndAnalyzeMarrowContent",
    "approveMarrowContent",
    "suggestClassification",
    "autoAssignContent",
    "resetUpload",
    "onContentReadyForReview",
    "createUploadFromText",
    "processManualTextInput",
    "prepareBatchGeneration",
    "startAutomatedBatchGeneration",
    "approveContent",
    "resetContent",
    "reassignContent",
    "prepareForRegeneration",
    "updateChapterNotes",
    "addquizresult",
    "addattempt",
    "togglebookmark",
    "deletecontentitem",
    "archiveUpload",
    "chatWithAssistant",
    "generatePerformanceAdvice",
    "generateWeaknessBasedTest",
];

async function deploySequentially() {
    console.log(`Starting sequential deployment of ${FUNCTIONS_LIST.length} functions...`);

    // First, run the local build and packaging steps once.
    // The deploy-functions.sh script handles this, but it also triggers firebase deploy --only functions
    // We want to reuse its build logic, but not its final deploy step.
    console.log("\n--- Running local build and packaging steps (from deploy-functions.sh's logic)...");
    try {
        execSync(`bash ./deploy-functions.sh build-only`, { stdio: 'inherit' });
        console.log("--- Local build and packaging complete. ---");
    } catch (error) {
        console.error("Fatal error during local build and packaging:", error.message);
        process.exit(1);
    }

    for (const funcName of FUNCTIONS_LIST) {
        try {
            console.log(`\n--- Deploying function: ${funcName} ---`);
            // Execute firebase deploy for a single function, using the packaged source
            execSync(`${firebasePath} deploy --only functions:${funcName}`, { stdio: 'inherit' });
            console.log(`--- Successfully deployed: ${funcName} ---`);
        } catch (error) {
            console.error(`--- Error deploying ${funcName}:`, error.message);
            console.error("Deployment failed for this function. Stopping sequential deployment.");
            process.exit(1); // Stop on the first deployment error
        }
    }

    console.log("\n✅ All functions deployed sequentially!");
}

deploySequentially();