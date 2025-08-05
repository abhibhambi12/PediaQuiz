import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useData } from '@/contexts/DataContext';
import Loader from '@/components/Loader';
import SearchResultItem from '@/components/SearchResultItem';
import { MCQ, Flashcard } from '@pediaquiz/types';

const SearchResultsPage: React.FC = () => {
    const { state } = useLocation();
    const { data: appData, isLoading } = useData();
    const query = state?.query || '';

    const searchResults = useMemo(() => {
        if (!appData) return [];

        const lowerCaseQuery = query.toLowerCase();
        if (lowerCaseQuery.length < 3) return [];
        
        const matchingMcqs = (appData.mcqs || []).filter((mcq: MCQ) => {
            // CRITICAL FIX: Ensure mcq.options is an array before calling .some()
            const optionsIsArray = Array.isArray(mcq.options);
            return (
                mcq.question.toLowerCase().includes(lowerCaseQuery) ||
                (optionsIsArray && mcq.options.some(opt => opt.toLowerCase().includes(lowerCaseQuery))) ||
                (mcq.explanation || '').toLowerCase().includes(lowerCaseQuery)
            );
        });

        const matchingFlashcards = (appData.flashcards || []).filter((fc: Flashcard) => 
            fc.front.toLowerCase().includes(lowerCaseQuery) ||
            fc.back.toLowerCase().includes(lowerCaseQuery)
        );
        
        return [...matchingMcqs, ...matchingFlashcards];
    }, [appData, query]);

    if (isLoading) return <Loader message={`Searching for "${query}"...`} />;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">
                Search Results for <span className="text-sky-500">"{query}"</span>
            </h1>
            <p className="text-slate-500">{searchResults.length} result(s) found.</p>

            {searchResults.length === 0 ? (
                <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-lg shadow-md">
                    <p className="text-slate-500">No content found matching your search term.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {searchResults.map(item => (
                        <SearchResultItem key={item.id} item={item} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default SearchResultsPage;