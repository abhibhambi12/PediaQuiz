import React, { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Loader from '@/components/Loader';
import SearchResultItem from '@/components/SearchResultItem';
import { MCQ } from '@pediaquiz/types';
import { db } from '@/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

async function getMcqsByTag(tag: string): Promise<MCQ[]> {
    if (!tag) return [];

    const mcqs: MCQ[] = [];
    const lowerCaseTag = tag.toLowerCase();

    const masterQuery = query(
        collection(db, 'MasterMCQ'),
        where('tags', 'array-contains', lowerCaseTag),
        where('status', '==', 'approved')
    );
    const marrowQuery = query(
        collection(db, 'MarrowMCQ'),
        where('tags', 'array-contains', lowerCaseTag),
        where('status', '==', 'approved')
    );

    const [masterSnapshot, marrowSnapshot] = await Promise.all([
        getDocs(masterQuery),
        getDocs(marrowQuery),
    ]);

    masterSnapshot.forEach(doc => mcqs.push({ id: doc.id, ...doc.data() } as MCQ));
    marrowSnapshot.forEach(doc => mcqs.push({ id: doc.id, ...doc.data() } as MCQ));

    return mcqs;
}

const TagQuestionsPage: React.FC = () => {
    const { tagName } = useParams<{ tagName: string }>();

    const decodedTagName = useMemo(() => {
        if (tagName) {
            return decodeURIComponent(tagName).replace(/_/g, ' ');
        }
        return '';
    }, [tagName]);

    const { data: filteredMcqs, isLoading, error } = useQuery<MCQ[]>({
        queryKey: ['tagQuestions', decodedTagName],
        queryFn: () => getMcqsByTag(decodedTagName),
        enabled: !!decodedTagName,
        staleTime: 1000 * 60 * 5,
    });

    if (isLoading) return <Loader message={`Loading questions for "${decodedTagName}"...`} />;

    if (error) return <div className="text-center py-10 text-red-500">Error: {error.message}</div>;

    const questionsFound = filteredMcqs?.length || 0;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Questions Tagged: <span className="text-sky-500">"{decodedTagName}"</span></h1>
            <p className="text-slate-500 dark:text-slate-400">{questionsFound} question(s) found.</p>

            {questionsFound === 0 ? (
                <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-lg shadow-md">
                    <p className="text-slate-500">No questions found with this tag.</p>
                    <Link to="/tags" className="mt-4 inline-block px-4 py-2 bg-sky-500 text-white rounded-md hover:bg-sky-600 transition-colors">
                        Browse All Tags
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredMcqs?.map((item: MCQ) => (
                        <SearchResultItem key={item.id} item={item} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default TagQuestionsPage;