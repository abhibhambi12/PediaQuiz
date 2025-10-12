import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Loader from '@/components/Loader';
import { calculateLevelProgress } from '@/utils/gamification';
import { useQuery } from '@tanstack/react-query';
import { getQuizResults, getGoals } from '@/services/apiService';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { safeToDate } from '@/utils/dateUtils';
import {
  TrophyIcon,
  SparklesIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { ClientQuizResult, Goal } from '@pediaquiz/types';

const ProfilePage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();

  const { data: recentQuizzes, isLoading: loadingQuizzes } = useQuery({
    queryKey: ['recentQuizHistory', user?.uid],
    queryFn: async () => (await getQuizResults({ limit: 5 })).data.results,
    enabled: !!user,
  });

  const { data: goals, isLoading: loadingGoals } = useQuery({
    queryKey: ['userGoals', user?.uid],
    queryFn: async () => (await getGoals()).data,
    enabled: !!user,
  });

  if (authLoading || loadingQuizzes || loadingGoals) {
    return <Loader fullScreen message="Loading your profile..." />;
  }

  if (!user) {
    return (
      <div className="text-center p-10">Please log in to view your profile.</div>
    );
  }

  const { currentLevel, progressToNextLevel, xpForNextLevel } =
    calculateLevelProgress(user.xp || 0);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Your Profile</h1>

      <div className="card-base p-6 text-center">
        <h2 className="text-2xl font-bold">{user.displayName}</h2>
        <p className="text-slate-500">{user.email}</p>
        <div className="mt-4">
          <p className="font-semibold">Level {currentLevel}</p>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 my-2">
            <div
              className="bg-purple-600 h-2.5 rounded-full"
              style={{ width: `${progressToNextLevel}%` }}
            ></div>
          </div>
          <p className="text-sm text-slate-500">
            {user.xp || 0} / {xpForNextLevel} XP
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card-base p-6">
          <h3 className="text-xl font-bold flex items-center gap-2 mb-4">
            <ClockIcon className="h-6 w-6" />
            Recent Activity
          </h3>
          <div className="space-y-3">
            {recentQuizzes?.map((quiz: ClientQuizResult) => (
              <Link
                to={`/results/${quiz.id}`}
                key={quiz.id}
                className="block p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <p className="font-semibold capitalize">
                  {quiz.mode.replace('_', ' ')}
                </p>
                <p className="text-sm text-slate-500">
                  {format(safeToDate(quiz.quizDate), 'PP')}
                </p>
              </Link>
            ))}
          </div>
        </div>

        <div className="card-base p-6">
          <h3 className="text-xl font-bold flex items-center gap-2 mb-4">
            <SparklesIcon className="h-6 w-6" />
            Active Goals
          </h3>
          <div className="space-y-3">
            {goals?.length ? (
              goals.map((goal: Goal) => (
                <div
                  key={goal.id}
                  className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50"
                >
                  <p className="font-semibold">{goal.title}</p>
                  <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2 mt-1">
                    <div
                      className="bg-sky-500 h-2 rounded-full"
                      style={{ width: `${goal.progress}%` }}
                    ></div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                No active goals.{' '}
                <Link to="/goals" className="text-sky-500 hover:underline">
                  Set one now!
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="card-base p-6">
        <h3 className="text-xl font-bold flex items-center gap-2 mb-4">
          <TrophyIcon className="h-6 w-6" />
          Achievements
        </h3>
        <div className="flex flex-wrap gap-4">
          {user.badges?.length ? (
            user.badges.map((badge) => (
              <div
                key={badge}
                className="px-3 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-full font-semibold text-sm"
              >
                {badge}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">
              No achievements earned yet.
            </p>
          )}
        </div>
        <Link to="/achievements" className="btn-neutral mt-4 text-sm">
          View All Achievements
        </Link>
      </div>
    </div>
  );
};

export default ProfilePage;