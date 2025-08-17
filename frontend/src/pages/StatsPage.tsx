import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext'; // Assuming AuthContext is correctly set up
import { getUserData } from '../services/userDataService'; // Assuming getUserData fetches user stats
import { UserData } from '@pediaquiz/types'; // Import UserData type if available

const StatsPage: React.FC = () => {
    // Get user info from AuthContext
    const { user } = useAuth();
    // State to store fetched statistics
    const [stats, setStats] = useState<UserData['stats'] | null>(null); // Type assertion for clarity

    // Fetch stats when the component mounts or user changes
    useEffect(() => {
        if (user?.uid) {
            // Assuming getUserData can fetch stats, or a specific getStats function exists
            // If getStats is separate, import and use that instead:
            // import { getStats } from '../services/userDataService';
            // getStats(user.uid).then(setStats).catch(console.error);
            getUserData().then((data: UserData) => {
                setStats(data?.stats || null); // Assuming stats are nested under 'stats' key in UserData
            }).catch(console.error);
        }
    }, [user?.uid]); // Dependency array ensures effect runs when user ID changes

    // Display loading state if stats are not yet fetched
    if (!stats) {
        return (
            <div className="p-6 flex items-center justify-center h-screen">
                <p>Loading statistics...</p>
                {/* Could also use a Loader component here */}
            </div>
        );
    }

    // Display fetched statistics
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Your Statistics</h1>
            {/* Displaying stats, with fallbacks for missing data */}
            <p className="text-lg mb-2">Quizzes Completed: <span className="font-semibold">{stats.quizzesCompleted ?? 0}</span></p>
            <p className="text-lg mb-2">Average Score: <span className="font-semibold">{stats.averageScore ? `${stats.averageScore}%` : 'N/A'}</span></p>
            <p className="text-lg mb-2">Total Study Time: <span className="font-semibold">{stats.studyTime ?? 0} hours</span></p>
            {/* Add more stats as needed */}
        </div>
    );
};

export default StatsPage;