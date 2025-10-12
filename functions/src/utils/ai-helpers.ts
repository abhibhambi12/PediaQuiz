// functions/src/utils/ai-helpers.ts
import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { ensureAiClientsInitialized } from "../ai";

/**
 * Extracts a JSON object from a raw text string, which may be wrapped in markdown.
 * @param rawText The text to parse.
 * @returns The parsed JavaScript object.
 * @throws An error if parsing fails.
 */
function extractJson(rawText: string): any {
    const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch?.[1]) {
        try {
            return JSON.parse(jsonMatch[1]);
        } catch (e: any) {
            logger.error("Failed to parse extracted JSON from markdown.", { jsonString: jsonMatch[1], error: e.message });
            throw new HttpsError("internal", `Invalid JSON response from AI model (in markdown): ${e.message}`);
        }
    }
    try {
        return JSON.parse(rawText);
    } catch (e: any) {
        logger.error("Failed to parse raw text as JSON.", { rawText, error: e.message });
        throw new HttpsError("internal", `Invalid JSON response from AI model (raw text): ${e.message}`);
    }
}


/**
 * A robust wrapper for getting and parsing a JSON response from a Gemini model.
 * Includes a self-correction retry mechanism if the first response is not valid JSON.
 * @param rawResponse The initial text response from the AI model.
 * @param defaultValue A safe default value to return if all parsing and retries fail.
 * @returns The parsed JavaScript object, or the default value.
 */
export async function getSanitizedJsonFromAiResponse(rawResponse: string, defaultValue: any = {}): Promise<any> {
    try {
        // First attempt to parse the original response
        return extractJson(rawResponse);
    } catch (error) {
        logger.warn("Initial JSON parsing failed. Attempting self-correction with AI.", { originalError: error });
        
        try {
            const { quickModel } = await ensureAiClientsInitialized();
            
            const correctionPrompt = `The following text contains a JSON object that is malformed. Please fix any syntax errors (like missing commas, brackets, or quotes) and return ONLY the corrected, valid JSON object. Do not include any other text or markdown formatting in your response.

            Corrupted Text:
            ---
            ${rawResponse}
            ---`;
            
            const result = await quickModel.generateContent(correctionPrompt);
            const correctedText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            // Second and final attempt to parse
            return extractJson(correctedText);

        } catch (retryError) {
            logger.error("Self-correction retry failed. Returning default value.", { retryError });
            return defaultValue; // Return a safe default if even the retry fails
        }
    }
}