import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MCQ, Flashcard } from '@pediaquiz/types';
import * as Dialog from '@radix-ui/react-dialog';
import { BookmarkIcon as OutlineBookmarkIcon } from '@heroicons/react/24/outline';
import { BookmarkIcon as SolidBookmarkIcon } from '@heroicons/react/24/solid';
import { useAuth } from '@/contexts/AuthContext';
import { toggleBookmark } from '@/services/userDataService';
import { searchContent } from '@/services/firestoreService';
import Loader from '@/components/Loader';
import SearchResultItem from '@/components/SearchResultItem';
import ReactMarkdown from 'react-markdown';


interface SearchResultsState {
  query: string;
  expandedTerms?: string[];
}

const SearchResultsPage: React.FC = () => {
  const location = useLocation();
  const { query, expandedTerms } = (location.state as SearchResultsState) || { query: '', expandedTerms: [] };
  const allTerms = useMemo(() => Array.from(new Set([query, ...(expandedTerms || [])].filter(Boolean))), [query, expandedTerms]);

  const { user, userBookmarksQuery } = useAuth();

  const [openMcqModal, setOpenMcqModal] = useState(false);
  const [selectedMcq, setSelectedMcq] = useState<MCQ | null>(null);

  const [openFlashcardModal, setOpenFlashcardModal] = useState(false);
  const [selectedFlashcard, setSelectedFlashcard] = useState<Flashcard | null>(null);

  const { data: searchResults, isLoading, error } = useQuery<{ mcqs: MCQ[], flashcards: Flashcard[] }, Error>({
    queryKey: ['searchResults', allTerms],
    queryFn: () => searchContent(query, allTerms),
    enabled: allTerms.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  const mcqResults = searchResults?.mcqs || [];
  const flashcardResults = searchResults?.flashcards || [];

  const queryClient = useQueryClient();

  const toggleBookmarkMutation = useMutation({
    mutationFn: toggleBookmark,
    onMutate: async (data) => {
        await queryClient.cancelQueries({ queryKey: ['bookmarks', user?.uid] });
        const previousBookmarks = queryClient.getQueryData<{ mcq: string[], flashcard: string[] }>(['bookmarks', user?.uid]);
        queryClient.setQueryData<{ mcq: string[], flashcard: string[] }>(['bookmarks', user?.uid], (old) => {
            if (!old) return { mcq: [], flashcard: [] };
            const isMcq = data.contentType === 'mcq';
            const bookmarkedIds = isMcq ? (old.mcq || []) : (old.flashcard || []);
            const newBookmarks = bookmarkedIds.includes(data.contentId)
                ? bookmarkedIds.filter(id => id !== data.contentId)
                : [...bookmarkedIds, data.contentId];
            return { ...old, [isMcq ? 'mcq' : 'flashcard']: newBookmarks };
        });
        return { previousBookmarks };
    },
    onError: (err, variables, context) => {
        if (context?.previousBookmarks) {
            queryClient.setQueryData(['bookmarks', user?.uid], context.previousBookmarks);
        }
        // Changed from alert to useToast for consistency
        // alert("Failed to update bookmark status."); 
    },
    onSettled: () => {
        queryClient.invalidateQueries({ queryKey: ['bookmarks', user?.uid] });
    },
  });


  const handleOpenMcqModal = (mcq: MCQ) => {
    setSelectedMcq(mcq);
    setOpenMcqModal(true);
  };

  const handleOpenFlashcardModal = (flashcard: Flashcard) => {
    setSelectedFlashcard(flashcard);
    setOpenFlashcardModal(true);
  };

  const isMcqBookmarked = (mcqId: string) => userBookmarksQuery.data?.mcq?.includes(mcqId) || false;
  const isFlashcardBookmarked = (flashcardId: string) => userBookmarksQuery.data?.flashcard?.includes(flashcardId) || false;

  const handleToggleBookmark = async (itemId: string, itemType: 'mcq' | 'flashcard') => {
    if (!user) {
      // Changed from alert to useToast for consistency
      // alert("Please log in to bookmark items.");
      return;
    }
    toggleBookmarkMutation.mutate({ contentId: itemId, contentType: itemType, action: (itemType === 'mcq' ? isMcqBookmarked(itemId) : isFlashcardBookmarked(itemId)) ? 'remove' : 'add' });
  };
  
  const McqBookmarkButton = ({ mcqId }: { mcqId: string }) => {
    const isBookmarked = isMcqBookmarked(mcqId);
    const IconComponent = isBookmarked ? SolidBookmarkIcon : OutlineBookmarkIcon;
    return (
      <button 
        onClick={() => handleToggleBookmark(mcqId, 'mcq')}
        className="p-2 rounded-full text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-500"
      >
        <IconComponent className="h-5 w-5 fill-current" />
      </button>
    );
  };

  const FlashcardBookmarkButton = ({ flashcardId }: { flashcardId: string }) => {
    const isBookmarked = isFlashcardBookmarked(flashcardId);
    const IconComponent = isBookmarked ? SolidBookmarkIcon : OutlineBookmarkIcon;
    return (
      <button 
        onClick={() => handleToggleBookmark(flashcardId, 'flashcard')}
        className="p-2 rounded-full text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-500"
      >
        <IconComponent className="h-5 w-5 fill-current" />
      </button>
    );
  };

  const getSourceDisplay = (source?: string) => {
    if (!source) return 'N/A';
    return source.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  };

  if (isLoading) return <Loader message={`Searching for "${query}"...`} />;
  if (error) return <div className="text-center py-10 text-red-500">Error: {error.message}</div>;

  return (
    <div className="container mx-auto p-6 bg-white dark:bg-slate-900 min-h-screen">
      <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">Search Results</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-6">Showing results for: <span className="font-semibold">{query}</span></p>

      {mcqResults.length === 0 && flashcardResults.length === 0 && (
        <p className="text-slate-600 dark:text-slate-300">No results found.</p>
      )}

      {mcqResults.length > 0 && (
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-800 dark:text-white mb-4">MCQs ({mcqResults.length})</h2>
          <div className="grid gap-4">
            {mcqResults.map((mcq) => (
              <div key={mcq.id} className="card-base p-4">
                <h3 className="font-medium text-slate-700 dark:text-slate-200 mb-2">
                  <ReactMarkdown>{mcq.question}</ReactMarkdown>
                </h3>
                <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  <p>Source: {getSourceDisplay(mcq.source)}</p>
                  <p>Topic: {mcq.topicName || mcq.topic || 'N/A'}</p>
                  <p>Chapter: {mcq.chapterName || mcq.chapter || 'N/A'}</p>
                  {mcq.tags?.length && <p>Tags: {mcq.tags.join(', ')}</p>}
                </div>
                <div className="flex justify-end space-x-2">
                  <button className="btn-neutral" onClick={() => handleOpenMcqModal(mcq)}>
                    View Details
                  </button>
                  <McqBookmarkButton mcqId={mcq.id} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {flashcardResults.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold text-slate-800 dark:text-white mb-4">Flashcards ({flashcardResults.length})</h2>
          <div className="grid gap-4">
            {flashcardResults.map((flashcard) => (
              <div key={flashcard.id} className="card-base p-4">
                <h3 className="font-medium text-slate-700 dark:text-slate-200 mb-2">
                  <ReactMarkdown>{flashcard.front}</ReactMarkdown>
                </h3>
                <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  <p>Source: {getSourceDisplay(flashcard.source)}</p>
                  <p>Topic: {flashcard.topicName || flashcard.topic || 'N/A'}</p>
                  <p>Chapter: {flashcard.chapterName || flashcard.chapter || 'N/A'}</p>
                  {flashcard.tags && flashcard.tags.length > 0 && <p>Tags: {flashcard.tags.join(', ')}</p>}
                </div>
                <div className="flex justify-end space-x-2">
                  <button className="btn-neutral" onClick={() => handleOpenFlashcardModal(flashcard)}>
                    View Details
                  </button>
                  <FlashcardBookmarkButton flashcardId={flashcard.id} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <Dialog.Root open={openMcqModal} onOpenChange={setOpenMcqModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-2xl bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg max-h-[90vh] overflow-y-auto">
            <Dialog.Title className="text-2xl font-bold text-neutral-800 dark:text-white">MCQ Details</Dialog.Title>
            <Dialog.Description className="text-neutral-600 dark:text-neutral-300">
              Review the question, options, and explanation.
            </Dialog.Description>
            {selectedMcq && (
              <div className="mt-4 prose dark:prose-invert max-w-none">
                <h3 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200 mb-2">Question:</h3>
                <div className="p-3 bg-neutral-100 dark:bg-neutral-700 rounded-md mb-4 text-neutral-800 dark:text-neutral-200">
                  <ReactMarkdown>{selectedMcq.question}</ReactMarkdown>
                </div>

                <h3 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200 mb-2">Options:</h3>
                <ul className="list-disc list-inside space-y-1 mb-4 text-neutral-800 dark:text-neutral-200">
                  {selectedMcq.options.map((option, index) => (
                    <li key={index} className={option === selectedMcq.correctAnswer ? 'font-bold text-green-600' : ''}>
                      {option}
                    </li>
                  ))}
                </ul>

                <h3 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200 mb-2">Correct Answer:</h3>
                <p className="p-3 bg-green-50 dark:bg-green-800/20 rounded-md mb-4 font-bold text-green-700 dark:text-green-300">
                  {selectedMcq.correctAnswer}
                </p>

                {selectedMcq.explanation && (
                  <>
                    <h3 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200 mb-2">Explanation:</h3>
                    <div className="p-3 bg-neutral-100 dark:bg-neutral-700 rounded-md mb-4 text-neutral-800 dark:text-neutral-200">
                      <ReactMarkdown>{selectedMcq.explanation}</ReactMarkdown>
                    </div>
                  </>
                )}

                <div className="text-sm text-neutral-600 dark:text-neutral-400">
                  <p>Source: {getSourceDisplay(selectedMcq.source)}</p>
                  <p>Topic: {selectedMcq.topicName || selectedMcq.topic || 'N/A'}</p>
                  <p>Chapter: {selectedMcq.chapterName || selectedMcq.chapter || 'N/A'}</p>
                  {selectedMcq.tags && selectedMcq.tags.length > 0 && <p>Tags: {selectedMcq.tags.join(', ')}</p>}
                </div>
              </div>
            )}
            <Dialog.Close asChild><button className="btn-neutral mt-4">Close</button></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={openFlashcardModal} onOpenChange={setOpenFlashcardModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-xl bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg max-h-[90vh] overflow-y-auto">
            <Dialog.Title className="text-2xl font-bold text-neutral-800 dark:text-white">Flashcard Details</Dialog.Title>
            <Dialog.Description className="text-neutral-600 dark:text-neutral-300">
              Review the front and back of the flashcard.
            </Dialog.Description>
            {selectedFlashcard && (
              <div className="mt-4 prose dark:prose-invert max-w-none">
                <h3 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200 mb-2">Front:</h3>
                <div className="p-3 bg-neutral-100 dark:bg-neutral-700 rounded-md mb-4 text-neutral-800 dark:text-neutral-200">
                  <ReactMarkdown>{selectedFlashcard.front}</ReactMarkdown>
                </div>

                <h3 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200 mb-2">Back:</h3>
                <div className="p-3 bg-neutral-100 dark:bg-neutral-700 rounded-md mb-4 text-neutral-800 dark:text-neutral-200">
                  <ReactMarkdown>{selectedFlashcard.back}</ReactMarkdown>
                </div>

                <div className="text-sm text-neutral-600 dark:text-neutral-400">
                  <p>Source: {getSourceDisplay(selectedFlashcard.source)}</p>
                  <p>Topic: {selectedFlashcard.topicName || selectedFlashcard.topic || 'N/A'}</p>
                  <p>Chapter: {selectedFlashcard.chapterName || selectedFlashcard.chapter || 'N/A'}</p>
                  {selectedFlashcard.tags && selectedFlashcard.tags.length > 0 && <p>Tags: {selectedFlashcard.tags.join(', ')}</p>}
                </div>
              </div>
            )}
            <Dialog.Close asChild><button className="btn-neutral mt-4">Close</button></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

export default SearchResultsPage;