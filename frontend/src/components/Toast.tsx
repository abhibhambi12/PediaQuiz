// frontend/src/components/Toast.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Transition } from '@headlessui/react';
import { CheckCircleIcon, XCircleIcon, InformationCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    addToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    // useCallback to memoize the addToast function, preventing unnecessary re-renders of consumers
    const addToast = useCallback((message: string, type: ToastType = 'info', duration: number = 3000) => {
        const id = Date.now(); // Unique ID for each toast
        setToasts(prevToasts => [...prevToasts, { id, message, type }]);

        // Automatically remove toast after a set duration
        setTimeout(() => {
            setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
        }, duration);
    }, []); // Empty dependency array means this function is created once

    // Function to manually remove a toast (e.g., when the close button is clicked)
    const removeToast = (id: number) => {
        setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
    };

    // Helper function to get the appropriate icon based on toast type
    const getIcon = (type: ToastType) => {
        switch (type) {
            case 'success': return <CheckCircleIcon className="h-6 w-6 text-green-500" />;
            case 'error': return <XCircleIcon className="h-6 w-6 text-red-500" />;
            case 'warning': return <ExclamationTriangleIcon className="h-6 w-6 text-amber-500" />;
            case 'info':
            default:
                return <InformationCircleIcon className="h-6 w-6 text-sky-500" />;
        }
    };

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            {/* Toast container for displaying messages */}
            <div
                aria-live="assertive"
                className="fixed inset-0 flex items-end px-4 py-6 pointer-events-none sm:p-6 sm:items-start z-50"
            >
                <div className="w-full flex flex-col items-center space-y-4 sm:items-end">
                    {toasts.map((toast) => (
                        <Transition
                            key={toast.id}
                            show={true} // Always true as toasts are added and removed explicitly
                            as={React.Fragment}
                            enter="transform ease-out duration-300 transition"
                            enterFrom="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
                            enterTo="translate-y-0 opacity-100 sm:translate-x-0"
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                        >
                            <div className="max-w-sm w-full bg-white dark:bg-slate-800 shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden">
                                <div className="p-4">
                                    <div className="flex items-start">
                                        <div className="flex-shrink-0">
                                            {getIcon(toast.type)}
                                        </div>
                                        <div className="ml-3 w-0 flex-1 pt-0.5">
                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                                                {toast.message}
                                            </p>
                                        </div>
                                        <div className="ml-4 flex-shrink-0 flex">
                                            <button
                                                type="button"
                                                className="bg-white dark:bg-slate-800 rounded-md inline-flex text-slate-400 hover:text-slate-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                                onClick={() => removeToast(toast.id)}
                                            >
                                                <span className="sr-only">Close</span>
                                                <XCircleIcon className="h-5 w-5" aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Transition>
                    ))}
                </div>
            </div>
        </ToastContext.Provider>
    );
};

// Custom hook to consume the ToastContext
export const useToast = () => {
    const context = useContext(ToastContext);
    // Throw an error if useToast is used outside of a ToastProvider
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};