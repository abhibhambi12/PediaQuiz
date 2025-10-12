import * as logger from "firebase-functions/logger";
import { HttpsError } from "firebase-functions/v2/https";

export const normalizeId = (name: string): string => {
  if (typeof name !== 'string' || !name) {
    return '';
  }
  return name
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
};

export const normalizeIdToHumanReadable = (id: string): string => {
  if (typeof id !== 'string') {
    return 'Unknown';
  }
  return id
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export function extractJson(rawText: string): any {
    const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch?.[1]) {
        try {
            return JSON.parse(jsonMatch[1]);
        } catch (e) {
            logger.error("Failed to parse extracted JSON from markdown.", { jsonString: jsonMatch[1], error: (e as Error).message });
            throw new HttpsError("internal", "Invalid JSON response from AI model (in markdown).");
        }
    }
    try {
        return JSON.parse(rawText);
    } catch (e) {
        logger.error("Failed to parse raw text as JSON.", { rawText, error: (e as Error).message });
        throw new HttpsError("internal", "Invalid JSON response from AI model (raw text).");
    }
}