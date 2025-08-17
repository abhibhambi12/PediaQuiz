import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

const HomePage: React.FC = () => {
    const { user } = useAuth();

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Welcome, {user?.displayName || 'Guest'}</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link to="/quiz" className="p-4 bg-blue-100 rounded-lg hover:bg-blue-200">
                    Start Quiz
                </Link>
                <Link to="/flashcards" className="p-4 bg-green-100 rounded-lg hover:bg-green-200">
                    Flashcards
                </Link>
                <Link to="/bookmarks" className="p-4 bg-yellow-100 rounded-lg hover:bg-yellow-200">
                    Bookmarks
                </Link>
                <Link to="/stats" className="p-4 bg-purple-100 rounded-lg hover:bg-purple-200">
                    Stats
                </Link>
            </div>
        </div>
    );
};

export default HomePage;