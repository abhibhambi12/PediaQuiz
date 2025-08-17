import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getMCQsByIds } from '../services/firestoreService'; // Assuming a similar function for flashcards exists or can be made
import Loader from '../components/Loader';
import type { MCQ, Flashcard } from '@pediaquiz/types';
import { Link } from 'react-router-dom';

const BookmarksPage: React.FC = () => {
  const { user } = useAuth();
  const [bookmarkedMcqs, setBookmarkedMcqs] = useState<MCQ[]>([]);
  // Placeholder for flashcards
  const [bookmarkedFlashcards, setBookmarkedFlashcards] = useState<Flashcard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchBookmarks = async () => {
      setIsLoading(true);
      const mcqIds = user.bookmarkedMcqs || [];
      // const flashcardIds = user.bookmarkedFlashcards || [];

      if (mcqIds.length > 0) {
        const mcqs = await getMCQsByIds(mcqIds);
        setBookmarkedMcqs(mcqs);
      } else {
        setBookmarkedMcqs([]);
      }

      // TODO: Implement getFlashcardsByIds in firestoreService and call it here
      // if(flashcardIds.length > 0) { ... }

      setIsLoading(false);
    };

    fetchBookmarks();
  }, [user]);

  if (isLoading) {
    return <Loader message="Loading bookmarks..." />;
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Bookmarks</h1>

      <h2 className="text-2xl font-semibold mb-4 border-b pb-2">Bookmarked Questions</h2>
      {bookmarkedMcqs.length === 0 ? (
        <p className="text-slate-500">You haven't bookmarked any questions yet.</p>
      ) : (
        <ul className="space-y-4">
          {bookmarkedMcqs.map((mcq) => (
            <li key={mcq.id} className="card-base p-4">
              <p className="font-semibold">{mcq.question}</p>
              <Link to={`/chapters/${mcq.topicId}/${mcq.chapterId}`} className="text-sm text-sky-600 hover:underline mt-2 inline-block">
                Go to Chapter
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Placeholder for Flashcards */}
      <h2 className="text-2xl font-semibold my-4 border-b pb-2 mt-8">Bookmarked Flashcards</h2>
      <p className="text-slate-500">You haven't bookmarked any flashcards yet.</p>
    </div>
  );
};

export default BookmarksPage;