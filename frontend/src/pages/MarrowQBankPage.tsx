import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '@/components/Loader';
import type { MCQ, Topic, Chapter } from '@pediaquiz/types';
import { useData } from '@/contexts/DataContext';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

const MarrowQBankPage: React.FC = () => {
    const navigate = useNavigate();
    const { appData, isLoadingData } = useData();
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());

    const groupedContent = useMemo(() => {
        if (!appData) return {};
        const marrowTopics = appData.topics.filter(t => t.source === 'Marrow');
        const mcqs = appData.mcqs.filter(m => m.source?.startsWith('Marrow'));
        type GroupedType = { [topicId: string]: { topic: Topic; chapters: { [chapterId: string]: { chapter: Chapter; mcqs: MCQ[] } } } };
        const grouped: GroupedType = {};
        
        marrowTopics.forEach(t => { grouped[t.id] = { topic: t, chapters: {} } });
        
        mcqs.forEach(mcq => {
            if (grouped[mcq.topicId]) {
                if (!grouped[mcq.topicId].chapters[mcq.chapterId]) {
                    const chapter = (grouped[mcq.topicId].topic.chapters as Chapter[]).find(c => c.id === mcq.chapterId);
                    if (chapter) grouped[mcq.topicId].chapters[mcq.chapterId] = { chapter, mcqs: [] };
                }
                grouped[mcq.topicId].chapters[mcq.chapterId]?.mcqs.push(mcq);
            }
        });

        // Clean up empty chapters/topics
        Object.keys(grouped).forEach(topicId => {
            Object.keys(grouped[topicId].chapters).forEach(chapterId => {
                if(grouped[topicId].chapters[chapterId].mcqs.length === 0) {
                    delete grouped[topicId].chapters[chapterId];
                }
            });
            if(Object.keys(grouped[topicId].chapters).length === 0) {
                delete grouped[topicId];
            }
        });

        return grouped;
    }, [appData]);

    if (isLoadingData) return <Loader fullScreen message="Loading Marrow QBank..." />;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Marrow QBank</h1>
            <div className="space-y-4">
                {Object.values(groupedContent).sort((a,b) => a.topic.name.localeCompare(b.topic.name)).map(({ topic, chapters }) => (
                    <div key={topic.id} className="card-base overflow-hidden">
                        <button className="w-full text-left p-4 flex justify-between items-center" onClick={() => setExpandedTopics(p => { const n=new Set(p); n.has(topic.id)?n.delete(topic.id):n.add(topic.id); return n; })}>
                            <h3 className="font-bold text-lg">{topic.name}</h3>
                            <ChevronDownIcon className={clsx(`h-5 w-5`, expandedTopics.has(topic.id) && 'rotate-180')} />
                        </button>
                        {expandedTopics.has(topic.id) && (
                            <div className="p-4 border-t space-y-3">
                                {Object.values(chapters).sort((a,b) => a.chapter.name.localeCompare(b.chapter.name)).map(({ chapter, mcqs }) => (
                                    <div key={chapter.id} className="border rounded-lg dark:border-slate-700">
                                        <button className="w-full text-left p-3 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50" onClick={() => setExpandedChapters(p => { const n=new Set(p); n.has(chapter.id)?n.delete(chapter.id):n.add(chapter.id); return n; })}>
                                            <h4>{chapter.name} ({mcqs.length} MCQs)</h4>
                                            <ChevronDownIcon className={clsx(`h-5 w-5`, expandedChapters.has(chapter.id) && 'rotate-180')} />
                                        </button>
                                        {expandedChapters.has(chapter.id) && (
                                            <ul className="p-4 border-t dark:border-slate-700 space-y-3">
                                                {mcqs.map(mcq => <li key={mcq.id} className="card-base p-4 cursor-pointer hover:bg-sky-50 dark:hover:bg-slate-700" onClick={() => navigate(`/chapters/${mcq.topicId}/${mcq.chapterId}`)}>{mcq.question}</li>)}
                                            </ul>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
export default MarrowQBankPage;