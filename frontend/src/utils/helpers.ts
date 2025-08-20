// frontend/src/utils/helpers.ts
// FILE: frontend/src/utils/helpers.ts
// This file can contain reusable helper functions.
// CRITICAL FIX: Ensure normalizeId is explicitly exported.

/**
 * Normalizes a given string name into a Firebase-friendly document ID.
 * This replaces spaces with underscores, converts to lowercase, and removes
 * any characters that are not alphanumeric or underscores.
 * @param name - The input string name (e.g., "Pediatric Cardiology").
 * @returns A normalized string suitable for document IDs (e.g., "pediatric_cardiology").
 */
export const normalizeId = (name: string): string => {
  if (typeof name !== 'string') {
    console.warn(`Attempted to normalize a non-string value: ${name}. Returning 'unknown_id'.`);
    return 'unknown_id';
  }
  return name
    .trim()
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .toLowerCase()         // Convert to lowercase
    .replace(/[^a-z0-9_]/g, ''); // Remove any characters not alphanumeric or underscore
};

/**
 * Shuffles an array in place.
 * @param array The array to shuffle.
 * @returns The shuffled array.
 */
export function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Formats milliseconds into a mm:ss string.
 * @param milliseconds Time in milliseconds.
 * @returns Formatted time string (mm:ss).
 */
export const formatTime = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Formats a score number with locale-specific thousands separators.
 * @param score The score number.
 * @returns Formatted score string.
 */
export const formatScore = (score: number): string => {
  return score.toLocaleString();
};