import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { HomeIcon, BookmarkIcon, ChartBarIcon, Cog6ToothIcon, FireIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { isToday, isYesterday } from 'date-fns';
import { safeToDate } from '@/utils/dateUtils';

const BottomNav: React.FC = () => {
  const { user } = useAuth();

  const isStreakActive = useMemo(() => {
    if (!user?.lastStudiedDate) return false;
    const lastStudyDay = safeToDate(user.lastStudiedDate);
    return isToday(lastStudyDay) || isYesterday(lastStudyDay);
  }, [user?.lastStudiedDate]);

  const navItems = [
    { name: 'Home', path: '/', icon: HomeIcon, className: 'bottom-nav-home' },
    { name: 'Bookmarks', path: '/bookmarks', icon: BookmarkIcon, className: 'bottom-nav-bookmarks' },
    { name: 'Stats', path: '/stats', icon: ChartBarIcon, className: 'bottom-nav-stats' },
    { name: 'Settings', path: '/settings', icon: Cog6ToothIcon, className: 'bottom-nav-settings' },
  ];

  const activeLinkClass = 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-slate-700';
  const inactiveLinkClass = 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 shadow-[0_-2px_5px_rgba(0,0,0,0.1)] dark:shadow-[0_-2px_5px_rgba(0,0,0,0.3)] border-t border-slate-200 dark:border-slate-700 z-30">
      <div className="flex justify-around max-w-xl mx-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            end
            className={({ isActive }) => clsx(
              'flex flex-col items-center p-2 rounded-lg transition-colors duration-200 w-20 h-16 justify-center',
              isActive ? activeLinkClass : inactiveLinkClass,
              item.className
            )}
            aria-label={item.name}
          >
            <item.icon className="h-6 w-6" />
            <span className="text-xs mt-1">{item.name}</span>
          </NavLink>
        ))}

        {user && (
          <NavLink
            to="/goals"
            className={({ isActive }) => clsx(
              'flex flex-col items-center p-2 rounded-lg transition-colors duration-200 w-20 h-16 justify-center',
               isStreakActive ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500',
               isActive ? activeLinkClass : ''
            )}
            aria-label={`Daily Streak: ${user.currentStreak || 0} days`}
            title={`Daily Streak: ${user.currentStreak || 0} days`}
          >
            <FireIcon className="h-6 w-6" />
            <span className="text-xs mt-1 font-bold">{user.currentStreak || 0}</span>
          </NavLink>
        )}
      </div>
    </nav>
  );
};

export default BottomNav;