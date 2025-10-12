// frontend/src/components/SearchResultItem.tsx
import React from 'react';

// FIX: Add the 'export' keyword to make this interface available for import.
export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  type: 'mcq' | 'flashcard' | 'chapter';
  topicId?: string;
  chapterId?: string;
}

interface SearchResultItemProps {
  result: SearchResult;
  onSelect: (item: SearchResult) => void;
  children?: React.ReactNode;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({ result, onSelect, children }) => {
  return (
    <div
      className="card-base p-4 flex justify-between items-center cursor-pointer hover:shadow-md hover:border-sky-300 dark:hover:border-sky-600 transition-all duration-150"
      onClick={() => onSelect(result)}
    >
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-slate-900 dark:text-slate-100 truncate">{result.title}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 truncate">{result.snippet}</p>
        <span className="inline-block mt-2 px-2 py-1 text-xs font-semibold text-sky-700 bg-sky-100 rounded-full dark:bg-sky-900/30 dark:text-sky-300">
            {result.type.toUpperCase()}
        </span>
      </div>
      {children && <div className="ml-4 flex-shrink-0">{children}</div>}
    </div>
  );
};

export default SearchResultItem;