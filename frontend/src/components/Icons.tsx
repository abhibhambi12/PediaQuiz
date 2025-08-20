// frontend/src/components/Icons.tsx
import React from 'react';

// Use React.SVGProps for better type safety with SVG elements
export const BookmarkIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
    />
  </svg>
);

export const QuizIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2m-5 0a1 1 0 001 1h2a1 1 0 001-1m-3 5h3m-3 4h3m-6-4h.01m-.01 4h.01"
    />
  </svg>
);

// LoaderIcon is an SVG element so React.FC<React.SVGProps<SVGSVGElement>> is appropriate
export const LoaderIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} className="h-10 w-10 animate-spin text-sky-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V4C6.477 4 2 8.477 2 12h2zm2 5.291V18a6 6 0 006 6v-2a4 4 0 01-4-4H6z"></path>
  </svg>
);