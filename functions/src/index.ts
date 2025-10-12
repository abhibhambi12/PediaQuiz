// functions/src/index.ts
import "./firebaseAdmin";

// Export the single API entry point
export { api } from "./api";

// Export all triggers directly, as they cannot be routed
export {
    onusercreated,
} from "./auth";

export {
    onFileUpload,
    onOcrCompletion,
    onSessionDeleted,
    onMasterMcqWritten,
    onMarrowMcqWritten,
    onFlashcardWritten,
    onJobReadyForGeneration,
    onJobReadyForMarrowExtraction,
    onJobReadyForMarrowAnalysis,
} from "./triggers";