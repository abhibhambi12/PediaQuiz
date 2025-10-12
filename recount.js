// recount.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// --- CONFIGURATION ---
// IMPORTANT: Update this path to point to your service account key file.
const serviceAccount = require('./serviceAccountKey.json');
// --- END OF CONFIGURATION ---

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function recountAllContent() {
  console.log("Starting recount process for all topics and chapters...");

  const topicCollections = ['Topics', 'MarrowTopics'];
  const batch = db.batch();

  try {
    for (const collectionName of topicCollections) {
      console.log(`\nProcessing collection: ${collectionName}`);
      const isMarrow = collectionName === 'MarrowTopics';
      const mcqCollectionName = isMarrow ? 'MarrowMCQ' : 'MasterMCQ';

      const topicsSnap = await db.collection(collectionName).get();
      if (topicsSnap.empty) {
        console.log(` > No documents found in ${collectionName}. Skipping.`);
        continue;
      }

      for (const topicDoc of topicsSnap.docs) {
        const topicData = topicDoc.data();
        let topicTotalMcqs = 0;
        let topicTotalFlashcards = 0;
        
        console.log(`  - Recalculating counts for Topic: ${topicData.name}`);

        if (!topicData.chapters || !Array.isArray(topicData.chapters)) {
            console.log(`    > Skipping topic with no chapters array.`);
            continue;
        }

        const updatedChapters = await Promise.all(topicData.chapters.map(async (chapter) => {
          // Get MCQ count for this chapter
          const mcqQuery = db.collection(mcqCollectionName).where('chapterId', '==', chapter.id);
          const mcqCountSnap = await mcqQuery.count().get();
          // FIX: Correctly access the count from the snapshot's data.
          const chapterMcqCount = mcqCountSnap.data().count;

          // Get Flashcard count for this chapter
          const flashcardQuery = db.collection('Flashcards').where('chapterId', '==', chapter.id);
          const flashcardCountSnap = await flashcardQuery.count().get();
          // FIX: Correctly access the count from the snapshot's data.
          const chapterFlashcardCount = flashcardCountSnap.data().count;
          
          console.log(`    > Chapter '${chapter.name}': ${chapterMcqCount} MCQs, ${chapterFlashcardCount} Flashcards.`);
          
          topicTotalMcqs += chapterMcqCount;
          topicTotalFlashcards += chapterFlashcardCount;

          return {
            ...chapter,
            mcqCount: chapterMcqCount,
            flashcardCount: chapterFlashcardCount
          };
        }));

        // Add the update to the batch
        batch.update(topicDoc.ref, {
          chapters: updatedChapters,
          totalMcqCount: topicTotalMcqs,
          totalFlashcardCount: topicTotalFlashcards
        });
        console.log(`  ✔ Queued update for Topic '${topicData.name}' with total ${topicTotalMcqs} MCQs and ${topicTotalFlashcards} Flashcards.`);
      }
    }

    // Commit all the updates at once
    console.log("\nCommitting all updates to the database...");
    await batch.commit();
    console.log("\n✅ Success! All counts have been recalculated and updated.");

  } catch (error) {
    console.error("\n❌ An error occurred during the recount process:", error);
  }
}

recountAllContent();