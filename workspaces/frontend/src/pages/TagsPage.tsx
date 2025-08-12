// --- CORRECTED FILE: workspaces/frontend/src/pages/TagsPage.tsx ---

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Loader from '@/components/Loader';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { db } from '@/firebase';
import { collection, getDocs, orderBy } from 'firebase/firestore';
import type { Topic } from '@pediaquiz/types'; // FIX: Ensure Topic is imported if needed, not strictly for TagsPage itself

// Helper function to fetch all key clinical topics
async function getKeyClinicalTopics(): Promise<string[]> {
    const snapshot = await getDocs(collection(db, 'KeyClinicalTopics'));
    return snapshot.docs.map(doc => doc.data().name as string).sort();
}

const TagsPage: React.FC = () => {
    const { data: allTags, isLoading, error } = useQuery<string[]>({
        queryKey: ['keyClinicalTopics'],
        queryFn: getKeyClinicalTopics,
        staleTime: 1000 * 60 * 60,
    });

    const [searchTerm, setSearchTerm] = useState('');

    const filteredTags = useMemo(() => {
        if (!searchTerm.trim()) {
            return allTags || []; // FIX: Handle allTags possibly undefined
        }
        const lowerCaseSearch = searchTerm.toLowerCase();
        return (allTags || []).filter((tag: string) => tag.toLowerCase().includes(lowerCaseSearch)); // FIX: Explicitly type tag
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
                        {(allTags && allTags.length > 0) ? "No tags found matching your search." : "No tags found yet. Tags are generated when new content is approved."} {/* FIX: Handle allTags possibly undefined */}
                    </p>
                </div>
            ) : (
                <div className="flex flex-wrap gap-3">
                    {filteredTags.map((tag: string) => (
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