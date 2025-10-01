import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { searchContent } from '@/services/apiService';
import Loader from '@/components/Loader';
import { MCQ, Flashcard } from '@pediaquiz/types';
import SearchResultItem, { SearchResult } from '@/components/SearchResultItem';

const SearchResultsPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const query = new URLSearchParams(location.search).get('q') || '';

    const { data, isLoading } = useQuery({
        queryKey: ['searchResults', query],
        queryFn: async () => {
            if (!query.trim()) return [];
            const response = await searchContent({ query, terms: [query] });
            const mcqs: SearchResult[] = (response.data.mcqs || []).map((mcq: MCQ) => ({ id: mcq.id, title: mcq.question, snippet: mcq.explanation || '', type: 'mcq', topicId: mcq.topicId, chapterId: mcq.chapterId }));
            const flashcards: SearchResult[] = (response.data.flashcards || []).map((fc: Flashcard) => ({ id: fc.id, title: fc.front, snippet: fc.back, type: 'flashcard', topicId: fc.topicId, chapterId: fc.chapterId }));
            return [...mcqs, ...flashcards];
        },
        enabled: !!query.trim(),
    });

    const handleSelect = (item: SearchResult) => {
        const path = item.type === 'mcq' ? `/chapters/${item.topicId}/${item.chapterId}` : `/flashcards/${item.topicId}/${item.chapterId}`;
        navigate(path);
    };

    if (isLoading) return <Loader fullScreen message={`Searching for "${query}"...`} />;

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold">Search Results for <span className="text-sky-500">"{query}"</span></h1>
            {data && data.length > 0 ? (
                <div className="space-y-4">
                    {data.map(item => <SearchResultItem key={item.id} result={item} onSelect={handleSelect} />)}
                </div>
            ) : (
                <div className="text-center py-10 card-base"><p className="text-slate-500">No results found.</p></div>
            )}
        </div>
    );
};
export default SearchResultsPage;