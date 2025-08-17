import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTest } from '../services/firestoreService';

const CustomTestBuilder: React.FC = () => {
    const [title, setTitle] = useState('');
    const [questions, setQuestions] = useState<string[]>([]);
    const navigate = useNavigate();

    const handleAddQuestion = () => {
        setQuestions([...questions, '']);
    };

    const handleQuestionChange = (index: number, value: string) => {
        const newQuestions = [...questions];
        newQuestions[index] = value;
        setQuestions(newQuestions);
    };

    const handleSubmit = async () => {
        try {
            await createTest({ title, questions });
            navigate('/tests');
        } catch (error) {
            console.error('Failed to create test:', error);
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Create Custom Test</h1>
            <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Test Title</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full p-2 border rounded"
                />
            </div>
            {questions.map((q, index) => (
                <div key={index} className="mb-4">
                    <label className="block text-sm font-medium mb-1">Question {index + 1}</label>
                    <input
                        type="text"
                        value={q}
                        onChange={(e) => handleQuestionChange(index, e.target.value)}
                        className="w-full p-2 border rounded"
                    />
                </div>
            ))}
            <button
                onClick={handleAddQuestion}
                className="p-2 bg-gray-200 rounded mb-4"
            >
                Add Question
            </button>
            <button
                onClick={handleSubmit}
                className="p-2 bg-blue-600 text-white rounded"
            >
                Create Test
            </button>
        </div>
    );
};

export default CustomTestBuilder;