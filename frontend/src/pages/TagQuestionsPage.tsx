// FILE: frontend/src/pages/TagQuestionsPage.tsx
// MODIFIED: Fixed implicit any and missing types. Continues to use `useData()` for content.

import React, { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useData } from '@/contexts/DataContext'; // IMPORTANT: Using useData
import Loader from '@/components/Loader';
import SearchResultItem from '@/components/SearchResultItem';
import { MCQ } from '@pediaquiz/types'; // FIXED: Ensure MCQ type is imported

const TagQuestionsPage: React.FC = () => {
    const { tagName } = useParams<{ tagName: string }>();
    const { data: appData, isLoading, error } = useData(); // IMPORTANT: Using useData

    const decodedTagName = useMemo(() => {
        if (tagName) {
            return decodeURIComponent(tagName).replace(/_/g, ' ');
        }
        return '';
    }, [tagName]);

    const filteredMcqs = useMemo(() => {
        if (!appData?.mcqs || !decodedTagName) return [];
        return appData.mcqs.filter((mcq: MCQ) => // FIXED: Explicitly typed mcq
            mcq.tags && mcq.tags.some((tag: string) => tag.toLowerCase() === decodedTagName.toLowerCase()) // FIXED: Explicitly typed tag
        );
    }, [appData, decodedTagName]);

    if (isLoading) return <Loader message={`Loading questions for "${decodedTagName}"...`} />;

    if (error) return <div className="text-center py-10 text-red-500">Error: {error.message}</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Questions Tagged: <span className="text-sky-500">"{decodedTagName}"</span></h1>
            <p className="text-slate-500 dark:text-slate-400">{filteredMcqs.length} question(s) found.</p>

            {filteredMcqs.length === 0 ? (
                <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-lg shadow-md">
                    <p className="text-slate-500">No questions found with this tag.</p>
                    <Link to="/tags" className="mt-4 inline-block px-4 py-2 bg-sky-500 text-white rounded-md hover:bg-sky-600 transition-colors">
                        Browse All Tags
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredMcqs.map((item: MCQ) => ( // FIXED: Explicitly typed item
                        <SearchResultItem key={item.id} item={item} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default TagQuestionsPage;