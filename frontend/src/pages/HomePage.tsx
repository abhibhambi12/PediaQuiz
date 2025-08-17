import React from 'react';
import { useAuth } from '../contexts/AuthContext'; // Assuming AuthContext is correctly set up
import { Link } from 'react-router-dom';

const HomePage: React.FC = () => {
    // Get user information from the AuthContext
    const { user } = useAuth();

    return (
        <div className="p-6">
            {/* Display welcome message using user's display name */}
            <h1 className="text-2xl font-bold mb-4">Welcome, {user?.displayName || 'Guest'}</h1>
            {/* Grid for navigation links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Link to start a quiz session */}
                <Link to="/quiz" className="p-4 bg-blue-100 rounded-lg hover:bg-blue-200 flex items-center justify-center text-lg font-semibold">
                    Start Quiz
                </Link>
                {/* Link to flashcard sessions */}
                <Link to="/flashcards" className="p-4 bg-green-100 rounded-lg hover:bg-green-200 flex items-center justify-center text-lg font-semibold">
                    Flashcards
                </Link>
                {/* Link to user's bookmarks */}
                <Link to="/bookmarks" className="p-4 bg-yellow-100 rounded-lg hover:bg-yellow-200 flex items-center justify-center text-lg font-semibold">
                    Bookmarks
                </Link>
                {/* Link to user's statistics */}
                <Link to="/stats" className="p-4 bg-purple-100 rounded-lg hover:bg-purple-200 flex items-center justify-center text-lg font-semibold">
                    Stats
                </Link>
            </div>
        </div>
    );
};

export default HomePage;