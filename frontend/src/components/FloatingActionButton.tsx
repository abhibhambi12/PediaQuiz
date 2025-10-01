import React from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { SparklesIcon } from '@heroicons/react/24/solid';

const FloatingActionButton: React.FC = () => {
  return (
    <Link
      to="/chat"
      className={clsx(
        "fixed bottom-24 right-4 z-40 h-16 w-16 rounded-full",
        "bg-sky-600 text-white shadow-lg",
        "flex items-center justify-center",
        "transition-all duration-200 ease-in-out",
        "hover:scale-110 hover:bg-sky-500 active:scale-95 animate-pop-in"
      )}
      aria-label="AI Study Assistant"
      title="AI Study Assistant"
    >
      <SparklesIcon className="h-8 w-8" />
    </Link>
  );
};

export default FloatingActionButton;