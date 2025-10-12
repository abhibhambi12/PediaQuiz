// frontend/src/pages/AdminSearchPage.tsx
import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { findContentByText } from '@/services/apiService';
import { useToast } from '@/components/Toast';
import Loader from '@/components/Loader';

const AdminSearchPage: React.FC = () => {
    const { addToast } = useToast();
    const [searchText, setSearchText] = useState('');
    const [results, setResults] = useState<any[] | null>(null);

    const searchMutation = useMutation({
        mutationFn: (text: string) => findContentByText({ searchText: text }),
        onSuccess: (response) => {
            setResults(response.data.results);
            if (response.data.results.length === 0) {
                addToast('No documents found matching that text.', 'info');
            }
        },
        onError: (error: any) => {
            addToast(`Search failed: ${error.message}`, 'error');
        },
    });

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchText.trim()) {
            return addToast('Please enter text to search for.', 'warning');
        }
        setResults(null);
        searchMutation.mutate(searchText.trim());
    };

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">Global Content Search</h1>
            <p className="text-slate-500">
                This tool performs a case-sensitive, prefix-based search across all content collections (`MasterMCQ`, `MarrowMCQ`, `Flashcards`).
                Use it to find orphaned content or verify that content has been saved correctly.
            </p>

            <form onSubmit={handleSearch} className="flex gap-3">
                <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Enter exact question, front text, or name..."
                    className="input-field flex-grow"
                    disabled={searchMutation.isPending}
                />
                <button type="submit" className="btn-primary" disabled={searchMutation.isPending}>
                    {searchMutation.isPending ? 'Searching...' : 'Search'}
                </button>
            </form>

            {searchMutation.isPending && <Loader message="Searching database..." />}
            
            {results && (
                <div className="card-base p-6 space-y-4">
                    <h2 className="text-xl font-bold">Found {results.length} result(s)</h2>
                    {results.map((item) => (
                        <div key={item.id} className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border dark:border-slate-600">
                            <p className="font-mono text-xs text-sky-500">{item.collection} / {item.id}</p>
                            <p className="font-semibold mt-1">{item.question || item.front || item.name}</p>
                            <p className="text-sm text-slate-500 mt-1">Topic: {item.topicName} | Chapter: {item.chapterName}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AdminSearchPage;