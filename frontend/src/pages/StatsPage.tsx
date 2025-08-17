import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getStats } from '../services/userDataService';

const StatsPage: React.FC = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        if (user) {
            getStats(user.uid).then(setStats).catch(console.error);
        }
    }, [user]);

    if (!stats) {
        return <div>Loading...</div>;
    }

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Your Stats</h1>
            <p>Quizzes Completed: {stats.quizzesCompleted}</p>
            <p>Average Score: {stats.averageScore}%</p>
            <p>Total Study Time: {stats.studyTime} hours</p>
        </div>
    );
};

export default StatsPage;