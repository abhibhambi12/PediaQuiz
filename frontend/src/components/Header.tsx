// FILE: frontend/src/components/Header.tsx

import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BackIcon, SunIcon, MoonIcon } from '@/components/Icons'; // NEW IMPORTS: SunIcon, MoonIcon
import { usePersistentState } from '@/hooks/usePersistentState'; // NEW IMPORT: usePersistentState
import clsx from 'clsx'; // NEW IMPORT: clsx for conditional classes

const Header: React.FC = () => {
    const { user, loading, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    // --- NEW: Persistent state for theme toggle ---
    const [theme, setTheme] = usePersistentState<'light' | 'dark'>('theme', 'light');

    // --- NEW: Effect to apply theme class to HTML element ---
    React.useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);
    // --- END NEW ---

    const handleLogout = async () => {
        await logout();
        navigate('/auth');
    };

    // Show back button on any page that is not the homepage
    const showBackButton = location.pathname !== '/';

    return (
        // --- UPDATED CLASSES: To use new Tailwind color palette ---
        <header className="bg-neutral-50/80 dark:bg-neutral-900/80 backdrop-blur-sm shadow-sm sticky top-0 z-50 border-b border-neutral-200 dark:border-neutral-700">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center space-x-2">
                        {showBackButton && (
                            <button
                                onClick={() => navigate(-1)}
                                // --- UPDATED CLASSES ---
                                className="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                                aria-label="Go back"
                            >
                                <BackIcon />
                            </button>
                        )}
                        {/* --- UPDATED CLASSES --- */}
                        <Link to="/" className="text-2xl font-bold text-primary-600 dark:text-primary-400 tracking-tight">
                            PediaQuiz
                        </Link>
                    </div>
                    <div className="flex items-center space-x-4">
                        {loading ? (
                            // --- UPDATED CLASSES ---
                            <div className="text-sm font-medium text-neutral-500">Loading...</div>
                        ) : user ? (
                            <>
                                {/* --- NEW FEATURE: Current Streak Display --- */}
                                {user.currentStreak !== undefined && user.currentStreak > 0 && (
                                    <div className={clsx(
                                        "flex items-center text-sm font-semibold text-warning-500 dark:text-warning-400 mr-2",
                                        "animate-pop-in bg-warning-100 dark:bg-warning-500/20 px-3 py-1 rounded-full"
                                    )}>
                                        <span>🔥</span>
                                        <span className="ml-1.5">{user.currentStreak} day streak!</span>
                                    </div>
                                )}
                                {/* --- END NEW FEATURE --- */}

                                {/* --- NEW: Theme Toggle Button --- */}
                                <button
                                    onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                                    // --- UPDATED CLASSES ---
                                    className="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                                    title={theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
                                >
                                    {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                                </button>
                                {/* --- END NEW --- */}

                                {/* --- UPDATED CLASSES --- */}
                                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 hidden sm:inline">
                                    {user.displayName || user.email?.split('@')[0]}
                                </span>
                                <button
                                    onClick={handleLogout}
                                    // --- UPDATED CLASSES ---
                                    className="px-4 py-1.5 text-sm rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
                                >
                                    Logout
                                </button>
                            </>
                        ) : (
                            // --- UPDATED CLASSES ---
                            <Link to="/auth" className="px-4 py-1.5 text-sm rounded-md bg-sky-500 text-white hover:bg-sky-600 transition-colors">
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