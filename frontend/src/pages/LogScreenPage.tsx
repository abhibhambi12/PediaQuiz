// frontend/src/pages/LogScreenPage.tsx
// frontend/pages/LogScreenPage.tsx
import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLogs } from '../services/userDataService'; // Import from userDataService
import Loader from '../components/Loader';
import { format } from 'date-fns';
import { useToast } from '@/components/Toast'; // Import useToast
import { Timestamp, FieldValue } from 'firebase/firestore'; // Import Timestamp

const LogScreenPage: React.FC = () => {
    const { addToast } = useToast();

    // Use useQuery to fetch user-specific activity logs
    const { data: logs, isLoading, error } = useQuery<any[], Error>({ // Use any[] or define a LogEntry type
        queryKey: ['userLogs'],
        queryFn: async () => {
            const userLogs = await getLogs(); // Calls the backend to get logs for the current user
            // Ensure timestamp is a Date object for formatting, handling FieldValue type
            return userLogs.map(log => ({
                ...log,
                timestamp: log.timestamp instanceof Timestamp ? log.timestamp.toDate() :
                           (log.timestamp instanceof Date ? log.timestamp : new Date()) // Fallback to new Date if FieldValue is still somehow present
            }));
        },
        staleTime: 1000 * 60, // Consider logs stale after 1 minute
        refetchOnWindowFocus: false, // Don't refetch on window focus automatically
    });

    // Display error message using toast if fetching fails
    useEffect(() => {
        if (error) {
            addToast(`Failed to load activity logs: ${error.message}`, "error");
        }
    }, [error, addToast]);

    if (isLoading) {
        return <Loader message="Loading activity logs..." />
    }

    if (error) {
        return <div className="p-6 text-center text-red-500">Error loading logs. Please try again.</div>
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-50">Your Activity Logs</h1>
            <p className="text-slate-500 dark:text-slate-400 mb-4">
                This page displays your recent interactions with the app, such as quiz completions, goal achievements, and AI queries.
            </p>
            <div className="card-base p-6">
                {logs && logs.length === 0 ? (
                    <p className="text-slate-500 dark:text-slate-400 text-center">No recent activity found.</p>
                ) : (
                    <ul className="space-y-3">
                        {logs?.map((log) => (
                            <li key={log.id} className="p-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center text-slate-800 dark:text-slate-200">
                                <span className="flex-1">{log.message}</span>
                                <span className="text-sm text-slate-500 text-right min-w-[120px] ml-4">
                                    {/* Safely format date, providing fallback for invalid dates */}
                                    {log.timestamp && log.timestamp instanceof Date && !isNaN(log.timestamp.getTime()) ? format(log.timestamp, 'MMM d, yyyy, h:mm a') : 'Invalid date'}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default LogScreenPage;