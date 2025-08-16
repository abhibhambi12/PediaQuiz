// workspaces/frontend/src/components/FloatingActionButton.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

const AssistantIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0 4.418-4.03 8-9 8s-9-3.582-9-8 4.03-8 9-8 9 3.582 9 8z" />
    </svg>
);

const FloatingActionButton: React.FC = () => {
  return (
    <Link
      to="/chat"
      className={clsx(
        "fixed bottom-24 right-4 z-40 h-16 w-16 rounded-full",
        "bg-secondary-500 text-white shadow-lg", // Changed to use `secondary-500` as defined in tailwind.config.js
        "flex items-center justify-center",
        "transition-all duration-200 ease-in-out",
        "hover:scale-110 active:scale-95 animate-pop-in"
      )}
      aria-label="AI Study Assistant"
      title="AI Study Assistant"
    >
      <AssistantIcon />
    </Link>
  );
};

export default FloatingActionButton;