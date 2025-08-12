// FILE: frontend/src/pages/SearchResultsPage.tsx
// MODIFIED: Styling updates only. Continues to use `useData()` for content.

import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useData } from '@/contexts/DataContext'; // IMPORTANT: Using useData for appData
import Loader from '@/components/Loader';
import SearchResultItem from '@/components/SearchResultItem';
import { MCQ, Flashcard } from '@pediaquiz/types';

const SearchResultsPage: React.FC = () => {
    const { state } = useLocation();
    const { data: appData, isLoading } = useData(); // IMPORTANT: Using useData
    const query = state?.query || '';
    const allTerms: string[] = state?.allTerms || (query ? [query] : []);

    const searchResults = useMemo(() => {
        // IMPORTANT: Filters directly from appData.mcqs and appData.flashcards
        if (!appData || allTerms.length === 0) return [];

        const lowerCaseTerms = allTerms.map(term => term.toLowerCase());
        
        const matchingMcqs = (appData.mcqs || []).filter((mcq: MCQ) => {
            const optionsIsArray = Array.isArray(mcq.options);
            const contentString = [
                mcq.question,
                ...(optionsIsArray ? mcq.options : []),
                mcq.explanation || ''
            ].join(' ').toLowerCase();

            return lowerCaseTerms.some(term => contentString.includes(term));
        });

        const matchingFlashcards = (appData.flashcards || []).filter((fc: Flashcard) => {
             const contentString = [
                fc.front,
                fc.back
            ].join(' ').toLowerCase();
            
            return lowerCaseTerms.some(term => contentString.includes(term));
        });
        
        return [...matchingMcqs, ...matchingFlashcards];
    }, [appData, allTerms]); // DEPENDS ON appData

    if (isLoading) return <Loader message={`Searching for "${query}"...`} />;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">
                Search Results for <span className="text-sky-500">"{query}"</span>
            </h1>
            {allTerms.length > 1 && (
                <p className="text-sm text-slate-400">
                    Including related terms: {allTerms.slice(1).join(', ')}
                </p>
            )}
            <p className="text-slate-500">{searchResults.length} result(s) found.</p>

            {searchResults.length === 0 ? (
                // --- UPDATED CLASSES: using card-base utility class ---
                <div className="text-center py-10 card-base">
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