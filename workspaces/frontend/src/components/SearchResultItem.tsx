import React from 'react';
import { MCQ, Flashcard } from '@pediaquiz/types';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

interface SearchResultItemProps {
    item: MCQ | Flashcard;
}

function isMcq(item: MCQ | Flashcard): item is MCQ {
    return (item as MCQ).question !== undefined && (item as MCQ).options !== undefined;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({ item }) => {
    const topicId = item.topicId;
    const chapterId = item.chapterId;
    const itemType = isMcq(item) ? 'MCQ' : 'Flashcard';
    const contentToDisplay = isMcq(item) ? item.question : item.front;

    const displayTopicName = item.topicName || item.topic || 'N/A';
    const displayChapterName = item.chapterName || item.chapter || 'N/A';

    return (
        <div className="card-base p-4 flex flex-col justify-between">
            <div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${isMcq(item) ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                    {itemType}
                </span>
                <div className="font-medium text-slate-800 dark:text-slate-200 mt-1 mb-2">
                    <ReactMarkdown>{contentToDisplay}</ReactMarkdown>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    In: {displayTopicName} &gt; {displayChapterName}
                </p>
            </div>
            <div className="mt-4 flex justify-end">
                <Link to={`/chapters/${topicId}/${chapterId}`} className="btn-neutral text-sm py-1 px-3">
                    Go to Chapter
                </Link>
            </div>
        </div>
    );
};

export default SearchResultItem;