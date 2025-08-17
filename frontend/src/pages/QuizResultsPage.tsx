import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getQuizResults } from '../services/firestoreService';

const QuizResultsPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [results, setResults] = useState<any>(null);

    useEffect(() => {
        if (id) {
            getQuizResults(id).then(setResults).catch(console.error);
        }
    }, [id]);

    if (!results) {
        return <div>Loading...</div>;
    }

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Quiz Results</h1>
            <p>Score: {results.score}%</p>
            <p>Correct Answers: {results.correct}</p>
            <p>Total Questions: {results.total}</p>
        </div>
    );
};

export default QuizResultsPage;