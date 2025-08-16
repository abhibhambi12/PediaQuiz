// workspaces/frontend/src/pages/GoalsPage.tsx
import React from 'react';
import { TargetIcon } from '../components/Icons';

const GoalsPage: React.FC = () => {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold flex items-center gap-3">
                <TargetIcon />
                <span>Your Study Goals</span>
            </h1>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
                <h2 className="text-xl font-bold mb-4">Add a New Goal</h2>
                <form className="space-y-3">
                    <input
                        type="text"
                        placeholder="e.g., Master the Cardiology chapter"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700"
                        disabled
                    />
                    <input
                        type="date"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700"
                        disabled
                    />
                    <button type="submit" className="w-full bg-sky-500 text-white font-bold py-3 px-4 rounded-md disabled:opacity-50" disabled>
                        Add Goal (Coming Soon)
                    </button>
                </form>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
                <h2 className="text-xl font-bold mb-4">Active Goals</h2>
                <div className="space-y-3">
                    <p className="text-center text-slate-500 py-4">Goal setting is coming soon!</p>
                </div>
            </div>
        </div>
    );
};

export default GoalsPage;