import React from 'react';
import { SearchResult } from '../../types';

interface SearchResultItemProps {
  result: SearchResult;
  onSelect: (id: string) => void;
}

const SearchResultItem: React.FC<SearchResultItemProps> = ({ result, onSelect }) => {
  return (
    <div
      className="p-4 bg-white rounded-lg shadow-sm hover:bg-gray-50 cursor-pointer"
      onClick={() => onSelect(result.id)}
    >
      <h3 className="text-md font-medium">{result.title}</h3>
      <p className="text-sm text-gray-600">{result.snippet}</p>
    </div>
  );
};

export default SearchResultItem;