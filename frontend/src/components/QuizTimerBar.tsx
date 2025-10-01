import React, { useState, useEffect } from 'react';
import clsx from 'clsx';

interface QuizTimerBarProps {
    duration: number; // in seconds
    onTimeUp: () => void;
    isPaused: boolean;
}

const QuizTimerBar: React.FC<QuizTimerBarProps> = ({ duration, onTimeUp, isPaused }) => {
    const [timeLeft, setTimeLeft] = useState(duration);

    useEffect(() => { setTimeLeft(duration); }, [duration]);

    useEffect(() => {
        if (isPaused || timeLeft <= 0) {
            if (timeLeft <= 0) onTimeUp();
            return;
        }
        const intervalId = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearInterval(intervalId);
    }, [timeLeft, isPaused, onTimeUp]);

    const percentage = duration > 0 ? (timeLeft / duration) * 100 : 0;
    
    const colorClass = clsx('h-2.5 rounded-full transition-all duration-1000 ease-linear', {
        'bg-green-500': percentage > 50,
        'bg-amber-500': percentage <= 50 && percentage > 25,
        'bg-red-500': percentage <= 25,
    });

    return (
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 my-4">
            <div className={colorClass} style={{ width: `${percentage}%` }} />
        </div>
    );
};

export default QuizTimerBar;