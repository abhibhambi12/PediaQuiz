import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getQuestionsByTag } from '../services/firestoreService'; // Assuming firestoreService exports getQuestionsByTag
import { MCQ } from '@pediaquiz/types'; // Import MCQ type for better typing

const TagQuestionsPage: React.FC = () => {
    // Get the tag parameter from the URL
    const { tagName } = useParams<{ tagName: string }>(); // Use a more descriptive name than 'tag'
    // State to hold the questions associated with the tag
    const [questions, setQuestions] = useState<MCQ[]>([]); // Type the state with MCQ array

    // Effect to fetch questions based on the tag parameter
    useEffect(() => {
        if (tagName) { // Only fetch if tagName is present
            getQuestionsByTag(tagName)
                .then(fetchedQuestions => {
                    // Ensure fetchedQuestions is an array, default to empty if not
                    setQuestions(Array.isArray(fetchedQuestions) ? fetchedQuestions : []);
                })
                .catch(error => {
                    console.error(`Error fetching questions for tag "${tagName}":`, error);
                    setQuestions([]); // Clear questions on error
                });
        }
    }, [tagName]); // Re-run effect if tagName changes

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Questions for Tag: {tagName}</h1>
            {/* Display message if no questions are found for the tag */}
            {questions.length === 0 ? (
                <p>No questions found for the tag "{tagName}".</p>
            ) : (
                // List of questions
                <ul className="space-y-3">
                    {questions.map((question) => (
                        <li key={question.id} className="p-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                            {/* Display question text */}
                            <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">{question.question}</p>
                            {/* Optionally display options or snippet */}
                            <p className="text-sm text-gray-600 dark:text-gray-300">Options: {question.options.join(', ')}</p>
                            {/* Link to view/answer this question could be added here */}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default TagQuestionsPage;