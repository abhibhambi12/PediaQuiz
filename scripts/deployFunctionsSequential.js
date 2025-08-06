const { spawn } = require('child_process');

// --- FIX: Corrected function names and added all missing functions from your index.ts ---
const functionsToDeploy = [
  'onUserCreate',
  'onFileUploaded', // Corrected name
  'onContentReadyForReview',
  'createUploadFromText',
  'extractMarrowContent',
  'generateAndAnalyzeMarrowContent',
  'approveMarrowContent',
  'processManualTextInput',
  'suggestClassification',
  'prepareBatchGeneration',
  'startAutomatedBatchGeneration',
  'autoAssignContent',
  'approveContent',
  'resetContent',
  'reassignContent',
  'prepareForRegeneration',
  'updateChapterNotes',
  'addquizresult',
  'addattempt',
  'togglebookmark',
  'deletecontentitem',
  'resetUpload',
  'archiveUpload',
  'chatWithAssistant',
  'generatePerformanceAdvice',
  'generateWeaknessBasedTest'
];

async function deployFunction(functionName) {
  return new Promise((resolve, reject) => {
    console.log(`\n--- Deploying function: ${functionName} ---`);
    const deployProcess = spawn('npx', ['firebase', 'deploy', '--only', `functions:${functionName}`], { stdio: 'inherit' });

    deployProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`--- Successfully deployed ${functionName} ---`);
        resolve();
      } else {
        console.error(`--- Failed to deploy ${functionName} (exit code: ${code}) ---`);
        reject(new Error(`Deployment failed for ${functionName}`));
      }
    });

    deployProcess.on('error', (err) => {
      console.error(`--- Error deploying ${functionName}: ${err.message} ---`);
      reject(err);
    });
  });
}

async function deployAllFunctionsSequentially() {
  console.log('Starting sequential deployment of all functions...');
  for (const funcName of functionsToDeploy) {
    try {
      await deployFunction(funcName);
      // Optional: Add a small delay between deployments to avoid potential rate limiting issues
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`Global deployment aborted due to failure with ${funcName}.`);
      process.exit(1);
    }
  }
  console.log('\n--- All functions deployed sequentially successfully! ---');
}

deployAllFunctionsSequentially();