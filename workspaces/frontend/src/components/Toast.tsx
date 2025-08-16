import React, { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { Transition } from '@headlessui/react';

type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

interface ToastMessage {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  addToast: (message: string, variant: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

const getVariantClasses = (variant: ToastVariant) => {
  switch (variant) {
    case 'success': return 'bg-green-600';
    case 'warning': return 'bg-amber-500';
    case 'danger': return 'bg-red-600';
    default: return 'bg-sky-500';
  }
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = Date.now();
    setToasts(currentToasts => [{ id, message, variant }, ...currentToasts]);
    setTimeout(() => {
      setToasts(currentToasts => currentToasts.filter(toast => toast.id !== id));
    }, 5000);
  }, []);

  const removeToast = (id: number) => {
    setToasts(currentToasts => currentToasts.filter(toast => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed top-5 right-5 z-[200] w-full max-w-sm space-y-3">
        {toasts.map(toast => (
          <Transition
            key={toast.id}
            show={true}
            appear={true}
            enter="transition-all duration-300 ease-out transform"
            enterFrom="opacity-0 translate-x-full"
            enterTo="opacity-100 translate-x-0"
            leave="transition-all duration-300 ease-in transform"
            leaveFrom="opacity-100"
            leaveTo="opacity-0 translate-x-full"
          >
            <div
              className={`flex items-center justify-between p-4 rounded-lg shadow-lg text-white font-semibold ${getVariantClasses(toast.variant)}`}
              role="alert"
            >
              <span>{toast.message}</span>
              <button onClick={() => removeToast(toast.id)} className="ml-4 p-1 rounded-full hover:bg-black/10">
                &times;
              </button>
            </div>
          </Transition>
        ))}
      </div>
    </ToastContext.Provider>
  );
};