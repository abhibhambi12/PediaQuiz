import React, { useState, useEffect } from 'react';

interface QuizTimerBarProps {
    duration: number; // Total duration in seconds
    onTimeUp: () => void; // Callback function when time runs out
    isPaused: boolean; // Flag to pause/resume the timer
}

const QuizTimerBar: React.FC<QuizTimerBarProps> = ({ duration, onTimeUp, isPaused }) => {
    // State to keep track of the time remaining
    const [timeLeft, setTimeLeft] = useState(duration);

    // Reset timer when duration prop changes
    useEffect(() => {
        setTimeLeft(duration);
    }, [duration]);

    // Timer logic effect
    useEffect(() => {
        // If paused or time is up, stop the interval
        if (isPaused || timeLeft <= 0) {
            if (timeLeft <= 0) {
                onTimeUp(); // Trigger the callback if time is up
            }
            return; // Exit if paused or time's up
        }

        // Set up an interval to decrement timeLeft every second
        const intervalId = setInterval(() => {
            setTimeLeft(prevTime => (prevTime > 0 ? prevTime - 1 : 0));
        }, 1000);

        // Cleanup function to clear the interval when the component unmounts or dependencies change
        return () => clearInterval(intervalId);
    }, [timeLeft, isPaused, onTimeUp]); // Dependencies: rerun effect if timeLeft, isPaused, or onTimeUp changes

    // Calculate the percentage of time remaining for the progress bar
    const percentage = duration > 0 ? (timeLeft / duration) * 100 : 0;

    // Determine the color class based on the percentage
    let colorClass = 'bg-green-500'; // Default: Green
    if (percentage <= 50 && percentage > 25) {
        colorClass = 'bg-amber-500'; // Yellow/Amber for 25-50%
    } else if (percentage <= 25) {
        colorClass = 'bg-red-500'; // Red for 0-25%
    }

    return (
        // Container for the timer bar
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 my-4">
            {/* Progress bar fill */}
            <div
                className={`${colorClass} h-2.5 rounded-full transition-all duration-1000 ease-linear`} // Use ease-linear for smoother visual update
                style={{ width: `${percentage}%` }}
                role="progressbar" // ARIA role for progress bar
                aria-valuenow={100 - percentage} // Indicate remaining progress
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Time remaining: ${Math.ceil(timeLeft / 60)} minutes`} // More descriptive label
            ></div>
        </div>
    );
};

export default QuizTimerBar;