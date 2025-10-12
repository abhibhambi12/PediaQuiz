// frontend/src/pages/QuizHistoryPage.tsx
import React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getQuizResults } from '@/services/apiService';
import Loader from '@/components/Loader';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { safeToDate } from '@/utils/dateUtils';
import { ClientQuizResult } from '@pediaquiz/types';
import { FixedSizeList as List, ListOnItemsRenderedProps } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';

const QuizHistoryPage: React.FC = () => {
  const fetchResults = async ({ pageParam }: { pageParam?: string }) => {
    const response = await getQuizResults({ limit: 15, startAfter: pageParam });
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

  const itemCount = hasNextPage ? allResults.length + 1 : allResults.length;
  
  // --- FINAL LINTER FIX ---
  // The 'startIndex' and 'stopIndex' parameters are prefixed with an underscore.
  // This is the standard TypeScript convention to indicate that these parameters are
  // required by the `InfiniteLoader`'s type signature but are intentionally not
  // used in our function's body. This resolves the "declared but its value is never read" warnings.
  const loadMoreItems = async (_startIndex: number, _stopIndex: number) => {
    if (!isFetchingNextPage) {
      await fetchNextPage();
    }
  };

  const isItemLoaded = (index: number) => !hasNextPage || index < allResults.length;

  const Row = ({ index, style }: { index: number, style: React.CSSProperties }) => {
    if (!isItemLoaded(index)) {
      return <div style={style} className="flex items-center justify-center"><Loader message="Loading more..." /></div>;
    }

    const result: ClientQuizResult = allResults[index];
    if (!result) return null;

    return (
      <div style={style} className="px-2 py-2">
        <Link to={`/results/${result.id}`} className="block card-base h-full hover:shadow-md hover:border-sky-300 dark:hover:border-sky-600 transition-all">
          <div className="flex justify-between items-center h-full">
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
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Quiz History</h1>
      
      {allResults.length === 0 ? (
        <div className="card-base text-center py-10">
          <p className="text-slate-500">You haven't completed any quizzes yet.</p>
        </div>
      ) : (
        <div className="h-[70vh] w-full">
          <InfiniteLoader
            isItemLoaded={isItemLoaded}
            itemCount={itemCount}
            loadMoreItems={loadMoreItems}
          >
            {({ onItemsRendered, ref }: { onItemsRendered: (props: ListOnItemsRenderedProps) => any; ref: React.Ref<List> }) => (
              <List
                className="w-full"
                height={window.innerHeight * 0.7}
                width="100%"
                itemCount={itemCount}
                itemSize={110}
                onItemsRendered={onItemsRendered}
                ref={ref}
              >
                {Row}
              </List>
            )}
          </InfiniteLoader>
        </div>
      )}
    </div>
  );
};

export default QuizHistoryPage;