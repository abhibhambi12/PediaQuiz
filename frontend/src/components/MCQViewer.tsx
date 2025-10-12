import React, { memo } from 'react';
import { MCQ } from '@pediaquiz/types';
import clsx from 'clsx';
import { BookmarkIcon as BookmarkOutlineIcon, LightBulbIcon } from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid';
import ReactMarkdown from 'react-markdown';
import { AnswerState } from '@/hooks/useMCQSession';
import { useMutation } from '@tanstack/react-query';
import { getHint } from '@/services/aiService';
import { useToast } from './Toast';

const getCorrectAnswerText = (mcq: MCQ): string =>
  mcq.correctAnswer || mcq.options[mcq.answer.charCodeAt(0) - 65];

interface MCQViewerProps {
  mcq: MCQ;
  isBookmarked: boolean;
  answerState: AnswerState | undefined;
  actions: {
    onSelectOption: (option: string) => void;
    onToggleBookmark: () => void;
  };
}

const MCQViewer: React.FC<MCQViewerProps> = ({
  mcq,
  isBookmarked,
  answerState,
  actions,
}) => {
  const { addToast } = useToast();
  const isAnswered = !!answerState;

  const hintMutation = useMutation({
    mutationFn: () => getHint({ mcqId: mcq.id }),
    onSuccess: (response) => {
        addToast(`💡 Hint: ${response.data.hint}`, 'info', 6000);
    },
    onError: (error: any) => {
        addToast(`Could not get hint: ${error.message}`, 'error');
    }
  });

  if (!mcq || !mcq.question || !mcq.options || mcq.options.length === 0) {
    return (
        <div className="card-base p-6 text-center text-red-500">
            <p className="font-semibold">Error: Question data is corrupted or incomplete.</p>
        </div>
    );
  }

  return (
    <div className="card-base p-6">
      <div className="flex justify-between items-start mb-4">
        <p className="text-lg font-semibold flex-1 pr-4">{mcq.question}</p>
        <div className="flex-shrink-0 flex items-center gap-2">
            {!isAnswered && (
                <button onClick={() => hintMutation.mutate()} disabled={hintMutation.isPending} aria-label="Get a hint" className="p-2 text-slate-400 hover:text-yellow-500">
                    <LightBulbIcon className="h-6 w-6"/>
                </button>
            )}
            <button onClick={actions.onToggleBookmark} aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}>
                {isBookmarked ? (
                    <BookmarkSolidIcon className="h-6 w-6 text-amber-500" />
                ) : (
                    <BookmarkOutlineIcon className="h-6 w-6 text-slate-400 hover:text-amber-500" />
                )}
            </button>
        </div>
      </div>
      <div className="space-y-3">
        {mcq.options.map((option, idx) => {
          const correctAnswerText = getCorrectAnswerText(mcq);
          const isCorrectOption = option === correctAnswerText;
          const isSelectedOption = answerState?.selectedAnswer === option;

          return (
            <button
              key={idx}
              onClick={() => actions.onSelectOption(option)}
              disabled={isAnswered}
              className={clsx(
                'w-full text-left p-4 rounded-lg flex items-start border transition-all duration-200',
                {
                  // Default state for un-answered questions
                  'bg-slate-50 dark:bg-slate-800 border-transparent hover:bg-sky-50 dark:hover:bg-sky-900/50 hover:border-sky-300': !isAnswered,
                  
                  // State for the CORRECT option after answering
                  'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 text-emerald-800 dark:text-emerald-200 font-semibold': isAnswered && isCorrectOption,

                  // State for an INCORRECTLY SELECTED option after answering
                  'bg-red-100 dark:bg-red-900/30 border-red-300 text-red-800 dark:text-red-200 font-semibold': isAnswered && isSelectedOption && !isCorrectOption,
                  
                  // State for other unselected, incorrect options after answering
                  'bg-white dark:bg-slate-800/50 border-transparent': isAnswered && !isSelectedOption && !isCorrectOption,
                }
              )}
            >
              <span className="font-bold mr-3">{String.fromCharCode(65 + idx)}.</span>
              <span className="flex-1">{option}</span>
            </button>
          );
        })}
      </div>
      {isAnswered && mcq.explanation && (
        <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/30 rounded-lg animate-fade-in-up prose dark:prose-invert max-w-none prose-sm">
          <h3 className="font-bold text-lg mb-2">Explanation</h3>
          <ReactMarkdown>{mcq.explanation}</ReactMarkdown>
        </div>
      )}
    </div>
  );
};

export default memo(MCQViewer);