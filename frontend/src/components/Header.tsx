import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BackIcon } from '@/components/Icons';

const Header: React.FC = () => {
    const { user, loading, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = async () => {
        await logout();
        navigate('/auth');
    };

    // Show back button on any page that is not the homepage
    const showBackButton = location.pathname !== '/';

    return (
        <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm shadow-sm sticky top-0 z-50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center space-x-2">
                        {showBackButton && (
                            <button
                                onClick={() => navigate(-1)}
                                className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                aria-label="Go back"
                            >
                                <BackIcon />
                            </button>
                        )}
                        <Link to="/" className="text-2xl font-bold text-sky-600 dark:text-sky-400 tracking-tight">
                            PediaQuiz
                        </Link>
                    </div>
                    <div className="flex items-center space-x-4">
                        {loading ? (
                            <div className="text-sm font-medium text-slate-500">Loading...</div>
                        ) : user ? (
                            <>
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:inline">
                                    {user.displayName || user.email}
                                </span>
                                <button
                                    onClick={handleLogout}
                                    className="px-4 py-1.5 text-sm rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
                                >
                                    Logout
                                </button>
                            </>
                        ) : (
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