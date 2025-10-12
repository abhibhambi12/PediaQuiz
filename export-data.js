// export-files.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// Ensure your serviceAccountKey.json is in the same directory
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const outputDir = 'firestore-export';

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

async function exportDataToFiles() {
  console.log(`Starting data export. Files will be saved to the '${outputDir}' directory.`);

  // Create the output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
    console.log(`Created directory: '${outputDir}'`);
  }

  for (const collectionName of collectionsToExport) {
    try {
      let query = db.collection(collectionName).limit(3);
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        console.log(`  - No documents found in ${collectionName}. Skipping.`);
        continue;
      }

      const docs = snapshot.docs.map(doc => {
        let data = doc.data();

        // Special handling for MarrowTopics to exclude summaryNotes
        if (collectionName === 'MarrowTopics' && data.chapters) {
            data.chapters = data.chapters.map(chapter => {
                const { summaryNotes, ...rest } = chapter;
                return rest;
            });
        }
        
        // Convert Timestamps to ISO strings for JSON compatibility
        Object.keys(data).forEach(key => {
          if (data[key] && typeof data[key].toDate === 'function') {
            data[key] = data[key].toDate().toISOString();
          }
          // Handle nested arrays of objects with Timestamps
          if (Array.isArray(data[key])) {
            data[key] = data[key].map(item => {
              if (item && typeof item === 'object') {
                Object.keys(item).forEach(subKey => {
                  if (item[subKey] && typeof item[subKey].toDate === 'function') {
                    item[subKey] = item[subKey].toDate().toISOString();
                  }
                });
              }
              return item;
            });
          }
        });

        return { id: doc.id, ...data };
      });

      const filePath = path.join(outputDir, `${collectionName}.json`);
      // Write minified JSON as requested
      fs.writeFileSync(filePath, JSON.stringify(docs));
      console.log(`  ✔ Successfully saved ${docs.length} documents to ${filePath}`);

    } catch (error) {
      console.error(`  ❌ Error fetching from ${collectionName}:`, error.message);
    }
  }

  console.log("\n✅ Export complete.");
}

exportDataToFiles().catch(console.error);