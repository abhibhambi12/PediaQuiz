const admin = require('firebase-admin');
const fs = require('fs/promises');

// IMPORTANT: Place your Firebase service account key file in the same directory
// and name it 'serviceAccountKey.json'
const serviceAccount = require('./serviceAccountKey.json');

console.log('Initializing Firebase Admin SDK...');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const outputFile = 'firestore-export.json';

// List of collections to export based on your screenshot
const collectionsToExport = [
  'Flashcards',
  'KeyClinicalTopics',
  'MarrowMCQ',
  'MarrowTopics',
  'MasterMCQ',
  'Topics',
  'adminConfig',
  'contentGenerationJobs',
  'logs',
  'quizResults',
  'quizSessions',
  'users'
];

async function exportDatabase() {
  console.log('Starting database export...');
  const fullExport = {};

  for (const collectionName of collectionsToExport) {
    try {
      console.log(`- Fetching collection: ${collectionName}`);
      const snapshot = await db.collection(collectionName).get();
      const collectionData = {};
      snapshot.forEach(doc => {
        collectionData[doc.id] = doc.data();
      });
      fullExport[collectionName] = collectionData;
      console.log(`  > Success! Fetched ${snapshot.size} documents.`);
    } catch (error) {
      console.error(`  > FAILED to fetch collection ${collectionName}:`, error.message);
      fullExport[collectionName] = { __error__: `Failed to fetch: ${error.message}` };
    }
  }

  console.log(`\nWriting all data to ${outputFile}...`);
  await fs.writeFile(outputFile, JSON.stringify(fullExport, null, 2));
  console.log(`\n✅ Export complete! Your data is saved in ${outputFile}`);
}

exportDatabase().catch(error => {
  console.error('\n❌ An unexpected error occurred:', error);
});