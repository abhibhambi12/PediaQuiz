import React, { useEffect, useState } from 'react';
import { getLogs } from '../services/firestoreService';

const LogScreenPage: React.FC = () => {
    const [logs, setLogs] = useState<any[]>([]);

    useEffect(() => {
        getLogs().then(setLogs).catch(console.error);
    }, []);

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Activity Logs</h1>
            <ul>
                {logs.map((log, index) => (
                    <li key={index} className="p-2 border-b">
                        {log.message} - {new Date(log.timestamp).toLocaleString()}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default LogScreenPage;