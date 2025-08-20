// frontend/src/components/SearchResultItem.tsx
// frontend/src/components/SearchResultItem.tsx
import React from 'react';
// Direct type imports
import { MCQ, Flashcard } from '@pediaquiz/types';

// SearchResult type should encompass common fields needed for display
// and a 'type' discriminator for conditional rendering/navigation.
interface SearchResult {
  id: string;
  title: string; // This will map to MCQ.question or Flashcard.front
  snippet: string; // This will map to MCQ.explanation or Flashcard.back (or a portion)
  type?: 'mcq' | 'flashcard' | 'chapter'; // Optional: for conditional rendering or navigation
  topicId?: string; // Add topicId for navigation
  chapterId?: string; // Add chapterId for navigation
}

interface SearchResultItemProps {
  result: SearchResult; // Changed prop name from 'item' to 'result' for consistency with internal use
  onSelect: (item: SearchResult) => void; // Pass the full item for specific navigation logic
  children?: React.ReactNode; // For optional custom content (like bookmark button)
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({ result, onSelect, children }) => {
  return (
    <div
      className="p-4 bg-white dark:bg-slate-800 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors duration-150 flex justify-between items-center" // Added flex for children alignment
      onClick={() => onSelect(result)} // Pass the full result object
    >
      <div>
        <h3 className="text-md font-medium text-slate-900 dark:text-slate-100">{result.title}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{result.snippet}</p>
        {result.type && (
          <span className="inline-block mt-2 px-2 py-1 text-xs font-semibold text-sky-700 bg-sky-100 rounded-full dark:bg-sky-900/30 dark:text-sky-300">
            {result.type.toUpperCase()}
          </span>
        )}
      </div>
      {children} {/* Render any children passed to this component (e.g., bookmark button) */}
    </div>
  );
};

export default SearchResultItem;