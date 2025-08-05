const { spawn } = require('child_process');

const functionsToDeploy = [
  'onUserCreate',
  'onfilefinalized',
  'createUploadFromText',
  'extractMarrowContent',
  'generateAndApproveMarrowContent', // The correct, combined function
  'generateGeneralContent',
  'approveGeneralContent',
  'summarizeMarrowContent',
  'updateChapterNotes',
  'deletecontentitem',
  'addquizresult',
  'addattempt',
  'togglebookmark',
  'chatWithAssistant',
  'generatePerformanceAdvice',
  'generateWeaknessBasedTest',
  'resetUpload',
  'archiveUpload'
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
  for (const funcName of functionsToDeploy) {
    try {
      await deployFunction(funcName);
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay between deployments
    } catch (error) {
      console.error(`Global deployment aborted due to failure with ${funcName}.`);
      process.exit(1);
    }
  }
  console.log('\n--- All functions deployed sequentially successfully! ---');
}

deployAllFunctionsSequentially();