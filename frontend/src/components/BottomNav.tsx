// MODIFIED: Added Streak display and visual feedback for streak status.

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
// Ensure all icons are correctly imported
import { HomeIcon, BookOpenIcon, ChartBarIcon, Cog6ToothIcon, FireIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { isToday, isYesterday } from 'date-fns'; // NEW: For streak logic

const BottomNav: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth(); // Get user from AuthContext

  // Determine streak status for visual feedback
  const isStreakAtRisk = React.useMemo(() => {
    if (!user?.currentStreak || user.currentStreak === 0 || !user.lastStudiedDate) {
      return false; // No streak, or no last study date
    }
    // Ensure lastStudiedDate is treated as a Date object for comparison
    const lastStudyDay = user.lastStudiedDate instanceof Date ? user.lastStudiedDate : new Date(user.lastStudiedDate);

    // Streak is "at risk" if the last study was yesterday (meaning the streak is currently active
    // but needs an activity *today* to continue) and it's not already today.
    return isYesterday(lastStudyDay) && !isToday(lastStudyDay);
  }, [user?.currentStreak, user?.lastStudiedDate]);


  const navItems = [
    { name: 'Home', path: '/', icon: HomeIcon, className: 'bottom-nav-home' }, // Added class for tour
    { name: 'Bookmarks', path: '/bookmarks', icon: BookOpenIcon, className: 'bottom-nav-bookmarks' }, // Added class for tour
    { name: 'Stats', path: '/stats', icon: ChartBarIcon, className: 'bottom-nav-stats' }, // Added class for tour
    { name: 'Settings', path: '/settings', icon: Cog6ToothIcon, className: 'bottom-nav-settings' }, // Added class for tour
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 shadow-lg border-t border-gray-200 dark:border-slate-700 z-30">
      <div className="flex justify-around py-2">
        {navItems.map((item) => (
          <Link
            key={item.name}
            to={item.path}
            className={clsx(`flex flex-col items-center p-2 rounded-lg transition-colors duration-200`,
              location.pathname === item.path
                ? 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-slate-700'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700',
              item.className
            )}
            aria-label={item.name}
          >
            <item.icon className="h-6 w-6" />
            <span className="text-xs mt-1">{item.name}</span>
          </Link>
        ))}

        {/* Daily Streak Display */}
        {user && user.currentStreak !== undefined && user.currentStreak > 0 && (
          <Link
            to="/goals"
            className={clsx(`flex flex-col items-center p-2 rounded-lg transition-colors duration-200`,
              'text-amber-600 dark:text-amber-400',
              // Apply 'at risk' styles if streak is at risk
              isStreakAtRisk ? 'animate-pulse text-red-500' : ''
            )}
            aria-label={`Daily Streak: ${user.currentStreak} days`}
            title={`Daily Streak: ${user.currentStreak} days`}
          >
            <FireIcon className="h-6 w-6" />
            <span className="text-xs mt-1 font-bold">{user.currentStreak} 🔥</span>
          </Link>
        )}
      </div>
    </nav>
  );
};

export default BottomNav;