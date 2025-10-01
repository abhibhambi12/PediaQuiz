import React from 'react';
import { Flashcard, ConfidenceRating } from '@pediaquiz/types';
import clsx from 'clsx';
import {
  BookmarkIcon as BookmarkOutlineIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid';

interface FlashcardViewerProps {
  card: Flashcard;
  isFlipped: boolean;
  isBookmarked: boolean;
  progress: {
    current: number;
    total: number;
  };
  actions: {
    onFlip: () => void;
    onRate: (rating: ConfidenceRating) => void;
    onNext: () => void;
    onPrevious: () => void;
    onToggleBookmark: () => void;
  };
}

const FlashcardViewer: React.FC<FlashcardViewerProps> = ({
  card,
  isFlipped,
  isBookmarked,
  progress,
  actions,
}) => {
  // Defensive check for corrupted data
  if (!card || !card.front || !card.back) {
    return (
        <div className="card-base p-6 text-center text-red-500">
            <p className="font-semibold">Error: Flashcard data is corrupted or incomplete.</p>
        </div>
    );
  }
  
  return (
    <div className="max-w-xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">
          {card.chapterName} - {progress.current}/{progress.total}
        </h2>
        <button onClick={actions.onToggleBookmark} aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}>
          {isBookmarked ? (
            <BookmarkSolidIcon className="h-6 w-6 text-amber-500" />
          ) : (
            <BookmarkOutlineIcon className="h-6 w-6 text-slate-400 hover:text-amber-500" />
          )}
        </button>
      </div>
      <div
        className="relative h-80 w-full cursor-pointer [perspective:1000px]"
        onClick={actions.onFlip}
        aria-live="polite"
      >
        {isFlipped && <span className="sr-only">Showing back of card.</span>}
        {!isFlipped && <span className="sr-only">Showing front of card.</span>}
        <div
          className={clsx(
            'absolute h-full w-full rounded-xl shadow-lg transition-transform duration-500 [transform-style:preserve-3d]',
            isFlipped && '[transform:rotateY(180deg)]'
          )}
        >
          <div className="absolute h-full w-full bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center p-6 text-center [backface-visibility:hidden]">
            <p className="text-xl">{card.front}</p>
          </div>
          <div className="absolute h-full w-full bg-sky-100 dark:bg-sky-900 rounded-xl flex items-center justify-center p-6 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <p className="text-xl">{card.back}</p>
          </div>
        </div>
      </div>
      {isFlipped && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 animate-fade-in-up">
          <button onClick={() => actions.onRate('again')} className="btn-danger py-3">Again</button>
          <button onClick={() => actions.onRate('hard')} className="btn-warning py-3">Hard</button>
          <button onClick={() => actions.onRate('good')} className="btn-secondary py-3">Good</button>
          <button onClick={() => actions.onRate('easy')} className="btn-success py-3">Easy</button>
        </div>
      )}
      <div className="flex justify-between items-center mt-6">
        <button onClick={actions.onPrevious} disabled={progress.current === 1} className="btn-neutral">
          <ChevronLeftIcon className="h-5 w-5 inline" /> Prev
        </button>
        <button onClick={actions.onNext} className="btn-primary">
          Next <ChevronRightIcon className="h-5 w-5 inline" />
        </button>
      </div>
    </div>
  );
};

export default React.memo(FlashcardViewer);