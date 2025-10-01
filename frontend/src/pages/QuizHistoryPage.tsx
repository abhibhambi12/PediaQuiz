// frontend/src/pages/QuizHistoryPage.tsx
import React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getQuizResults } from '@/services/apiService';
import Loader from '@/components/Loader';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { safeToDate } from '@/utils/dateUtils';
import { ClientQuizResult } from '@pediaquiz/types';

const QuizHistoryPage: React.FC = () => {
  const fetchResults = async ({ pageParam }: { pageParam?: string }) => {
    const response = await getQuizResults({ limit: 10, startAfter: pageParam });
    return response.data;
  };

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isLoading,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['quizHistory'],
    queryFn: fetchResults,
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.lastVisible || undefined,
  });

  if (isLoading) {
    return <Loader fullScreen message="Loading your quiz history..." />;
  }

  if (error) {
    return <div className="text-center py-10 text-red-500">Failed to load history: {error.message}</div>;
  }
  
  const allResults = data?.pages.flatMap(page => page.results) ?? [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Quiz History</h1>
      
      {allResults.length === 0 ? (
        <div className="card-base text-center py-10">
          <p className="text-slate-500">You haven't completed any quizzes yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {allResults.map((result: ClientQuizResult) => (
            <Link key={result.id} to={`/results/${result.id}`} className="block card-base hover:shadow-md hover:border-sky-300 dark:hover:border-sky-600 transition-all">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="font-semibold text-lg capitalize">{result.mode.replace(/_/g, ' ')}</h2>
                  <p className="text-sm text-slate-500">{format(safeToDate(result.quizDate), 'PPpp')}</p>
                </div>
                <div className="text-right">
                    <p className="text-xl font-bold text-sky-600 dark:text-sky-400">
                        {result.totalQuestions > 0 ? ((result.score / result.totalQuestions) * 100).toFixed(0) : 0}%
                    </p>
                    <p className="text-sm text-slate-500">{result.score}/{result.totalQuestions}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {hasNextPage && (
        <div className="text-center mt-6">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="btn-neutral"
          >
            {isFetchingNextPage ? 'Loading more...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
};

export default QuizHistoryPage;