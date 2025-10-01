import React from 'react';

const LoaderIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...props} className="h-10 w-10 animate-spin text-sky-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V4C6.477 4 2 8.477 2 12h2z"></path>
    </svg>
);

interface LoaderProps {
    message?: string;
    fullScreen?: boolean;
}

const Loader: React.FC<LoaderProps> = ({ message = "Loading...", fullScreen = false }) => {
    const containerClasses = fullScreen 
        ? "fixed inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 z-50"
        : "flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4";

    return (
        <div className={containerClasses} role="status" aria-live="polite">
            <LoaderIcon />
            <p className="mt-4 text-lg font-medium text-slate-500 dark:text-slate-400">{message}</p>
        </div>
    );
};

export default Loader;