import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HomeIcon, BookOpenIcon, ChartBarIcon, CogIcon } from '@heroicons/react/24/outline';

const BottomNav: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { name: 'Home', path: '/', icon: HomeIcon },
    { name: 'Bookmarks', path: '/bookmarks', icon: BookOpenIcon },
    { name: 'Stats', path: '/stats', icon: ChartBarIcon },
    { name: 'Settings', path: '/settings', icon: CogIcon },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white shadow-lg border-t border-gray-200">
      <div className="flex justify-around py-2">
        {navItems.map((item) => (
          <Link
            key={item.name}
            to={item.path}
            className={`flex flex-col items-center p-2 ${
              location.pathname === item.path ? 'text-blue-600' : 'text-gray-600'
            }`}
          >
            <item.icon className="h-6 w-6" />
            <span className="text-xs">{item.name}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;