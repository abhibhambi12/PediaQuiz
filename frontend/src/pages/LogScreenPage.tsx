import React, { useEffect, useState } from 'react';
import { getLogs } from '../services/userDataService'; // CORRECTED: Import from secure userDataService
import Loader from '../components/Loader';
import { format } from 'date-fns';

const LogScreenPage: React.FC = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            setIsLoading(true);
            const userLogs = await getLogs();
            setLogs(userLogs);
            setIsLoading(false);
        };
        fetchLogs();
    }, []);

    if (isLoading) {
        return <Loader message="Loading activity logs..." />
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-4">Your Activity Logs</h1>
            <div className="card-base p-4">
                {logs.length === 0 ? (
                    <p>No recent activity found.</p>
                ) : (
                    <ul className="space-y-3">
                        {logs.map((log) => (
                            <li key={log.id} className="p-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                <span>{log.message}</span>
                                <span className="text-sm text-slate-500">
                                    {log.timestamp ? format(log.timestamp.toDate(), 'PPpp') : 'No date'}
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