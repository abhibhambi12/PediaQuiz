import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTest } from '../services/firestoreService'; // Assuming this service function exists
import { useToast } from '@/components/Toast'; // For user feedback

// Define the structure for a question
interface Question {
    id?: string; // Optional ID if questions are stored with IDs
    text: string;
}

const CustomTestBuilder: React.FC = () => {
    // State for test title and the list of questions
    const [title, setTitle] = useState('');
    const [questions, setQuestions] = useState<Question[]>([]); // Array of question objects
    const navigate = useNavigate(); // Hook for navigation
    const { addToast } = useToast(); // Hook for displaying toast messages

    // Handler to add a new, empty question input field
    const handleAddQuestion = () => {
        setQuestions([...questions, { text: '' }]); // Add a new question object with empty text
    };

    // Handler to update the text of a specific question
    const handleQuestionChange = (index: number, value: string) => {
        const newQuestions = [...questions]; // Create a mutable copy of the questions array
        newQuestions[index] = { ...newQuestions[index], text: value }; // Update the specific question's text
        setQuestions(newQuestions); // Update the state
    };

    // Handler to remove a question
    const handleRemoveQuestion = (index: number) => {
        const newQuestions = questions.filter((_, i) => i !== index);
        setQuestions(newQuestions);
    };

    // Handler to submit the test
    const handleSubmit = async () => {
        // Basic validation: ensure title and at least one question exist
        if (!title.trim()) {
            addToast("Test title cannot be empty.", "error");
            return;
        }
        if (questions.length === 0 || questions.every(q => !q.text.trim())) {
            addToast("Please add at least one question.", "error");
            return;
        }

        try {
            // Call the service to create the test
            const newTestId = await createTest({ title: title.trim(), questions: questions.map(q => q.text.trim()) }); // Pass cleaned data
            addToast("Custom test created successfully!", "success");
            navigate('/tests'); // Navigate to a page showing created tests (assuming '/tests' route exists)
        } catch (error: any) {
            console.error('Failed to create test:', error);
            addToast(`Failed to create test: ${error.message}`, "error");
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Create Custom Test</h1>
            {/* Test Title Input */}
            <div className="mb-4">
                <label htmlFor="testTitle" className="block text-sm font-medium mb-1">Test Title</label>
                <input
                    id="testTitle"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter test title"
                    className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
            </div>

            {/* Questions List */}
            {questions.map((q, index) => (
                <div key={index} className="mb-4 p-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex items-center">
                    <div className="flex-grow mr-4">
                        <label htmlFor={`question-${index}`} className="block text-sm font-medium mb-1">Question {index + 1}</label>
                        <input
                            id={`question-${index}`}
                            type="text"
                            value={q.text}
                            onChange={(e) => handleQuestionChange(index, e.target.value)}
                            placeholder={`Question ${index + 1} text`}
                            className="w-full p-2 border-0 focus:ring-0 bg-transparent focus:outline-none" // Input styled within the card context
                        />
                    </div>
                    {/* Remove Question Button */}
                    <button
                        onClick={() => handleRemoveQuestion(index)}
                        className="text-red-500 hover:text-red-700 focus:outline-none"
                        aria-label={`Remove Question ${index + 1}`}
                    >
                        &times; {/* Simple 'x' icon */}
                    </button>
                </div>
            ))}

            {/* Action Buttons */}
            <div className="flex justify-between items-center mt-6">
                {/* Add Question Button */}
                <button
                    onClick={handleAddQuestion}
                    className="px-4 py-2 bg-sky-500 text-white rounded-md hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 transition-colors duration-200"
                >
                    Add Question
                </button>
                {/* Create Test Button */}
                <button
                    onClick={handleSubmit}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                // disabled={isCreatingTest} // Add loading state if needed
                >
                    Create Test
                </button>
            </div>
        </div>
    );
};

export default CustomTestBuilder;