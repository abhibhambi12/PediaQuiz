// frontend/src/utils/gamification.ts
// NEW FILE: Helper functions for gamification calculations.
// CRITICAL FIX: Corrected calculateLevelProgress logic.

/**
 * Calculates the current level, XP needed for the next level, and progress towards it.
 * This logic should mirror the backend's XP/Level calculation.
 * @param currentXp The user's current XP total.
 * @param currentLevel The user's current level (as retrieved from user data).
 * @returns An object with currentLevel, xpForNextLevel, and progressToNextLevel (as a percentage).
 */
export const calculateLevelProgress = (currentXp: number, currentLevel: number) => {
    const BASE_XP_PER_LEVEL_THRESHOLD = 500; // Matches backend LEVEL_UP_THRESHOLD

    let calculatedLevel = 1;
    let xpForCurrentLevelBand = 0; // XP accumulated within the *current* level band
    let xpThresholdForNextLevel = BASE_XP_PER_LEVEL_THRESHOLD; // XP needed to reach next level from previous level's start

    // Simulate backend level calculation to get precise xpForNextLevel and calculatedLevel
    let tempXp = currentXp;
    let tempLevel = 1;

    // The loop calculates what level the current XP corresponds to, and how much XP is left *in that level's band*.
    while (tempXp >= tempLevel * BASE_XP_PER_LEVEL_THRESHOLD) {
        tempXp -= tempLevel * BASE_XP_PER_LEVEL_THRESHOLD; // Subtract XP for current level band
        tempLevel++;
    }

    // After the loop:
    // `tempLevel` is the actual level the user is on (or the level they would reach if they just leveled up).
    // `tempXp` is the XP accumulated *within* `tempLevel`'s band.

    calculatedLevel = tempLevel; // This is the user's current level.
    xpForCurrentLevelBand = tempXp; // This is the XP gained in the current level's band.

    // The XP target for the *current* level band.
    // E.g., for level 1, target is 1 * 500 = 500.
    // For level 2, target is 2 * 500 = 1000.
    const totalXpRequiredForCurrentLevelBand = calculatedLevel * BASE_XP_PER_LEVEL_THRESHOLD;

    // The amount of XP needed to reach the *next* level (e.g., to go from level 1 to level 2).
    // This is `(current level + 1) * BASE_XP_PER_LEVEL_THRESHOLD`.
    // Example: If currentLevel is 1, then xpForNextLevel is (1+1)*500 = 1000.
    // No, this is XP for the *next band* of XP.
    // The previous loop already correctly finds the current level.
    // The XP needed for the *next* level, from 0 of that level's band, is `calculatedLevel * BASE_XP_PER_LEVEL_THRESHOLD`.
    xpThresholdForNextLevel = calculatedLevel * BASE_XP_PER_LEVEL_THRESHOLD;


    // Progress percentage towards the *next* level.
    // It's `(XP in current band) / (total XP for current band)`.
    const progressToNextLevel = totalXpRequiredForCurrentLevelBand > 0
        ? (xpForCurrentLevelBand / totalXpRequiredForCurrentLevelBand) * 100
        : 0;

    return {
        currentLevel: calculatedLevel,
        xpForNextLevel: xpThresholdForNextLevel, // Total XP needed to complete the *current* level and move to the next.
        progressToNextLevel: Math.min(100, progressToNextLevel), // Cap at 100%
    };
};