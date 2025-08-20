// frontend/src/components/QuizTimerBar.tsx
// CRITICAL FIX: Corrected imports and improved structure.

import React, { useState, useEffect } from 'react';

interface QuizTimerBarProps {
    duration: number; // Total duration in seconds
    onTimeUp: () => void; // Callback function when time runs out
    isPaused: boolean; // Flag to pause/resume the timer
}

const QuizTimerBar: React.FC<QuizTimerBarProps> = ({ duration, onTimeUp, isPaused }) => {
    const [timeLeft, setTimeLeft] = useState(duration);

    useEffect(() => {
        // Reset timeLeft if duration changes (e.g., new question)
        setTimeLeft(Math.max(0, duration));
    }, [duration]);

    useEffect(() => {
        if (isPaused || timeLeft <= 0) {
            if (timeLeft <= 0) {
                // If time runs out, call onTimeUp. Ensure it's not called repeatedly.
                onTimeUp();
            }
            return; // Stop timer if paused or time is up
        }

        const intervalId = setInterval(() => {
            setTimeLeft(prevTime => {
                if (prevTime > 0) {
                    return prevTime - 1;
                } else {
                    return 0; // Ensure it doesn't go negative
                }
            });
        }, 1000);

        // Cleanup interval on component unmount or dependencies change
        return () => clearInterval(intervalId);
    }, [timeLeft, isPaused, onTimeUp]); // Re-run effect if timeLeft, isPaused, or onTimeUp changes

    // Calculate percentage for width, ensuring it's not negative
    const percentage = duration > 0 ? (timeLeft / duration) * 100 : 0;

    // Determine color class based on remaining time percentage
    let colorClass = 'bg-green-500';
    if (percentage <= 50 && percentage > 25) {
        colorClass = 'bg-amber-500';
    } else if (percentage <= 25) {
        colorClass = 'bg-red-500';
    }

    return (
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 my-4">
            <div
                className={`${colorClass} h-2.5 rounded-full transition-all duration-1000 ease-linear`}
                style={{ width: `${percentage}%` }}
                role="progressbar"
                aria-valuenow={percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Time remaining: ${Math.floor(timeLeft / 60)} minutes and ${timeLeft % 60} seconds`}
            ></div>
        </div>
    );
};

export default QuizTimerBar;