import React, { useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BellIcon, Bars3Icon, XMarkIcon, WifiIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { calculateLevelProgress } from '@/utils/gamification';
import { useQuery } from '@tanstack/react-query';
import { getNotifications } from '@/services/apiService';
import NotificationsPanel from '@/components/NotificationsPanel';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { Notification } from '@pediaquiz/types';
import { Menu, Transition } from '@headlessui/react';
import clsx from 'clsx';

const Header: React.FC = () => {
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const { data: notificationsData } = useQuery({
    queryKey: ['unreadNotificationsCount', user?.uid],
    queryFn: async () => {
      if (!user?.uid) return 0;
      const result = await getNotifications({ userId: user.uid });
      return result.data.notifications.filter((n: Notification) => !n.read).length;
    },
    enabled: !!user,
    refetchInterval: 60 * 1000,
  });
  const unreadCount = notificationsData || 0;

  const { currentLevel, progressToNextLevel } = calculateLevelProgress(user?.xp || 0);

  const adminNavItems = [
    { name: 'Review Queue', path: '/admin/review', roles: ['admin', 'faculty'] },
    { name: 'Content Uploader', path: '/generator', roles: ['admin', 'faculty'] },
    { name: 'Content Management', path: '/admin/content-management', roles: ['admin'] },
    { name: 'Tag Management', path: '/admin/tag-management', roles: ['admin'] },
    { name: 'User Management', path: '/admin/users', roles: ['admin'] },
    { name: 'Analytics', path: '/admin/analytics', roles: ['admin'] },
    { name: 'AI Config', path: '/admin/ai-config', roles: ['admin'] },
    { name: 'Audit Logs', path: '/admin/logs', roles: ['admin'] },
    { name: 'Admin Tools', path: '/admin/tools', roles: ['admin'] },
  ];
  
  const userAdminNavs = adminNavItems.filter(item => user?.role && item.roles.includes(user.role));

  return (
    <>
      <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md text-slate-800 dark:text-slate-200 p-4 shadow-sm sticky top-0 z-40 border-b border-slate-200 dark:border-slate-700">
        <nav className="container mx-auto flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold tracking-tight logo-link text-sky-600 dark:text-sky-400">PediaQuiz</Link>

          {user && (
            <div className="hidden sm:flex items-center space-x-4">
              <div className="w-24 bg-slate-200 dark:bg-slate-700 rounded-full h-2 group" title={`Level ${currentLevel}`}>
                <div className="bg-purple-500 h-2 rounded-full transition-all" style={{ width: `${progressToNextLevel}%` }} />
              </div>
              <Link to="/profile" className="text-right text-sm hover:text-sky-500">
                <p className="font-semibold">{user.displayName || user.email}</p>
                <p>Level {currentLevel}</p>
              </Link>
            </div>
          )}

          <div className="flex items-center space-x-2">
            {!isOnline && (
              <div className="flex items-center text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-full">
                <WifiIcon className="h-4 w-4 mr-1" />
                Offline
              </div>
            )}
            <div className="hidden sm:flex items-center space-x-2">
              {user && (
                <button onClick={() => setIsNotificationsOpen(true)} className="relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Open notifications">
                  <BellIcon className="h-6 w-6" />
                  {unreadCount > 0 && <span className="absolute top-1 right-1 h-4 w-4 text-xs flex items-center justify-center font-bold text-white bg-red-600 rounded-full">{unreadCount}</span>}
                </button>
              )}
              {userAdminNavs.length > 0 && (
                <Menu as="div" className="relative">
                  <Menu.Button className="flex items-center text-sm font-medium hover:text-sky-500 px-3 py-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">
                    Admin
                    <ChevronDownIcon className="h-4 w-4 ml-1" />
                  </Menu.Button>
                  <Transition as={Fragment} enter="transition ease-out duration-100" enterFrom="transform opacity-0 scale-95" enterTo="transform opacity-100 scale-100" leave="transition ease-in duration-75" leaveFrom="transform opacity-100 scale-100" leaveTo="transform opacity-0 scale-95">
                    <Menu.Items className="absolute right-0 mt-2 w-48 origin-top-right bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                      <div className="px-1 py-1">
                        {userAdminNavs.map(item => (
                          <Menu.Item key={item.path}>
                            {({ active }) => (
                              <Link to={item.path} className={clsx('group flex w-full items-center rounded-md px-2 py-2 text-sm', active ? 'bg-sky-500 text-white' : 'text-slate-900 dark:text-slate-100')}>
                                {item.name}
                              </Link>
                            )}
                          </Menu.Item>
                        ))}
                      </div>
                    </Menu.Items>
                  </Transition>
                </Menu>
              )}
            </div>
            <button onClick={() => setIsMobileMenuOpen(o => !o)} className="p-2 ml-2 sm:hidden" aria-label="Open mobile menu">
              {isMobileMenuOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
            </button>
          </div>
        </nav>
      </header>
      
      {isMobileMenuOpen && (
        <div className="sm:hidden fixed inset-0 bg-slate-900 bg-opacity-95 z-50 flex flex-col items-center justify-center space-y-8 animate-fade-in-up">
            <button onClick={() => setIsMobileMenuOpen(false)} className="absolute top-4 right-4 text-white p-2" aria-label="Close mobile menu">
                <XMarkIcon className="h-8 w-8" />
            </button>
            {userAdminNavs.length > 0 && (
                <div className="flex flex-col items-center space-y-4">
                    <h3 className="text-xl font-bold text-sky-400 mb-2">Admin Panel</h3>
                    {userAdminNavs.map(item => (
                        <Link key={item.name} to={item.path} onClick={() => setIsMobileMenuOpen(false)} className="text-white text-lg py-2">
                            {item.name}
                        </Link>
                    ))}
                </div>
            )}
        </div>
      )}

      <NotificationsPanel isOpen={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} />
    </>
  );
};

export default Header;