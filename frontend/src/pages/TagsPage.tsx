// frontend/src/pages/TagsPage.tsx
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTags } from '../services/firestoreService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';

const TagsPage: React.FC = () => {
    const { addToast } = useToast();

    const { data: tags, isLoading, error } = useQuery<string[], Error>({
        queryKey: ['allTags'],
        queryFn: getTags,
        staleTime: 1000 * 60 * 60,
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (error) {
            addToast(`Failed to load tags: ${error.message}`, "error");
        }
    }, [error, addToast]);

    if (isLoading) {
        return <Loader message="Loading tags..." />;
    }

    if (error) {
        return <div className="p-6 text-center text-red-500">Error loading tags.</div>;
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-50">Explore Content by Tags</h1>
            {tags && tags.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">No tags available yet.</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {tags?.map((tag) => (
                        <Link
                            key={tag}
                            to={`/tags/${encodeURIComponent(tag)}`} // Encode tag names for URL safety
                            className="card-base p-4 flex items-center justify-center text-center font-medium text-lg bg-sky-50 dark:bg-sky-950/20 text-sky-800 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900 transition-colors duration-150 rounded-lg shadow-sm"
                        >
                            {tag}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TagsPage;