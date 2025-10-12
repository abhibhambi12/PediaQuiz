import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Loader from '@/components/Loader';
import { TrophyIcon, SparklesIcon, FireIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

// --- BATCH 4: DYNAMIC GAMIFICATION ---
// This list now defines all possible achievements in the application.
// The component will dynamically check if the user's `badges` array includes the `id`.
const allPossibleBadges = [
  {
    id: 'level_5_achiever',
    name: 'Level 5 Scholar',
    description: 'Reached Level 5 by earning XP.',
    icon: <SparklesIcon className="h-8 w-8 text-amber-500" />,
  },
  {
    id: 'first_quiz_master',
    name: 'Perfect Start',
    description: 'Completed your first quiz with 100% accuracy.',
    icon: <TrophyIcon className="h-8 w-8 text-green-500" />,
  },
  {
    id: 'daily_streak_7',
    name: 'Weekly Warrior',
    description: 'Maintained a study streak for 7 consecutive days.',
    icon: <FireIcon className="h-8 w-8 text-red-500" />,
  },
  {
    id: 'cram_sheet_creator',
    name: 'AI Scribe',
    description: 'Generated your first AI Cram Sheet.',
    icon: <SparklesIcon className="h-8 w-8 text-indigo-500" />,
  },
  {
    id: 'ddx_pro',
    name: 'Junior Detective',
    description: 'Evaluated 5 differential diagnosis scenarios.',
    icon: <TrophyIcon className="h-8 w-8 text-teal-500" />,
  },
  {
    id: 'weekend_learner',
    name: 'Weekend Learner',
    description: 'Completed a quiz on a Saturday or Sunday.',
    icon: <SparklesIcon className="h-8 w-8 text-purple-500" />,
  },
];

const AchievementsPage: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) return <Loader fullScreen message="Loading achievements..." />;
  if (!user) {
    return (
      <div className="text-center p-10">
        Please log in to view your achievements.
      </div>
    );
  }

  // The list of earned badges now comes directly from the user's profile document.
  const earnedBadgeIds = new Set(user.badges || []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-3">
        <TrophyIcon className="h-8 w-8 text-amber-500" /> Achievements
      </h1>
      <div className="card-base p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {allPossibleBadges.map((badge) => (
            <div
              key={badge.id}
              className={clsx(
                'p-4 rounded-lg shadow-sm flex items-center gap-4 transition-opacity',
                // The UI dynamically applies styles based on whether the user has earned the badge.
                earnedBadgeIds.has(badge.id)
                  ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700'
                  // Unearned badges are slightly transparent to indicate they are locked.
                  : 'bg-slate-100 dark:bg-slate-800 opacity-60' 
              )}
            >
              <div className="flex-shrink-0">{badge.icon}</div>
              <div>
                <h3 className="font-semibold text-lg">{badge.name}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {badge.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default AchievementsPage;