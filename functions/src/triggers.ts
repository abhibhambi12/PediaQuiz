import { onObjectFinalized, StorageEvent } from "firebase-functions/v2/storage";
import { onDocumentWritten, Change, DocumentSnapshot } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { ImageAnnotatorClient, protos } from "@google-cloud/vision";
import { db, storage } from "./firebaseAdmin";
import { LOCATION, STORAGE_BUCKET, HEAVY_FUNCTION_OPTIONS } from "./config";
import { ContentGenerationJob, Topic, MCQ, Flashcard } from "@pediaquiz/types";
import { ensureAiClientsInitialized } from "./ai";
import { getSanitizedJsonFromAiResponse } from "./utils/ai-helpers";
import { createAuditLog } from "./utils/audit";
import * as path from 'path';

let _visionClient: ImageAnnotatorClient;

function ensureVisionClientInitialized() {
    if (!_visionClient) {
        _visionClient = new ImageAnnotatorClient();
        logger.info("Cloud Vision AI client initialized.");
    }
}

export const onFileUpload = onObjectFinalized({
    cpu: 2, memory: "1GiB", timeoutSeconds: 540, bucket: STORAGE_BUCKET, region: LOCATION,
}, async (event: StorageEvent) => {
    ensureVisionClientInitialized();
    const { bucket, name, contentType, metadata } = event.data;
    if (!name || !name.startsWith("uploads/") || name.endsWith('/')) { return; }
    const pathParts = name.split("/");
    if (pathParts.length < 3) { return; }
    const userId = pathParts[1];
    const fileName = path.basename(name);
    const jobRef = db.collection("contentGenerationJobs").doc();
    const newJob: Partial<ContentGenerationJob> = {
        id: jobRef.id, userId, fileName, gcsPath: `gs://${bucket}/${name}`,
        pipeline: (metadata?.isMarrow === 'true') ? 'marrow' : 'general',
        title: fileName.replace(/\.[^/.]+$/, ""),
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    try {
        if (contentType !== "application/pdf") {
            await jobRef.set({ ...newJob, status: 'error', errors: ['Unsupported file type.'] });
            return;
        }
        await jobRef.set({ ...newJob, status: "pending_ocr" });
        const outputPrefix = `ocr_results/${jobRef.id}`;
        const gcsDestinationUri = `gs://${bucket}/${outputPrefix}/`;
        const request: protos.google.cloud.vision.v1.IAsyncAnnotateFileRequest = {
            inputConfig: { gcsSource: { uri: newJob.gcsPath }, mimeType: 'application/pdf' },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            outputConfig: { gcsDestination: { uri: gcsDestinationUri }, batchSize: 100 },
        };
        await _visionClient.asyncBatchAnnotateFiles({ requests: [request] });
        await jobRef.update({ ocrOutputPath: gcsDestinationUri, updatedAt: FieldValue.serverTimestamp() });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await jobRef.update({ status: "error", errors: FieldValue.arrayUnion(errorMessage), updatedAt: FieldValue.serverTimestamp() });
    }
});

export const onOcrCompletion = onObjectFinalized({
    cpu: 1, memory: "512MiB", timeoutSeconds: 300, bucket: STORAGE_BUCKET, region: LOCATION,
}, async (event: StorageEvent) => {
    const { bucket, name } = event.data;
    if (!name || !name.startsWith("ocr_results/") || !name.endsWith('.json')) { return; }
    const pathParts = name.split("/");
    const jobId = pathParts[1];
    const outputPrefix = `ocr_results/${jobId}`;
    const jobRef = db.collection("contentGenerationJobs").doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists || jobDoc.data()?.status !== 'pending_ocr') {
        if (jobDoc.exists) { await storage.bucket(bucket).deleteFiles({ prefix: outputPrefix }); }
        return;
    }
    try {
        const [files] = await storage.bucket(bucket).getFiles({ prefix: outputPrefix });
        let combinedFullText = "";
        files.sort((a, b) => {
            const aMatch = a.name.match(/output-(\d+)-to-\d+.json/);
            const bMatch = b.name.match(/output-(\d+)-to-\d+.json/);
            return (aMatch ? parseInt(aMatch[1], 10) : 0) - (bMatch ? parseInt(bMatch[1], 10) : 0);
        });
        for (const file of files) {
            const [contents] = await file.download();
            const output = JSON.parse(contents.toString());
            (output.responses || []).forEach((pageResponse: protos.google.cloud.vision.v1.IAnnotateImageResponse) => {
                if (pageResponse.fullTextAnnotation?.text) {
                    combinedFullText += pageResponse.fullTextAnnotation.text + "\n\n";
                }
            });
        }
        if (!combinedFullText.trim()) { throw new Error("OCR could not extract any readable text from the PDF."); }
        await jobRef.update({
            sourceText: combinedFullText.trim(), status: "ocr_review", updatedAt: FieldValue.serverTimestamp(),
        });
        await storage.bucket(bucket).deleteFiles({ prefix: outputPrefix });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await jobRef.update({ status: "error", errors: FieldValue.arrayUnion(errorMessage), updatedAt: FieldValue.serverTimestamp() });
        await storage.bucket(bucket).deleteFiles({ prefix: outputPrefix });
    }
});

export const onJobReadyForGeneration = onDocumentWritten({
    document: "contentGenerationJobs/{jobId}", ...HEAVY_FUNCTION_OPTIONS
}, async (event) => {
    const afterData = event.data?.after.data() as ContentGenerationJob | undefined;
    const beforeData = event.data?.before.data() as ContentGenerationJob | undefined;
    if (beforeData?.status === 'generating_content' || afterData?.status !== 'generating_content') { return; }
    
    const jobRef = event.data!.after.ref;
    const { sourceText, suggestedPlan } = afterData;
    if (!sourceText || !suggestedPlan) {
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion("Missing source text or generation plan.") });
        return;
    }
    
    logger.info(`Starting background content generation for job ${jobRef.id}...`);
    try {
        const { powerfulModel, quickModel } = await ensureAiClientsInitialized();
        const { mcqCount, flashcardCount } = suggestedPlan;

        const generationPrompt = `Generate exactly ${mcqCount} MCQs and ${flashcardCount} flashcards from the provided medical text.
        VERY IMPORTANT: Your entire response must be ONLY a single, valid JSON object and nothing else. Do not include any explanatory text, markdown formatting, or anything outside of the main JSON object.
        The JSON object MUST have two top-level keys: "mcqs" (an array of MCQ objects) and "flashcards" (an array of flashcard objects).
        Each MCQ object MUST have a "question" (string), an "options" (array of 4 strings), an "answer" (string), and an "explanation" (string).
        Each flashcard object MUST have a "front" (string) and a "back" (string).
        If you cannot generate content, you MUST respond with this exact JSON: {"mcqs": [], "flashcards": []}.
        Text to process:
        ${sourceText}`;
        
        const generationResult = await powerfulModel.generateContent(generationPrompt);
        const rawJsonResponse = generationResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const generatedContent = await getSanitizedJsonFromAiResponse(rawJsonResponse, { mcqs: [], flashcards: [] });
            
        const validationPrompt = `You are a medical education content validator. Review the following JSON containing MCQs and flashcards. Check for these issues:
        1. Factual inaccuracies or clinically incorrect information.
        2. Ambiguous or poorly phrased questions/options.
        3. Typographical or grammatical errors.
        Respond ONLY with a single valid JSON object with two keys: "isValid" (boolean, true if content is high-quality) and "feedback" (a string providing a brief summary of issues found, or "All content appears valid." if none).
        
        Content to validate:
        ${JSON.stringify(generatedContent)}`

        const validationResult = await quickModel.generateContent(validationPrompt);
        const rawValidationResponse = validationResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const validationData = await getSanitizedJsonFromAiResponse(rawValidationResponse, { isValid: false, feedback: 'Validation step failed.' });

        if (!validationData.isValid) {
            logger.warn(`AI validation failed for job ${jobRef.id}.`, { feedback: validationData.feedback });
            await jobRef.update({ 
                status: 'error', 
                errors: FieldValue.arrayUnion(`AI self-validation failed: ${validationData.feedback}`),
            });
            return;
        }

        const validMcqs: Partial<MCQ>[] = (generatedContent.mcqs || []).filter((mcq: any) => mcq && typeof mcq.question === 'string' && Array.isArray(mcq.options));
        const validFlashcards: Partial<Flashcard>[] = (generatedContent.flashcards || []).filter((fc: any) => fc && typeof fc.front === 'string' && typeof fc.back === 'string');
        
        await jobRef.update({
            finalAwaitingReviewData: { mcqs: validMcqs, flashcards: validFlashcards },
            status: 'content_review',
            updatedAt: FieldValue.serverTimestamp(),
        });
        logger.info(`Successfully processed and validated content for job ${jobRef.id}. Ready for review.`);
    } catch (error: any) {
        logger.error(`Error during background generation for job ${jobRef.id}:`, error);
        await jobRef.update({ 
            status: 'error', 
            errors: FieldValue.arrayUnion(`AI content generation failed: ${error.message}`),
            finalAwaitingReviewData: { mcqs: [], flashcards: [] },
        });
    }
});

export const onJobReadyForMarrowExtraction = onDocumentWritten({
    document: "contentGenerationJobs/{jobId}", ...HEAVY_FUNCTION_OPTIONS
}, async (event) => {
    const afterData = event.data?.after.data() as ContentGenerationJob | undefined;
    const beforeData = event.data?.before.data() as ContentGenerationJob | undefined;
    if (beforeData?.status === 'pending_marrow_extraction' || afterData?.status !== 'pending_marrow_extraction') { return; }
    const jobRef = event.data!.after.ref;
    const { sourceText, userId } = afterData;
    if (!sourceText) {
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion("Source text is missing for Marrow extraction.") });
        return;
    }
    logger.info(`Starting background Marrow extraction for job ${jobRef.id}...`);
    try {
        const { powerfulModel } = await ensureAiClientsInitialized();
        const aiPrompt = `From the following Marrow content, extract all distinct high-yield multiple-choice questions (MCQs) and all distinct standalone explanation paragraphs. For each MCQ, precisely identify the question, its 4 options (A, B, C, D), and the single correct answer letter. For explanations, ensure each paragraph is complete and self-contained. Return ONLY a single valid JSON object with two keys: 'mcqs' and 'orphanExplanations'.
        Example MCQ: { "question": "...", "options": ["...", "...", "...", "..."], "answer": "A", "explanation": "..." }
        Content: ${sourceText}`;
        const result = await powerfulModel.generateContent(aiPrompt);
        const textResponse = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const aiResponse = await getSanitizedJsonFromAiResponse(textResponse, { mcqs: [], orphanExplanations: []});
        
        const extractedMcqs = (Array.isArray(aiResponse.mcqs) ? aiResponse.mcqs : []).map((mcq: any) => ({ ...mcq, source: 'Marrow_Extracted' }));
        const orphanExplanations = Array.isArray(aiResponse.orphanExplanations) ? aiResponse.orphanExplanations : [];
        await jobRef.update({
            stagedContent: { extractedMcqs, orphanExplanations },
            suggestedNewMcqCount: orphanExplanations.length,
            updatedAt: FieldValue.serverTimestamp(), status: 'pending_generation_decision'
        });
        await createAuditLog({ userId: userId, message: `Marrow content extracted for job ${jobRef.id}.`});
    } catch (error: any) {
        logger.error(`Error during background Marrow extraction for job ${jobRef.id}:`, error);
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion(`Marrow extraction failed: ${error.message}`) });
    }
});

export const onJobReadyForMarrowAnalysis = onDocumentWritten({
    document: "contentGenerationJobs/{jobId}", ...HEAVY_FUNCTION_OPTIONS
}, async (event) => {
    const afterData = event.data?.after.data() as ContentGenerationJob | undefined;
    const beforeData = event.data?.before.data() as ContentGenerationJob | undefined;
    if (beforeData?.status === 'pending_marrow_analysis' || afterData?.status !== 'pending_marrow_analysis') { return; }
    const jobRef = event.data!.after.ref;
    const { userId, stagedContent, suggestedNewMcqCount } = afterData;
    const orphanExplanations = stagedContent?.orphanExplanations || [];
    const count = suggestedNewMcqCount || 0;
    if (count > orphanExplanations.length) {
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion("Count exceeds available orphan explanations.") });
        return;
    }
    logger.info(`Starting background Marrow generation & analysis for job ${jobRef.id}...`);
    try {
        const { powerfulModel, quickModel } = await ensureAiClientsInitialized();
        const explanationsToGenerateFrom = orphanExplanations.slice(0, count).join('\n\n');
        let generatedMcqs: any[] = [];
        if (explanationsToGenerateFrom) {
            const genPrompt = `Generate exactly ${count} high-quality MCQs from the following medical explanations. For each MCQ, provide a clear question, 4 distinct options (A, B, C, D), the single correct answer letter, and a detailed explanation. Assign 3-5 relevant, specific, lowercase tags. Assign a difficulty level (easy, medium, hard). Provide the output ONLY as a single valid JSON array:
            [{"question": "...", "options": ["...", "...", "...", "..."], "answer": "A", "explanation": "...", "tags": ["...", "..."], "difficulty": "medium"}]
            Explanations: ${explanationsToGenerateFrom}`;
            const genResult = await powerfulModel.generateContent(genPrompt);
            const textResponse = genResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const genBatch = await getSanitizedJsonFromAiResponse(textResponse, []);
            generatedMcqs = (Array.isArray(genBatch) ? genBatch : []).map((mcq: any) => ({
                ...mcq,
                source: 'Marrow_AI_Generated',
                difficulty: mcq.difficulty || 'medium',
                tags: (mcq.tags || []).map((tag: string) => tag.toLowerCase()),
            }));
        }
        const currentStagedMcqs = stagedContent?.extractedMcqs || [];
        const combinedMcqs = [...currentStagedMcqs, ...generatedMcqs];
        const classificationPrompt = `Analyze the following Marrow MCQs. Suggest the single most suitable Topic Name and a specific Chapter Name. Also, list 5-8 comprehensive key topics/tags. All key topics should be lowercase. Provide the output ONLY as a single valid JSON object:
        {"suggestedTopic": "Topic Name", "suggestedChapter": "Chapter Name", "keyTopics": ["tag1", "tag2", "..."]}.
        MCQ content excerpts: ${combinedMcqs.map((mcq: any) => mcq.question).join('\n')}`;
        const classResult = await quickModel.generateContent(classificationPrompt);
        const classTextResponse = classResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const classResponse = await getSanitizedJsonFromAiResponse(classTextResponse, {});
        await jobRef.update({
            stagedContent: {
                extractedMcqs: currentStagedMcqs,
                generatedMcqs: generatedMcqs,
                orphanExplanations: orphanExplanations.slice(count)
            },
            suggestedTopic: classResponse.suggestedTopic || 'Uncategorized',
            suggestedChapter: classResponse.suggestedChapter || 'Miscellaneous',
            suggestedKeyTopics: (classResponse.keyTopics || []).map((tag: string) => tag.toLowerCase()),
            updatedAt: FieldValue.serverTimestamp(),
            status: 'pending_assignment'
        });
        await createAuditLog({ userId, message: `Generated ${generatedMcqs.length} Marrow MCQs for job ${jobRef.id}.`});
        logger.info(`Successfully generated and analyzed Marrow content for job ${jobRef.id}.`);
    } catch (error: any) {
        logger.error(`Error during background Marrow analysis for job ${jobRef.id}:`, error);
        await jobRef.update({ status: 'error', errors: FieldValue.arrayUnion(`Marrow analysis failed: ${error.message}`) });
    }
});

async function handleContentChange(change: Change<DocumentSnapshot>) {
  const beforeData = change.before.data() as MCQ | Flashcard | undefined;
  const afterData = change.after.data() as MCQ | Flashcard | undefined;
  
  const isNew = !change.before.exists && change.after.exists;
  const isDeleted = change.before.exists && !change.after.exists;
  const isUpdated = change.before.exists && change.after.exists;
  
  const itemType = isNew ? afterData?.type : beforeData?.type;
  if (!itemType || (itemType !== 'mcq' && itemType !== 'flashcard')) { 
    logger.warn("Content change detected for unknown type, skipping count update.");
    return; 
  }

  const mcqIncrement = itemType === 'mcq' ? 1 : 0;
  const flashcardIncrement = itemType === 'flashcard' ? 1 : 0;

  if (isNew && afterData) {
    // A new item was created. Increment the counts for its location.
    await updateCounts(afterData.topicId, afterData.chapterId, mcqIncrement, flashcardIncrement);
  } else if (isDeleted && beforeData) {
    // An item was deleted. Decrement the counts from its last known location.
    await updateCounts(beforeData.topicId, beforeData.chapterId, -mcqIncrement, -flashcardIncrement);
  } else if (isUpdated && beforeData && afterData) {
    // An item was updated. Check if its location changed.
    if (beforeData.chapterId !== afterData.chapterId || beforeData.topicId !== afterData.topicId) {
      // It's a "move". Decrement the old location and increment the new one.
      if (beforeData.topicId && beforeData.chapterId) {
        await updateCounts(beforeData.topicId, beforeData.chapterId, -mcqIncrement, -flashcardIncrement);
      }
      if (afterData.topicId && afterData.chapterId) {
        await updateCounts(afterData.topicId, afterData.chapterId, mcqIncrement, flashcardIncrement);
      }
    }
  }
}

async function updateCounts(topicId: string, chapterId: string, mcqChange: number, flashcardChange: number) {
  if (!topicId || !chapterId) {
    logger.warn("Attempted to update counts with missing topicId or chapterId.", { topicId, chapterId });
    return;
  }
  const generalTopicRef = db.collection('Topics').doc(topicId);
  const marrowTopicRef = db.collection('MarrowTopics').doc(topicId);
  
  let topicRef: FirebaseFirestore.DocumentReference | null = null;
  const generalDoc = await generalTopicRef.get();
  if (generalDoc.exists) {
      topicRef = generalTopicRef;
  } else {
      const marrowDoc = await marrowTopicRef.get();
      if (marrowDoc.exists) {
          topicRef = marrowTopicRef;
      }
  }

  if (!topicRef) {
      logger.error(`Count update failed: Could not find parent topic with ID '${topicId}' in 'Topics' or 'MarrowTopics'.`);
      return;
  }

  try {
      await db.runTransaction(async (transaction) => {
          const topicDoc = await transaction.get(topicRef!);
          if (!topicDoc.exists) { return; }

          const topicData = topicDoc.data() as Topic;
          const chapters = topicData.chapters || [];
          const chapterIndex = chapters.findIndex(c => c.id === chapterId);
          
          if (chapterIndex === -1) {
              logger.warn(`Chapter ${chapterId} not found in Topic ${topicId}. Updating topic total only.`);
              transaction.update(topicRef!, {
                  totalMcqCount: FieldValue.increment(mcqChange),
                  totalFlashcardCount: FieldValue.increment(flashcardChange)
              });
              return;
          }

          const currentMcqCount = chapters[chapterIndex].mcqCount || 0;
          const currentFlashcardCount = chapters[chapterIndex].flashcardCount || 0;

          chapters[chapterIndex].mcqCount = Math.max(0, currentMcqCount + mcqChange);
          chapters[chapterIndex].flashcardCount = Math.max(0, currentFlashcardCount + flashcardChange);

          transaction.update(topicRef!, {
              chapters: chapters,
              totalMcqCount: FieldValue.increment(mcqChange),
              totalFlashcardCount: FieldValue.increment(flashcardChange)
          });
      });
  } catch (error) {
      logger.error(`Transaction failed during count update for topic ${topicId}`, error);
  }
}

export const onMasterMcqWritten = onDocumentWritten("MasterMCQ/{mcqId}", (event) => {
    if (!event.data) return;
    return handleContentChange(event.data);
});

export const onMarrowMcqWritten = onDocumentWritten("MarrowMCQ/{mcqId}", (event) => {
    if (!event.data) return;
    return handleContentChange(event.data);
});

export const onFlashcardWritten = onDocumentWritten("Flashcards/{flashcardId}", (event) => {
    if (!event.data) return;
    return handleContentChange(event.data);
});

export const onSessionDeleted = onDocumentWritten("quizSessions/{sessionId}", (event) => {
    if (!event.data) return null;
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    if (beforeData && !afterData) {
        const userId = beforeData.userId;
        if (userId) {
            const userRef = db.collection('users').doc(userId);
            return userRef.update({ activeSessionId: FieldValue.delete() })
                .then(() => logger.info(`Cleared activeSessionId for user ${userId}.`))
                .catch(error => logger.error(`Error clearing activeSessionId for user ${userId}:`, error.message));
        }
    }
    return null;
});