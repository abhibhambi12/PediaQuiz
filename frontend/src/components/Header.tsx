// MODIFIED: Added XP and Level display for gamification.
//           Improved mobile menu responsiveness and design.

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext'; // Corrected import path
import { MagnifyingGlassIcon, Cog6ToothIcon, Bars3Icon, XMarkIcon, SparklesIcon } from '@heroicons/react/24/outline'; // Importing Heroicons
import clsx from 'clsx';
import { calculateLevelProgress } from '@/utils/gamification'; // Corrected import path

const Header: React.FC = () => {
  const { user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 640) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Removed AdminCompletedJobsPage from adminNavItems as the page route is removed
  const adminNavItems = [
    { name: 'Review', path: '/admin/review' },
    { name: 'Marrow', path: '/admin/marrow' },
    { name: 'Generator', path: '/generator' },
    // { name: 'Archive', path: '/admin/completed' }, // Removed
  ];

  const commonNavItems = [
    { name: 'Search', path: '/search', icon: MagnifyingGlassIcon },
    { name: 'Settings', path: '/settings', icon: Cog6ToothIcon },
  ];

  const { currentLevel, xpForNextLevel, progressToNextLevel } = calculateLevelProgress(user?.xp || 0, user?.level || 1);

  return (
    <header className="bg-gradient-to-r from-sky-600 to-sky-700 text-white p-4 shadow-md">
      <nav className="container mx-auto flex items-center justify-between">
        <Link to="/" className="text-2xl font-bold tracking-tight logo-link">PediaQuiz</Link>

        {/* User Info & XP Bar (Desktop) */}
        {user && !user.isAdmin && (
          <div className="hidden sm:flex items-center space-x-4">
            <div className="text-right text-sm">
              <p className="font-semibold">{user.displayName || user.email}</p>
              <p>Level {currentLevel}</p>
            </div>
            <div className="w-24 bg-sky-500 rounded-full h-2">
              <div
                className="bg-purple-300 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressToNextLevel}%` }}
                title={`XP: ${user?.xp || 0}/${xpForNextLevel}`}
              ></div>
            </div>
          </div>
        )}

        {/* Desktop Navigation */}
        <div className="hidden sm:flex items-center space-x-4">
          {user?.isAdmin && (
            <>
              {adminNavItems.map(item => (
                <Link key={item.name} to={item.path} className="text-white hover:text-sky-100 transition-colors">
                  {item.name}
                </Link>
              ))}
            </>
          )}
          {commonNavItems.map(item => (
            <Link key={item.name} to={item.path} className="text-white hover:text-sky-100 transition-colors" title={item.name}>
              <item.icon className="h-6 w-6" />
            </Link>
          ))}
        </div>

        {/* Mobile Menu Button */}
        <div className="sm:hidden flex items-center">
          <button onClick={toggleMobileMenu} className="text-white hover:text-sky-100 p-2 focus:outline-none focus:ring-2 focus:ring-white rounded">
            {isMobileMenuOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="sm:hidden fixed inset-0 bg-slate-900 bg-opacity-95 z-40 flex flex-col items-center justify-center space-y-8 animate-fade-in-down">
          {user && (
            <div className="flex flex-col items-center mb-6">
              <p className="text-white text-xl font-semibold">{user.displayName || user.email}</p>
              <p className="text-sky-300 text-lg">Level {currentLevel}</p>
              <div className="w-32 bg-sky-500 rounded-full h-2 mt-2">
                <div
                  className="bg-purple-300 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progressToNextLevel}%` }}
                  title={`XP: ${user?.xp || 0}/${xpForNextLevel}`}
                ></div>
              </div>
            </div>
          )}

          {user?.isAdmin && (
            <div className="flex flex-col items-center space-y-4">
              <h3 className="text-xl font-bold text-sky-400 mb-2">Admin Panel</h3>
              {adminNavItems.map(item => (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={toggleMobileMenu}
                  className="text-white text-lg hover:text-sky-200 transition-colors py-2"
                >
                  {item.name}
                </Link>
              ))}
            </div>
          )}
          <div className="flex flex-col items-center space-y-4">
            <Link
              to="/goals"
              onClick={toggleMobileMenu}
              className="text-white text-lg hover:text-sky-200 transition-colors py-2 flex items-center gap-2"
            >
              <SparklesIcon className="h-6 w-6" /> Goals
            </Link>
            <Link
              to="/quick-fire"
              onClick={toggleMobileMenu}
              className="text-white text-lg hover:text-sky-200 transition-colors py-2 flex items-center gap-2"
            >
              <SparklesIcon className="h-6 w-6" /> Quick Fire
            </Link>
            {commonNavItems.map(item => (
              <Link
                key={item.name}
                to={item.path}
                onClick={toggleMobileMenu}
                className="text-white text-lg hover:text-sky-200 transition-colors py-2 flex items-center gap-2"
              >
                <item.icon className="h-6 w-6" /> {item.name}
              </Link>
            ))}
          </div>
          <button onClick={toggleMobileMenu} className="absolute top-4 right-4 text-white hover:text-sky-100 p-2 focus:outline-none focus:ring-2 focus:ring-white rounded">
            <XMarkIcon className="h-8 w-8" />
          </button>
        </div>
      )}
    </header>
  );
};

export default Header;