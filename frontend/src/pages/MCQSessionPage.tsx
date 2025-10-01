// frontend/src/pages/MCQSessionPage.tsx
import React from 'react';
import { useMCQSession } from '@/hooks/useMCQSession';
import MCQViewer from '@/components/MCQViewer';
import Loader from '@/components/Loader';
import ConfirmationModal from '@/components/ConfirmationModal';
import QuestionPalette from '@/components/QuestionPalette';
import { useAuth } from '@/contexts/AuthContext';
import { WifiIcon } from '@heroicons/react/24/outline';

const MCQSessionPage: React.FC = () => {
  const { user } = useAuth();
  const {
    isLoading,
    currentMcq,
    answers,
    isBookmarked,
    session,
    sessionError,
    progress,
    actions,
  } = useMCQSession();

  if (isLoading || !currentMcq || !session) {
    return <Loader fullScreen message="Loading quiz session..." />;
  }

  const isAnswered = !!answers[progress.current];

  return (
    <>
      <ConfirmationModal
        isOpen={actions.isEnding}
        onClose={actions.cancelEndSession}
        onConfirm={actions.confirmEndSession}
        title="End Session?"
        message="Your progress will be saved and the quiz will be scored. Are you sure?"
        confirmText="End & Save"
        variant="danger"
      />
       <ConfirmationModal
        isOpen={actions.isFinishing}
        onClose={actions.cancelFinish}
        onConfirm={actions.confirmFinish}
        title="Finish Quiz?"
        message="You have answered the last question. Ready to submit and see your results?"
        confirmText="Submit Quiz"
        variant="confirm"
      />
      
      {sessionError && (
          <div className="mb-4 p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 flex items-center gap-2">
              <WifiIcon className="h-5 w-5" />
              <p className="text-sm font-semibold">{sessionError}</p>
          </div>
      )}

      <div className="relative">
        <MCQViewer
            mcq={currentMcq}
            isBookmarked={isBookmarked}
            answerState={answers[progress.current]}
            actions={{
                onSelectOption: actions.selectOption,
                onToggleBookmark: actions.toggleBookmark,
            }}
        />
        <div className="flex justify-between items-center mt-6">
            <button onClick={() => actions.goToQuestion(progress.current - 1)} disabled={progress.current === 0} className="btn-neutral">
                Previous
            </button>
            <button onClick={actions.goToNext} disabled={!isAnswered} className="btn-primary">
                {progress.current === progress.total - 1 ? 'Finish' : 'Next'}
            </button>
        </div>
      </div>

      <QuestionPalette
        mcqs={session.mcqIds.map(id => ({ id } as any))} // Pass stub for performance
        answers={answers}
        currentIndex={progress.current}
        bookmarkedMcqIds={user?.bookmarkedMcqs || []}
        onJumpTo={actions.goToQuestion}
      />
    </>
  );
};

export default MCQSessionPage;