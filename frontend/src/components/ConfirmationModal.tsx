// frontend/src/components/ConfirmationModal.tsx
import React from 'react';
import clsx from 'clsx';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'confirm' | 'neutral';
  isLoading?: boolean;
  children?: React.ReactNode;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'confirm',
  isLoading = false,
  children,
}) => {
  if (!isOpen) return null;

  const confirmButtonClass = clsx(
    "px-4 py-2 rounded-md font-semibold transition-colors duration-200",
    {
      'bg-red-600 text-white hover:bg-red-700': variant === 'danger',
      'bg-sky-600 text-white hover:bg-sky-700': variant === 'confirm',
      'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500': variant === 'neutral',
    },
    {
      'opacity-50 cursor-not-allowed': isLoading,
    }
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-sm w-full shadow-xl animate-pop-in">
        <h2 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-50">
          {title}
        </h2>
        {message && <p className="mb-6 text-slate-700 dark:text-slate-300">{message}</p>}
        {children && <div className="mb-6">{children}</div>}
        <div className="flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-slate-500"
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={confirmButtonClass}
            disabled={isLoading}
          >
            {isLoading ? '...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;