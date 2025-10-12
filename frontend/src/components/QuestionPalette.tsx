// frontend/src/components/QuestionPalette.tsx
import React, { useState, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Squares2X2Icon, XMarkIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { AnswerState } from '@/hooks/useMCQSession';
import { MCQ } from '@pediaquiz/types';

interface QuestionPaletteProps {
  // --- BATCH 1 & 2 FEATURE: QUESTION PALETTE ---
  // This component requires a lightweight version of the MCQ data to function.
  mcqs: Pick<MCQ, 'id' | 'options' | 'answer' | 'correctAnswer'>[];
  answers: Record<number, AnswerState>;
  currentIndex: number;
  bookmarkedMcqIds: string[];
  onJumpTo: (index: number) => void;
}

// Helper function to determine the correct answer text for an MCQ.
const getCorrectAnswerText = (
  mcq: Pick<MCQ, 'options' | 'answer' | 'correctAnswer'>
): string => mcq.correctAnswer || mcq.options[mcq.answer.charCodeAt(0) - 65];

const QuestionPalette: React.FC<QuestionPaletteProps> = ({
  mcqs,
  answers,
  currentIndex,
  bookmarkedMcqIds,
  onJumpTo,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Action Button to open the palette */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 z-40 h-14 w-14 rounded-full bg-indigo-600 text-white shadow-lg flex items-center justify-center transition-all hover:bg-indigo-700 active:scale-95 animate-pop-in"
        aria-label="Open question palette"
        title="Open question palette"
      >
        <Squares2X2Icon className="h-7 w-7" />
      </button>

      {/* Modal dialog for the question grid */}
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setIsOpen(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-60" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-slate-900 dark:text-slate-100 flex justify-between items-center"
                  >
                    Jump to Question
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"
                      aria-label="Close"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </Dialog.Title>
                  <div className="mt-4 grid grid-cols-5 sm:grid-cols-8 gap-2">
                    {mcqs.map((mcq, index) => {
                      const answer = answers[index];
                      const isCorrect =
                        answer &&
                        mcq.options &&
                        mcq.answer &&
                        answer.selectedAnswer === getCorrectAnswerText(mcq);
                      const isBookmarked = bookmarkedMcqIds.includes(mcq.id);

                      return (
                        <button
                          key={mcq.id}
                          onClick={() => {
                            onJumpTo(index);
                            setIsOpen(false);
                          }}
                          className={clsx(
                            'relative h-10 w-10 rounded-md flex items-center justify-center font-semibold border-2 transition-all',
                            {
                              // Color-coding logic based on answer status
                              'bg-emerald-500 border-emerald-600 text-white':
                                answer && isCorrect,
                              'bg-red-500 border-red-600 text-white':
                                answer && !isCorrect,
                              'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600':
                                !answer,
                              // Highlight for the current question
                              'ring-4 ring-sky-500 ring-offset-2 dark:ring-offset-slate-800':
                                index === currentIndex,
                            }
                          )}
                          aria-label={`Go to question ${index + 1}`}
                        >
                          {/* Bookmark indicator */}
                          {isBookmarked && (
                            <div className="absolute top-0 right-0 h-2 w-2 bg-amber-400 rounded-full -mt-1 -mr-1" title="Bookmarked" />
                          )}
                          {index + 1}
                        </button>
                      );
                    })}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
};

export default QuestionPalette;