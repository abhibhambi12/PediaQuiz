/**
 * FIX #5: Normalizes a string into a Firebase-friendly document ID with improved type safety.
 * @param name The input string.
 * @returns A normalized string (lowercase, underscores for spaces, alphanumeric only).
 */
export const normalizeId = (name: string): string => {
  // Add a type check to prevent runtime errors if null or undefined is passed.
  if (typeof name !== 'string' || !name) {
    return '';
  }
  return name.trim().replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '');
};

/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
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