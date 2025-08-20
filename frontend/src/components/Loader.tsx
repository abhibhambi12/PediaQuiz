// frontend/src/components/Loader.tsx
// MODIFIED: Corrected import path for LoaderIcon.

import React from 'react';
import { LoaderIcon } from './Icons'; // Corrected import path

interface LoaderProps {
    message?: string;
}

const Loader: React.FC<LoaderProps> = ({ message = "Loading..." }) => (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4">
        <LoaderIcon />
        <p className="mt-4 text-lg font-medium text-slate-500 dark:text-slate-400">{message}</p>
    </div>
);

export default Loader;