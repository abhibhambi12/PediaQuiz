import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import SearchResultItem from '../components/SearchResultItem';
import { searchContent } from '../services/firestoreService';

const SearchResultsPage: React.FC = () => {
    const location = useLocation();
    const query = new URLSearchParams(location.search).get('q') || '';
    const [results, setResults] = useState<any[]>([]);

    useEffect(() => {
        if (query) {
            searchContent(query).then(setResults).catch(console.error);
        }
    }, [query]);

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Search Results for "{query}"</h1>
            {results.length === 0 ? (
                <p>No results found.</p>
            ) : (
                <div className="space-y-4">
                    {results.map((result) => (
                        <SearchResultItem key={result.id} result={result} onSelect={() => { }} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default SearchResultsPage;