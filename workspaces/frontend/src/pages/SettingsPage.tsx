import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePersistentState } from '@/hooks/usePersistentState';
import { SunIcon, MoonIcon } from '@/components/Icons';
import { useToast } from '@/components/Toast';
import { useQueryClient } from '@tanstack/react-query';

const SettingsPage: React.FC = () => {
    const { user, logout } = useAuth();
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    const [theme, setTheme] = usePersistentState<'light' | 'dark'>('theme', 'light');
    const navigate = useNavigate();

    React.useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    const handleRefreshData = () => {
        addToast("Refreshing app data...", "info");
        queryClient.invalidateQueries({ queryKey: ['appData'] });
        queryClient.invalidateQueries({ queryKey: ['topics'] });
        addToast("Data refresh complete!", "success");
    };

    const handleResetProgress = () => {
        addToast("Resetting progress is not yet implemented.", "info");
    };

    const handleLogout = async () => {
        try {
            await logout();
            addToast("Logged out successfully!", "success");
            navigate('/auth');
        } catch (error) {
            addToast("Error logging out.", "danger");
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-200">Settings</h1>
            <div className="space-y-6">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm">
                    <h2 className="font-bold text-lg mb-2 text-slate-800 dark:text-slate-200">Appearance</h2>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-700 dark:text-slate-300">Theme</span>
                        <div className="flex items-center space-x-2 p-1 bg-slate-200 dark:bg-slate-700 rounded-full">
                            <button onClick={() => setTheme('light')} className={`p-1.5 rounded-full transition-colors ${theme === 'light' ? 'bg-white shadow' : ''}`}><SunIcon/></button>
                            <button onClick={() => setTheme('dark')} className={`p-1.5 rounded-full ${theme === 'dark' ? 'bg-slate-800 shadow text-white' : ''}`}><MoonIcon/></button>
                        </div>
                    </div>
                </div>

                {user?.isAdmin && (
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm">
                        <h2 className="font-bold text-lg mb-3 text-slate-800 dark:text-slate-200">Admin Panel</h2>
                        <div className="space-y-3">
                             <Link to="/admin/marrow" className="block w-full text-left p-3 rounded-lg bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors font-semibold">
                                🎯 Marrow Pipeline (Image PDFs)
                            </Link>
                            <Link to="/generator" className="block w-full text-left p-3 rounded-lg bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors font-semibold">
                                ✨ General Pipeline (Text/PDFs)
                            </Link>
                            <Link to="/admin/review" className="block w-full text-left p-3 rounded-lg bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/50 transition-colors font-semibold">
                                👑 Content Review Queue
                            </Link>
                            <Link to="/admin/completed" className="block w-full text-left p-3 rounded-lg bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors font-semibold">
                                📚 Completed Jobs
                            </Link>
                            <Link to="/log-screen" className="block w-full text-left p-3 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-semibold">
                                📜 AI Processing Logs
                            </Link>
                        </div>
                    </div>
                )}

                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm">
                    <h2 className="font-bold text-lg mb-3 text-slate-800 dark:text-slate-200">Data Management</h2>
                    <div className="space-y-3">
                         <button onClick={handleRefreshData} className="w-full text-left p-3 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-slate-700 dark:text-slate-300 font-medium">Refresh App Data</button>
                        <button onClick={handleResetProgress} className="w-full text-left p-3 rounded-lg bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors font-medium">Reset All User Progress</button>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm">
                    <h2 className="font-bold text-lg mb-3 text-slate-800 dark:text-slate-200">Account</h2>
                    <button onClick={handleLogout} className="btn-danger w-full">Log Out</button>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;