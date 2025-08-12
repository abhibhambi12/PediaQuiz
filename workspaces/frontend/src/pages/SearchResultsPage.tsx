// --- CORRECTED FILE: workspaces/frontend/src/pages/SearchResultsPage.tsx ---

import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query'; // Import useQuery
import Loader from '@/components/Loader';
import SearchResultItem from '@/components/SearchResultItem';
import { MCQ, Flashcard } from '@pediaquiz/types';
import { db } from '@/firebase'; // Import db for direct Firestore queries
import { collection, query, where, getDocs, or, and, DocumentData } from 'firebase/firestore'; // Import necessary Firestore functions

// Helper function to fetch MCQs by search terms
async function getMcqsBySearchTerms(terms: string[]): Promise<MCQ[]> {
    if (!terms || terms.length === 0) return [];

    const mcqs: MCQ[] = [];
    // Firestore 'array-contains-any' is limited to 10.
    // For general text search, we'll construct OR queries for multiple fields.
    // This can get complex with many terms. For simplicity, we'll do a broad text search.
    // In a real large-scale app, a dedicated search index (e.g., Algolia, Elastic) would be used.
    
    // For now, we'll fetch all MCQs and filter client-side for simplicity, given this is search.
    // If performance is an issue for large datasets, a callable cloud function for search is needed.
    const masterMcqSnapshot = await getDocs(query(collection(db, 'MasterMCQ'), where('status', '==', 'approved')));
    const marrowMcqSnapshot = await getDocs(query(collection(db, 'MarrowMCQ'), where('status', '==', 'approved')));

    const allLibraryMcqs: MCQ[] = [
        ...masterMcqSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MCQ)),
        ...marrowMcqSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MCQ)),
    ];

    const lowerCaseTerms = terms.map(term => term.toLowerCase());
    return allLibraryMcqs.filter(mcq => {
        const contentString = [
            mcq.question,
            ...(Array.isArray(mcq.options) ? mcq.options : []),
            mcq.explanation || '',
            (mcq.tags || []).join(' '),
            mcq.topic || '',
            mcq.chapter || ''
        ].join(' ').toLowerCase();
        return lowerCaseTerms.some(term => contentString.includes(term));
    });
}

// Helper function to fetch Flashcards by search terms
async function getFlashcardsBySearchTerms(terms: string[]): Promise<Flashcard[]> {
    if (!terms || terms.length === 0) return [];

    const flashcards: Flashcard[] = [];
    const flashcardSnapshot = await getDocs(query(collection(db, 'Flashcards'), where('status', '==', 'approved')));
    
    const allLibraryFlashcards: Flashcard[] = flashcardSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Flashcard));

    const lowerCaseTerms = terms.map(term => term.toLowerCase());
    return allLibraryFlashcards.filter(fc => {
        const contentString = [
            fc.front,
            fc.back,
            fc.topic || '',
            fc.chapter || ''
        ].join(' ').toLowerCase();
        return lowerCaseTerms.some(term => contentString.includes(term));
    });
}


const SearchResultsPage: React.FC = () => {
    const { state } = useLocation();
    const query = state?.query || '';
    const allTerms: string[] = state?.allTerms || (query ? [query] : []);

    // REFACTORED: Use specific queries for MCQs and Flashcards
    const { data: mcqs, isLoading: isLoadingMcqs, error: mcqError } = useQuery<MCQ[]>({
        queryKey: ['searchMcqs', allTerms],
        queryFn: () => getMcqsBySearchTerms(allTerms),
        enabled: allTerms.length > 0, // Only run if there are search terms
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    });

    const { data: flashcards, isLoading: isLoadingFlashcards, error: flashcardError } = useQuery<Flashcard[]>({
        queryKey: ['searchFlashcards', allTerms],
        queryFn: () => getFlashcardsBySearchTerms(allTerms),
        enabled: allTerms.length > 0,
        staleTime: 1000 * 60 * 5,
    });

    const searchResults = useMemo(() => {
        const combinedResults: (MCQ | Flashcard)[] = [];
        if (mcqs) combinedResults.push(...mcqs);
        if (flashcards) combinedResults.push(...flashcards);
        // Sort results for consistent display, e.g., by ID or relevance if possible
        return combinedResults.sort((a,b) => a.id.localeCompare(b.id));
    }, [mcqs, flashcards]);

    const isLoading = isLoadingMcqs || isLoadingFlashcards;

    if (isLoading) return <Loader message={`Searching for "${query}"...`} />;
    if (mcqError || flashcardError) return <div className="text-center py-10 text-red-500">Error: {mcqError?.message || flashcardError?.message}</div>;


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