import React, { useState, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import clsx from 'clsx';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (inputValue?: string) => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'confirm' | 'neutral';
  isLoading?: boolean;
  children?: React.ReactNode;
  isInputModal?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm',
  cancelText = 'Cancel', variant = 'confirm', isLoading = false, children, isInputModal = false,
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleConfirm = () => { onConfirm(inputValue); setInputValue(''); };

  const confirmButtonClass = clsx("btn-primary", {
      '!bg-red-600 hover:!bg-red-700 active:!bg-red-800 focus:!ring-red-500': variant === 'danger',
      '!bg-slate-500 hover:!bg-slate-600 active:!bg-slate-700 focus:!ring-slate-500': variant === 'neutral',
  });

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black bg-opacity-50" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto"><div className="flex min-h-full items-center justify-center p-4 text-center">
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
            <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-6 text-left align-middle shadow-xl transition-all">
              <Dialog.Title as="h3" className="text-lg font-medium leading-6">{title}</Dialog.Title>
              <div className="mt-2"><p className="text-sm text-slate-500 dark:text-slate-400">{message}</p></div>
              {children}
              {isInputModal && <input type="password" placeholder="Enter password to confirm" value={inputValue} onChange={(e) => setInputValue(e.target.value)} className="input-field my-4" autoFocus />}
              <div className="mt-4 flex justify-end space-x-3">
                <button type="button" className="btn-neutral" onClick={onClose} disabled={isLoading}>{cancelText}</button>
                <button type="button" className={confirmButtonClass} onClick={handleConfirm} disabled={isLoading || (isInputModal && !inputValue.trim())}>{isLoading ? 'Processing...' : confirmText}</button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div></div>
      </Dialog>
    </Transition>
  );
};

export default ConfirmationModal;