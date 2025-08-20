// frontend/src/pages/SearchResultsPage.tsx
// frontend/src/pages/SearchResultsPage.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useData } from '@/contexts/DataContext';
import { getExpandedSearchTerms } from '@/services/aiService'; // Import from aiService
import { searchContent } from '@/services/firestoreService'; // Import from firestoreService
import Loader from '@/components/Loader';
import SearchResultItem from '@/components/SearchResultItem';
import { useToast } from '@/components/Toast';
// Direct type imports
import { MCQ, Flashcard } from '@pediaquiz/types';

const SearchResultsPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { isLoadingData: isAppDataLoading } = useData(); // Check if global app data is loading

    const queryParams = new URLSearchParams(location.search);
    const initialQuery = queryParams.get('q') || '';

    const [currentSearchQuery, setCurrentSearchQuery] = useState(initialQuery);
    // State to hold all terms used in search (original + expanded)
    const [allSearchTerms, setAllSearchTerms] = useState<string[]>(initialQuery ? [initialQuery] : []);

    // Effect to update internal query state when URL query changes
    useEffect(() => {
        if (initialQuery !== currentSearchQuery) {
            setCurrentSearchQuery(initialQuery);
            setAllSearchTerms(initialQuery ? [initialQuery] : []);
        }
    }, [initialQuery, currentSearchQuery]);

    // Query to get expanded search terms from AI (Feature #2.4)
    const { data: expandedTermsData, isLoading: isLoadingTerms, error: termsError } = useQuery<{ terms: string[] }, Error>({
        queryKey: ['expandedSearchTerms', currentSearchQuery], // Query key depends on the current primary query
        queryFn: async () => {
            if (!currentSearchQuery.trim()) return { terms: [] };
            const response = await getExpandedSearchTerms({ query: currentSearchQuery });
            return response.data;
        },
        enabled: !!currentSearchQuery.trim() && !isAppDataLoading, // Only run if there's a query and app data is loaded
        staleTime: 1000 * 60 * 60, // Cache expanded terms for 1 hour
        refetchOnWindowFocus: false,
    });

    // Update allSearchTerms state once expanded terms are fetched
    useEffect(() => {
        if (termsError) {
            addToast(`Failed to expand search terms: ${termsError.message}. Searching with original query only.`, "warning");
            // Fallback to only original query if AI expansion fails
            setAllSearchTerms([currentSearchQuery]);
        } else if (expandedTermsData?.terms) {
            // Combine original query with expanded terms, ensure uniqueness
            setAllSearchTerms(Array.from(new Set([currentSearchQuery, ...expandedTermsData.terms].filter(Boolean))));
        }
    }, [expandedTermsData, currentSearchQuery, termsError, addToast]);


    // Query to get search results from Firestore based on all generated terms (Feature #2.4)
    const { data: searchResults, isLoading: isLoadingResults, error: searchResultsError } = useQuery<{ mcqs: MCQ[], flashcards: Flashcard[] }, Error>({
        queryKey: ['searchResults', allSearchTerms], // Search results depend on all search terms
        queryFn: async () => {
            if (allSearchTerms.length === 0) return { mcqs: [], flashcards: [] };
            // Call the searchContent callable function on the backend
            const response = await searchContent(currentSearchQuery, allSearchTerms);
            return response;
        },
        // Only run when search terms are ready, app data is loaded, and AI terms are not pending
        enabled: allSearchTerms.length > 0 && !isAppDataLoading && !isLoadingTerms,
        staleTime: 1000 * 60 * 5, // Cache search results for 5 minutes
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (searchResultsError) {
            addToast(`Failed to fetch search results: ${searchResultsError.message}.`, "error");
        }
    }, [searchResultsError, addToast]);

    // Combine MCQs and Flashcards into a single list for rendering
    const combinedResults = useMemo(() => {
        if (!searchResults) return [];
        const uniqueItems = new Map<string, MCQ | Flashcard>();
        searchResults.mcqs.forEach((mcq: MCQ) => uniqueItems.set(mcq.id, { ...mcq, type: 'mcq' }));
        searchResults.flashcards.forEach((fc: Flashcard) => uniqueItems.set(fc.id, { ...fc, type: 'flashcard' }));
        return Array.from(uniqueItems.values());
    }, [searchResults]);

    // Handler for selecting a search result item
    const handleResultSelect = useCallback((item: { id: string, type?: 'mcq' | 'flashcard' | 'chapter', topicId?: string, chapterId?: string }) => {
        if (item.type === 'mcq' && item.topicId && item.chapterId) {
            navigate(`/chapters/${item.topicId}/${item.chapterId}`);
        } else if (item.type === 'flashcard' && item.topicId && item.chapterId) {
            navigate(`/flashcards/${item.topicId}/${item.chapterId}`);
        } else {
            addToast("Cannot navigate to this content type.", "info");
        }
    }, [navigate, addToast]);

    // Determine overall loading state for the page
    const isLoadingPage = isAppDataLoading || isLoadingTerms || isLoadingResults;

    if (isLoadingPage) return <Loader message={`Searching for "${currentSearchQuery}"...`} />;

    if (searchResultsError || termsError) {
        return (
          <div className="text-center py-10 text-red-500">
            Error loading search results. Please try a different query.
            {searchResultsError && <p className="text-sm">Search results error: {searchResultsError.message}</p>}
            {termsError && <p className="text-sm">Terms expansion error: {termsError.message}</p>}
          </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-50">
                Search Results for <span className="text-sky-500">"{initialQuery}"</span>
            </h1>
            {allSearchTerms.length > 1 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Including related terms: {allSearchTerms.slice(1).join(', ')}
                </p>
            )}
            <p className="text-slate-500 dark:text-slate-400">Found {combinedResults.length} result(s).</p>

            {combinedResults.length === 0 ? (
                <div className="text-center py-10 card-base">
                    <p className="text-slate-500 dark:text-slate-400">No content found matching your search term or expanded terms.</p>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">Try a different query or broaden your search.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {combinedResults.map((item: MCQ | Flashcard) => (
                        <SearchResultItem
                            key={item.id}
                            result={{
                                id: item.id,
                                title: (item as MCQ).question || (item as Flashcard).front || '', // Use question for MCQ, front for Flashcard
                                snippet: (item as MCQ).explanation || (item as Flashcard).back || '', // Use explanation for MCQ, back for Flashcard
                                type: item.type,
                                topicId: item.topicId,
                                chapterId: item.chapterId
                            }}
                            onSelect={() => handleResultSelect(item)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default SearchResultsPage;