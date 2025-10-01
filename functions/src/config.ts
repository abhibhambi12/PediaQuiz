// FIX: Restored original AI model names and storage bucket configuration.
export const LOCATION = "us-central1";
export const PROJECT_ID = "pediaquizapp";

export const DEFAULT_AI_CONFIG = {
    powerfulModel: "gemini-2.5-flash",
    quickModel: "gemini-2.0-flash-lite-001",
    temperature: 0.5,
    maxOutputTokens: 8192,
};

export const STORAGE_BUCKET = "pediaquizapp.firebasestorage.app";

export const HEAVY_FUNCTION_OPTIONS = { cpu: 2, memory: "2GiB" as const, timeoutSeconds: 540, region: LOCATION };
export const MEDIUM_FUNCTION_OPTIONS = { memory: "1GiB" as const, timeoutSeconds: 300, region: LOCATION };
export const LIGHT_FUNCTION_OPTIONS = { memory: "512MiB" as const, timeoutSeconds: 120, region: LOCATION };

export const XP_PER_CORRECT_MCQ = 20;
export const XP_PER_CORRECT_FLASHCARD = 10;
export const LEVEL_UP_THRESHOLD = 500;
export const MAX_CRAM_SHEET_CONTEXT = 30000;