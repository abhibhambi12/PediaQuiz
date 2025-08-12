// FILE: frontend/src/components/Toast.tsx

import React, { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';

interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'danger' | 'warning'; // FIXED: Added 'danger' and 'warning' types
  duration?: number;
}

interface ToastContextType {
  addToast: (message: string, type?: ToastNotification['type'], duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const addToast = useCallback((message: string, type: ToastNotification['type'] = 'info', duration: number = 4000) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    const newToast: ToastNotification = { id, message, type, duration };
    setToasts((prevToasts) => [newToast, ...prevToasts]);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prevToasts) => prevToasts.filter(toast => toast.id !== id));
  };

  useEffect(() => {
    if (toasts.length > 0) {
      const latestToast = toasts[0];
      const timer = setTimeout(() => {
        removeToast(latestToast.id);
      }, latestToast.duration);
      return () => clearTimeout(timer);
    }
  }, [toasts]);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed top-5 right-5 z-[200] space-y-3 max-w-sm w-full">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              p-4 rounded-lg shadow-2xl text-white font-semibold flex items-center justify-between gap-3
              transition-all duration-300 ease-in-out transform animate-fade-in-down
              ${toast.type === 'success' ? 'bg-green-600' : ''}
              ${toast.type === 'error' || toast.type === 'danger' ? 'bg-red-600' : ''} 
              ${toast.type === 'info' ? 'bg-blue-600' : ''}
              ${toast.type === 'warning' ? 'bg-amber-500' : ''} 
            `}
            role="alert"
          >
            <span>{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} className="opacity-70 hover:opacity-100">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};