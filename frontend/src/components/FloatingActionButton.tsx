// frontend/src/components/FloatingActionButton.tsx
import React from 'react';
import { Link } from 'react-router-dom';

// A simple but effective "chatbot" or "assistant" style icon SVG
const AssistantIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
);


const FloatingActionButton: React.FC = () => {
  return (
    <Link
      to="/chat"
      className="fixed bottom-24 right-4 z-40 h-16 w-16 rounded-full bg-indigo-600 text-white shadow-lg transition-transform hover:scale-110 flex items-center justify-center"
      aria-label="AI Study Assistant"
      title="AI Study Assistant"
    >
      <AssistantIcon />
    </Link>
  );
};

export default FloatingActionButton;