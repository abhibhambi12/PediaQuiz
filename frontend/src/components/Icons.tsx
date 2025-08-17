import React from 'react';
import { IconProps } from '@heroicons/react/24/outline';

export const BookmarkIcon: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
    />
  </svg>
);

export const QuizIcon: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2m-5 0a1 1 0 001 1h2a1 1 0 001-1m-3 5h3m-3 4h3m-6-4h.01m-.01 4h.01"
    />
  </svg>
);

// Add more icons as needed