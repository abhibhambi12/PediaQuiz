import React from 'react';
import { useFlashcardSession } from '@/hooks/useFlashcardSession';
import FlashcardViewer from '@/components/FlashcardViewer';
import Loader from '@/components/Loader';

type FilterType = 'all' | 'bookmarked' | 'rated_hard';

const FlashcardSessionPage: React.FC = () => {
  const {
    isLoading,
    currentCard,
    isFlipped,
    isBookmarked,
    progress,
    filter,
    actions,
  } = useFlashcardSession();

  if (isLoading || !currentCard) {
    return <Loader fullScreen message="Loading flashcards..." />;
  }

  return (
    <div>
      <div className="max-w-xl mx-auto mb-4">
        <select
          value={filter}
          onChange={(e) => actions.setFilter(e.target.value as FilterType)}
          className="input-field"
        >
          <option value="all">All Cards</option>
          <option value="bookmarked">Bookmarked Only</option>
          <option value="rated_hard" disabled>
            Rated Hard (Coming Soon)
          </option>
        </select>
      </div>

      {progress.total > 0 ? (
        <FlashcardViewer
          card={currentCard}
          isFlipped={isFlipped}
          isBookmarked={isBookmarked}
          progress={progress}
          actions={{
            onFlip: actions.flipCard,
            onRate: actions.rateConfidence,
            onNext: actions.goToNext,
            onPrevious: actions.goToPrevious,
            onToggleBookmark: actions.toggleBookmark,
          }}
        />
      ) : (
        <div className="text-center card-base p-8">
          <p className="text-slate-500">No cards match your filter.</p>
        </div>
      )}
    </div>
  );
};

export default FlashcardSessionPage;