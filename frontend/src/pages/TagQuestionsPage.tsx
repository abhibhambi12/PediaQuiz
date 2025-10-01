import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getQuestionsByTag } from '@/services/apiService';
import Loader from '@/components/Loader';
import type { MCQ } from '@pediaquiz/types';

const TagQuestionsPage: React.FC = () => {
    const { tagName } = useParams<{ tagName: string }>();

    const { data: questions, isLoading } = useQuery<MCQ[], Error>({
        queryKey: ['questionsByTag', tagName],
        queryFn: async () => !tagName ? [] : (await getQuestionsByTag({ tagName })).data.mcqs,
        enabled: !!tagName,
    });

    if (isLoading) return <Loader fullScreen message={`Loading questions for "${tagName}"...`} />;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Tag: <span className="text-sky-500">{tagName}</span></h1>
            <div className="space-y-4">
                {questions && questions.length === 0 && <p className="text-slate-500">No questions found for this tag.</p>}
                {questions?.map((mcq) => (
                    <div key={mcq.id} className="card-base p-4 list-none">
                        <p className="font-medium text-lg mb-2">{mcq.question}</p>
                        <p className="text-sm text-slate-500">{mcq.topicName} &gt; {mcq.chapterName}</p>
                        <Link to={`/chapters/${mcq.topicId}/${mcq.chapterId}`} className="text-sky-600 hover:underline text-sm mt-2 inline-block">View Chapter</Link>
                    </div>
                ))}
            </div>
        </div>
    );
};
export default TagQuestionsPage;