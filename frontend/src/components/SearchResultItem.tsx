import React from 'react';
import { MCQ, Flashcard } from '@pediaquiz/types';
import { Link } from 'react-router-dom';

interface SearchResultItemProps {
    item: MCQ | Flashcard;
}

// Type guard to check if an item is an MCQ
function isMcq(item: MCQ | Flashcard): item is MCQ {
    return (item as MCQ).options !== undefined;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({ item }) => {
    if (isMcq(item)) {
        // Render MCQ
        return (
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-md">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">MCQ</span>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{item.question}</p>
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    <p>Topic: {item.topic} | Chapter: {item.chapter}</p>
                    <Link to={`/session/practice/${item.chapterId}`} className="text-sky-500 hover:underline mt-2 inline-block">
                        Go to Practice Session
                    </Link>
                </div>
            </div>
        );
    } else {
        // Render Flashcard
        return (
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-md">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Flashcard</span>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{item.front}</p>
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    {/* Use topicName and chapterName for consistency with how Flashcard is populated in firestoreService */}
                    <p>Topic: {item.topicName} | Chapter: {item.chapterName}</p>
                    <Link to={`/flashcards/${item.topicId}/${item.chapterId}`} className="text-amber-500 hover:underline mt-2 inline-block">
                        Go to Flashcard Session
                    </Link>
                </div>
            </div>
        );
    }
};

export default SearchResultItem;