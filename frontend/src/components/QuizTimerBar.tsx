import React, { useState, useEffect } from 'react';

interface QuizTimerBarProps {
    duration: number;
    onTimeUp: () => void;
    isPaused: boolean;
}

const QuizTimerBar: React.FC<QuizTimerBarProps> = ({ duration, onTimeUp, isPaused }) => {
    const [timeLeft, setTimeLeft] = useState(duration);

    useEffect(() => {
        setTimeLeft(duration);
    }, [duration]);

    useEffect(() => {
        if (isPaused || timeLeft <= 0) {
            if (timeLeft <= 0) {
                onTimeUp();
            }
            return;
        }

        const intervalId = setInterval(() => {
            setTimeLeft(prevTime => (prevTime > 0 ? prevTime - 1 : 0));
        }, 1000);

        return () => clearInterval(intervalId);
    }, [timeLeft, isPaused, onTimeUp]);

    const percentage = duration > 0 ? (timeLeft / duration) * 100 : 0;

    let colorClass = 'bg-green-500';
    if (percentage <= 50 && percentage > 25) {
        colorClass = 'bg-amber-500';
    } else if (percentage <= 25) {
        colorClass = 'bg-red-500';
    }

    return (
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 my-4">
            <div
                className={`${colorClass} h-2.5 rounded-full transition-all duration-1000 linear`}
                style={{ width: `${percentage}%` }}
            ></div>
        </div>
    );
};

export default QuizTimerBar;