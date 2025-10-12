import React, { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { LightBulbIcon, FireIcon, ClockIcon } from '@heroicons/react/24/outline';

interface MotivationalModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string | null;
}

const MotivationalModal: React.FC<MotivationalModalProps> = ({ isOpen, onClose, message }) => {
  if (!message) return null;

  const getIcon = () => {
    if (message.includes('🔥')) return <FireIcon className="h-12 w-12 text-amber-500" />;
    if (message.includes('💡') || message.includes('💪')) return <LightBulbIcon className="h-12 w-12 text-sky-500" />;
    if (message.includes('⏳')) return <ClockIcon className="h-12 w-12 text-indigo-500" />;
    return null;
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black bg-opacity-60" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-8 text-center align-middle shadow-xl transition-all animate-pop-in">
                <div className="mx-auto mb-4 h-20 w-20 flex items-center justify-center">
                    {getIcon()}
                </div>
                <Dialog.Title as="h3" className="text-xl font-bold leading-6">
                  {message}
                </Dialog.Title>
                <div className="mt-6">
                  <button type="button" className="btn-primary w-full" onClick={onClose}>
                    Continue
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default MotivationalModal;