/**
 * Calculates the user's current level and progress based on their total XP.
 * This logic must be kept in sync with the backend implementation.
 * @param currentXp The user's total experience points.
 * @returns An object containing the current level, XP needed for the next level, and percentage progress.
 */
export const calculateLevelProgress = (currentXp: number) => {
    // This value must match the LEVEL_UP_THRESHOLD in the backend functions.
    const BASE_XP_PER_LEVEL = 500; 

    if (typeof currentXp !== 'number' || currentXp < 0) {
        return { currentLevel: 1, xpForNextLevel: BASE_XP_PER_LEVEL, progressToNextLevel: 0 };
    }

    let level = 1;
    let xpForNextLevel = BASE_XP_PER_LEVEL;
    
    let xpTally = currentXp;

    while (xpTally >= xpForNextLevel) {
        xpTally -= xpForNextLevel;
        level++;
        xpForNextLevel = level * BASE_XP_PER_LEVEL;
    }

    const xpInCurrentLevel = xpTally;
    const progressToNextLevel = xpForNextLevel > 0 ? (xpInCurrentLevel / xpForNextLevel) * 100 : 100;

    return {
        currentLevel: level,
        xpForNextLevel: xpForNextLevel,
        progressToNextLevel: Math.min(100, progressToNextLevel),
    };
};