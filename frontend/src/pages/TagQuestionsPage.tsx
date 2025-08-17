import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getQuestionsByTag } from '../services/firestoreService';

const TagQuestionsPage: React.FC = () => {
    const { tag } = useParams<{ tag: string }>();
    const [questions, setQuestions] = useState<any[]>([]);

    useEffect(() => {
        if (tag) {
            getQuestionsByTag(tag).then(setQuestions).catch(console.error);
        }
    }, [tag]);

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Questions for Tag: {tag}</h1>
            <ul>
                {questions.map((question) => (
                    <li key={question.id} className="p-2 border-b">
                        {question.title}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default TagQuestionsPage;