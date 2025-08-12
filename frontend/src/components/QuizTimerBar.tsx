import React, { useState, useEffect } from 'react';

interface QuizTimerBarProps {
    duration: number; // in seconds
    onTimeUp: () => void;
    isPaused: boolean;
    key: any; // Force re-render when key changes (e.g., new question)
}

const QuizTimerBar: React.FC<QuizTimerBarProps> = ({ duration, onTimeUp, isPaused }) => {
    const [timeLeft, setTimeLeft] = useState(duration);

    useEffect(() => {
        if (isPaused) return;

        if (timeLeft <= 0) {
            onTimeUp();
            return;
        }

        const intervalId = setInterval(() => {
            setTimeLeft(prev => prev - 1);
        }, 1000);

        return () => clearInterval(intervalId);
    }, [timeLeft, onTimeUp, isPaused]);

    const percentage = (timeLeft / duration) * 100;
    
    // Smooth color transition from green -> yellow -> red
    const r = percentage < 50 ? 255 : Math.floor(255 - (percentage * 2 - 100) * 2.55);
    const g = percentage > 50 ? 255 : Math.floor(percentage * 2 * 2.55);
    const color = `rgb(${r}, ${g}, 0)`;

    return (
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 my-4">
            <div
                className="bg-green-500 h-2.5 rounded-full transition-all duration-1000 linear"
                style={{ width: `${percentage}%`, backgroundColor: color }}
            ></div>
        </div>
    );
};

export default QuizTimerBar;