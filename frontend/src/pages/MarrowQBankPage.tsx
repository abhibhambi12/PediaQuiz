import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Loader from '@/components/Loader';
import type { Chapter, Topic } from '@pediaquiz/types';
import { useData } from '@/contexts/DataContext';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

const MarrowQBankPage: React.FC = () => {
  const { appData, isLoadingData } = useData();
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  const marrowTopics = useMemo(() => {
    if (!appData?.topics) return [];
    return appData.topics
        .filter((t) => t.source === 'Marrow' && t.totalMcqCount > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
  }, [appData]);

  if (isLoadingData)
    return <Loader fullScreen message="Loading Marrow QBank..." />;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Marrow QBank</h1>
      <div className="space-y-4">
        {marrowTopics.map((topic: Topic) => (
            <div key={topic.id} className="card-base !p-0 overflow-hidden">
              <button
                className="w-full text-left p-4 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-700/50"
                onClick={() => setExpandedTopics((p) => {
                    const n = new Set(p);
                    n.has(topic.id) ? n.delete(topic.id) : n.add(topic.id);
                    return n;
                })}
              >
                <h3 className="font-bold text-lg">{topic.name} <span className="text-sm font-normal text-slate-500">({topic.totalMcqCount} MCQs)</span></h3>
                <ChevronDownIcon
                  className={clsx(`h-5 w-5`, expandedTopics.has(topic.id) && 'rotate-180')}
                />
              </button>
              {expandedTopics.has(topic.id) && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                    <ul className="space-y-2">
                       {(topic.chapters as Chapter[]).filter(c => c.mcqCount > 0).sort((a,b) => a.name.localeCompare(b.name)).map((chapter) => (
                            <li key={chapter.id}>
                                <Link to={`/chapters/${topic.id}/${chapter.id}`} className="block p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-sky-100 dark:hover:bg-sky-900/50">
                                   <p className="font-medium">{chapter.name} ({chapter.mcqCount})</p>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
};
export default MarrowQBankPage;