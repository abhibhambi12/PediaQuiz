// --- CORRECTED FILE: workspaces/frontend/src/components/Header.tsx ---

import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BackIcon, SunIcon, MoonIcon } from '@/components/Icons';
import { usePersistentState } from '@/hooks/usePersistentState';
import clsx from 'clsx';

const Header: React.FC = () => {
    const { user, loading, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [theme, setTheme] = usePersistentState<'light' | 'dark'>('theme', 'light');

    React.useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    const handleLogout = async () => {
        await logout();
        navigate('/auth');
    };

    const showBackButton = location.pathname !== '/';

    return (
        <header className="bg-neutral-50/80 dark:bg-neutral-900/80 backdrop-blur-sm shadow-sm sticky top-0 z-50 border-b border-neutral-200 dark:border-neutral-700">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center space-x-2">
                        {showBackButton && (
                            <button
                                onClick={() => navigate(-1)}
                                className="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                                aria-label="Go back"
                            >
                                <BackIcon />
                            </button>
                        )}
                        <Link to="/" className="text-2xl font-bold text-primary-600 dark:text-primary-400 tracking-tight">
                            PediaQuiz
                        </Link>
                    </div>
                    <div className="flex items-center space-x-4">
                        {loading ? (
                            <div className="text-sm font-medium text-neutral-500">Loading...</div>
                        ) : user ? (
                            <>
                                {user.currentStreak !== undefined && user.currentStreak > 0 && (
                                    <div className={clsx(
                                        "flex items-center text-sm font-semibold text-warning-500 dark:text-warning-400 mr-2",
                                        "animate-pop-in bg-warning-100 dark:bg-warning-500/20 px-3 py-1 rounded-full"
                                    )}>
                                        <span>🔥</span>
                                        <span className="ml-1.5">{user.currentStreak} day streak!</span>
                                    </div>
                                )}
                                
                                <button
                                    onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                                    className="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                                    title={theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
                                >
                                    {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                                </button>

                                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 hidden sm:inline">
                                    {user.displayName || user.email?.split('@')[0]}
                                </span>
                                <button
                                    onClick={handleLogout}
                                    className="btn-danger py-1.5 px-4"
                                >
                                    Logout
                                </button>
                            </>
                        ) : (
                            <Link to="/auth" className="btn-primary py-1.5 px-4">
                                Login
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;