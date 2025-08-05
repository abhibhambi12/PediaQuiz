import React, { useState, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import Loader from '@/components/Loader';
import { Link } from 'react-router-dom';

const TagsPage: React.FC = () => {
    const { data: appData, isLoading, error } = useData();
    const [searchTerm, setSearchTerm] = useState('');

    const allTags = useMemo(() => appData?.keyClinicalTopics || [], [appData]);

    const filteredTags = useMemo(() => {
        if (!searchTerm.trim()) {
            return allTags;
        }
        const lowerCaseSearch = searchTerm.toLowerCase();
        return allTags.filter(tag => tag.toLowerCase().includes(lowerCaseSearch));
    }, [allTags, searchTerm]);

    if (isLoading) return <Loader message="Loading tags..." />;
    if (error) return <div className="text-center py-10 text-red-500">Error: {error.message}</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">All Clinical Tags</h1>
            <p className="text-slate-500 dark:text-slate-400">
                Explore questions grouped by key clinical topics.
            </p>

            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-md">
                <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search tags..."
                    className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
            </div>

            {filteredTags.length === 0 ? (
                <div className="text-center py-8 bg-white dark:bg-slate-800 rounded-lg shadow-md">
                    <p className="text-slate-500">
                        {allTags.length > 0 ? "No tags found matching your search." : "No tags found yet. Tags are generated when new content is approved."}
                    </p>
                </div>
            ) : (
                <div className="flex flex-wrap gap-3">
                    {filteredTags.map(tag => (
                        <Link
                            key={tag}
                            to={`/tags/${encodeURIComponent(tag.replace(/\s+/g, '_').toLowerCase())}`}
                            className="px-4 py-2 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 font-semibold hover:bg-sky-200 dark:hover:bg-sky-800 transition-colors"
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