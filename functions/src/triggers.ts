import { onObjectFinalized, StorageEvent } from "firebase-functions/v2/storage";
import { onDocumentDeleted, FirestoreEvent, QueryDocumentSnapshot } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { ImageAnnotatorClient, protos } from "@google-cloud/vision";
import { db, storage } from "./firebaseAdmin";
import { LOCATION, STORAGE_BUCKET } from "./config";
import { ContentGenerationJob } from "@pediaquiz/types";
import * as path from 'path';

let _visionClient: ImageAnnotatorClient;

function ensureVisionClientInitialized() {
    if (!_visionClient) {
        _visionClient = new ImageAnnotatorClient();
        logger.info("Cloud Vision AI client initialized.");
    }
}

export const onFileUpload = onObjectFinalized({
    cpu: 2,
    memory: "1GiB",
    timeoutSeconds: 540,
    bucket: STORAGE_BUCKET,
    region: LOCATION,
}, async (event: StorageEvent) => {
    ensureVisionClientInitialized();

    const { bucket, name, contentType, metadata } = event.data;
    if (!name || !name.startsWith("uploads/") || name.endsWith('/')) {
        return;
    }

    const pathParts = name.split("/");
    if (pathParts.length < 3) {
        logger.warn(`Ignoring file ${name} due to incorrect path structure. Expected 'uploads/{userId}/{fileName}'.`);
        return;
    }

    const userId = pathParts[1];
    const fileName = path.basename(name);
    const jobRef = db.collection("contentGenerationJobs").doc();

    const newJob: Partial<ContentGenerationJob> = {
        id: jobRef.id,
        userId,
        fileName,
        gcsPath: `gs://${bucket}/${name}`,
        pipeline: (metadata?.isMarrow === 'true') ? 'marrow' : 'general',
        title: fileName.replace(/\.[^/.]+$/, ""),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    };

    try {
        if (contentType !== "application/pdf") {
            await jobRef.set({ ...newJob, status: 'error', errors: ['Unsupported file type. Only PDF is supported by this pipeline.'] });
            logger.warn(`Job ${jobRef.id} failed: Unsupported file type '${contentType}'.`);
            return;
        }

        await jobRef.set({ ...newJob, status: "pending_ocr" });
        logger.info(`Job ${jobRef.id} created for file ${fileName}. Initiating OCR.`);

        const outputPrefix = `ocr_results/${jobRef.id}`;
        const gcsDestinationUri = `gs://${bucket}/${outputPrefix}/`;

        const request: protos.google.cloud.vision.v1.IAsyncAnnotateFileRequest = {
            inputConfig: { gcsSource: { uri: newJob.gcsPath }, mimeType: 'application/pdf' },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            outputConfig: { gcsDestination: { uri: gcsDestinationUri }, batchSize: 100 },
        };

        await _visionClient.asyncBatchAnnotateFiles({ requests: [request] });
        
        await jobRef.update({ ocrOutputPath: gcsDestinationUri, updatedAt: FieldValue.serverTimestamp() });
        logger.info(`OCR operation started for job ${jobRef.id}. Output will be at ${gcsDestinationUri}`);

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error initiating OCR for job ${jobRef.id}:`, error);
        await jobRef.update({ status: "error", errors: FieldValue.arrayUnion(errorMessage), updatedAt: FieldValue.serverTimestamp() });
    }
});

export const onOcrCompletion = onObjectFinalized({
    cpu: 1,
    memory: "512MiB",
    timeoutSeconds: 300,
    bucket: STORAGE_BUCKET,
    region: LOCATION,
}, async (event: StorageEvent) => {
    const { bucket, name } = event.data;

    if (!name || !name.startsWith("ocr_results/") || !name.endsWith('.json')) {
        return;
    }

    const pathParts = name.split("/");
    const jobId = pathParts[1];
    const outputPrefix = `ocr_results/${jobId}`;

    const jobRef = db.collection("contentGenerationJobs").doc(jobId);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists || jobDoc.data()?.status !== 'pending_ocr') {
        if (jobDoc.exists) {
            logger.log(`OCR completion trigger ran for job ${jobId}, but status is '${jobDoc.data()?.status}'. Cleaning up.`);
            await storage.bucket(bucket).deleteFiles({ prefix: outputPrefix });
        }
        return;
    }

    logger.info(`OCR completion detected for job ${jobId}. Combining text results.`);

    try {
        const [files] = await storage.bucket(bucket).getFiles({ prefix: outputPrefix });
        let combinedFullText = "";
        
        files.sort((a, b) => {
            const aMatch = a.name.match(/output-(\d+)-to-\d+.json/);
            const bMatch = b.name.match(/output-(\d+)-to-\d+.json/);
            const aPage = aMatch ? parseInt(aMatch[1], 10) : 0;
            const bPage = bMatch ? parseInt(bMatch[1], 10) : 0;
            return aPage - bPage;
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

        if (!combinedFullText.trim()) {
            throw new Error("OCR could not extract any readable text from the PDF.");
        }

        await jobRef.update({
            sourceText: combinedFullText.trim(),
            status: "ocr_review",
            updatedAt: FieldValue.serverTimestamp(),
        });

        await storage.bucket(bucket).deleteFiles({ prefix: outputPrefix });
        logger.info(`Successfully processed and cleaned up OCR results for job ${jobId}.`);

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error processing OCR completion for job ${jobId}:`, error);
        await jobRef.update({ status: "error", errors: FieldValue.arrayUnion(errorMessage), updatedAt: FieldValue.serverTimestamp() });
        await storage.bucket(bucket).deleteFiles({ prefix: outputPrefix });
    }
});

export const onSessionDeleted = onDocumentDeleted("quizSessions/{sessionId}", async (event: FirestoreEvent<QueryDocumentSnapshot | undefined, { sessionId: string }>) => {
    const sessionData = event.data?.data();
    if (!sessionData) {
        logger.warn(`onSessionDeleted trigger fired but no data found for session ${event.params.sessionId}.`);
        return;
    }
    const userId = sessionData.userId;
    const userRef = db.collection('users').doc(userId);
    try {
        await userRef.update({ activeSessionId: FieldValue.delete() });
        logger.info(`Cleared activeSessionId for user ${userId} after session ${event.params.sessionId} was deleted.`);
    } catch (error: any) {
        logger.error(`Error clearing activeSessionId for user ${userId}:`, error.message);
    }
});