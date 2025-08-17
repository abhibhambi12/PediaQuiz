// frontend/src/pages/SearchResultsPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import SearchResultItem from '../components/SearchResultItem'; // Assuming this component exists
import { searchContent } from '../services/firestoreService'; // Corrected: Import from firestoreService
import Loader from '../components/Loader';
import { useToast } from '../components/Toast';
import type { MCQ, Flashcard } from '@pediaquiz/types';

const SearchResultsPage: React.FC = () => {
    const location = useLocation();
    const { addToast } = useToast();
    const [searchResults, setSearchResults] = useState<Array<MCQ | Flashcard>>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentQuery, setCurrentQuery] = useState('');

    const queryParams = new URLSearchParams(location.search);
    const query = queryParams.get('q') || '';

    const performSearch = useCallback(async (searchQuery: string) => {
        if (!searchQuery) {
            setSearchResults([]);
            return;
        }

        setIsLoading(true);
        setCurrentQuery(searchQuery); // Update state with the query being searched
        try {
            const result = await searchContent(searchQuery); // Call the backend search function
            setSearchResults([...result.mcqs, ...result.flashcards]); // Combine MCQs and Flashcards
        } catch (error) {
            console.error("Failed to perform search:", error);
            addToast("Failed to perform search. Please try again.", "error");
            setSearchResults([]);
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        performSearch(query);
    }, [query, performSearch]); // Rerun search when 'q' param changes

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-4">Search Results for "{currentQuery}"</h1>
            {isLoading && <Loader message="Searching..." />}
            
            {!isLoading && searchResults.length === 0 ? (
                <p className="text-slate-500">No results found for "{currentQuery}".</p>
            ) : (
                <div className="space-y-4">
                    {searchResults.map((result) => (
                        <SearchResultItem 
                            key={result.id} 
                            result={{ 
                                id: result.id, 
                                title: (result as MCQ).question || (result as Flashcard).front || 'No Title', 
                                snippet: (result as MCQ).explanation || (result as Flashcard).back || 'No Snippet' 
                            }} 
                            onSelect={() => { 
                                // TODO: Implement navigation to relevant content detail page
                                console.log('Selected:', result.id);
                            }} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default SearchResultsPage;