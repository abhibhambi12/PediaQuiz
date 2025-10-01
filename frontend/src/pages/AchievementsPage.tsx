import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Loader from '@/components/Loader';
import { TrophyIcon, SparklesIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

const allPossibleBadges = [
    { id: 'level_5_achiever', name: 'Level 5 Achiever', description: 'Reached Level 5.', icon: <SparklesIcon className="h-8 w-8 text-amber-500" /> },
    { id: 'first_quiz_master', name: 'First Quiz Master', description: 'Completed a quiz with 100% accuracy.', icon: <TrophyIcon className="h-8 w-8 text-green-500" /> },
    { id: 'daily_streak_7', name: '7-Day Streak', description: 'Maintained a study streak for 7 days.', icon: <TrophyIcon className="h-8 w-8 text-red-500" /> },
    { id: 'cram_sheet_creator', name: 'Cram Sheet Creator', description: 'Generated your first AI Cram Sheet.', icon: <SparklesIcon className="h-8 w-8 text-indigo-500" /> },
    { id: 'ddx_pro', name: 'DDx Pro', description: 'Evaluated 5 differential diagnosis scenarios.', icon: <TrophyIcon className="h-8 w-8 text-teal-500" /> },
];

const AchievementsPage: React.FC = () => {
    const { user, loading } = useAuth();

    if (loading) return <Loader fullScreen message="Loading achievements..." />;
    if (!user) return <div className="text-center p-10">Please log in to view your achievements.</div>;

    const earnedBadges = user.badges || [];

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6 flex items-center gap-3"><TrophyIcon className="h-8 w-8 text-amber-500" /> Achievements</h1>
            <div className="card-base p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {allPossibleBadges.map(badge => (
                        <div key={badge.id} className={clsx("p-4 rounded-lg shadow-sm flex items-center gap-3", earnedBadges.includes(badge.name) ? "bg-green-50 dark:bg-green-900/30" : "bg-slate-100 dark:bg-slate-700 opacity-60")}>
                            {badge.icon}
                            <div>
                                <h3 className="font-semibold text-lg">{badge.name}</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400">{badge.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
export default AchievementsPage;