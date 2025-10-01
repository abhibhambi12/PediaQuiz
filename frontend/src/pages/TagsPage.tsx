import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTags } from '@/services/apiService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';

const TagsPage: React.FC = () => {
    const { addToast } = useToast();
    const { data: tags, isLoading, error } = useQuery({
        queryKey: ['allTags'],
        queryFn: async () => (await getTags()).data.tags,
        staleTime: 1000 * 60 * 60,
    });

    if (error) addToast(`Failed to load tags: ${error.message}`, "error");
    if (isLoading) return <Loader fullScreen message="Loading tags..." />;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Explore by Tag</h1>
            <div className="flex flex-wrap gap-4">
                {tags?.sort().map((tag: string) => (
                    <Link key={tag} to={`/tags/${encodeURIComponent(tag)}`} className="card-base p-4 font-medium text-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors">
                        {tag}
                    </Link>
                ))}
            </div>
        </div>
    );
};
export default TagsPage;