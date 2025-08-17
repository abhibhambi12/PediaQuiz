// frontend/src/pages/BookmarksPage.tsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getBookmarks } from '../services/firestoreService';

const BookmarksPage: React.FC = () => {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      getBookmarks(user.uid).then(setBookmarks).catch(console.error);
    }
  }, [user]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Bookmarks</h1>
      {bookmarks.length === 0 ? (
        <p>No bookmarks found.</p>
      ) : (
        <ul>
          {bookmarks.map((bookmark) => (
            <li key={bookmark.id} className="p-2 border-b">
              {bookmark.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BookmarksPage;