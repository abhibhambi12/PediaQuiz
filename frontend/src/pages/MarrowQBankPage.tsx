import React, { useEffect, useState } from 'react';
import { getQuestions } from '../services/firestoreService';
import { useNavigate } from 'react-router-dom';

const MarrowQBankPage: React.FC = () => {
    const [questions, setQuestions] = useState<any[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        getQuestions().then(setQuestions).catch(console.error);
    }, []);

    const handleSelect = (id: string) => {
        navigate(`/question/${id}`);
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Marrow Question Bank</h1>
            <ul>
                {questions.map((question) => (
                    <li
                        key={question.id}
                        className="p-2 border-b cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSelect(question.id)}
                    >
                        {question.title}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default MarrowQBankPage;