import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getTopics } from '../services/firestoreService'; // Only getTopics is globally loaded
// Removed explicit Firestore SDK types imports as they're not needed here for top-level context
// import { collection, query, where, getDocs, QueryDocumentSnapshot, Firestore } from 'firebase/firestore';
// import { db } from '@/firebase'; // No longer directly used here for data fetching
import { AppData, Topic } from '@pediaquiz/types'; // Removed MCQ, Flashcard types as they are not stored here
import { useToast } from '@/components/Toast';
import { useQuery } from '@tanstack/react-query';


interface DataContextType {
  appData: AppData | null;
  isLoadingData: boolean;
  errorLoadingData: Error | null;
  refreshAppData: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: loadingAuth } = useAuth();
  const { addToast } = useToast();

  const { data: appData, isLoading: isLoadingData, error: errorLoadingData, refetch } = useQuery<AppData, Error>({
    queryKey: ['appData'],
    queryFn: async () => {
      // Corrected to only fetch topics and tags globally, as MCQs/Flashcards are now on-demand
      const [topics, tags] = await Promise.all([
        getTopics(),
        // Assuming getTags is still in firestoreService and fetching global tags
        // If it's not, you'll need to re-add or adjust.
        // For simplicity, let's assume getTags exists and returns string[]
        // from your initial file list, getTags is in firestoreService.ts
        // and returns string[]
        import('../services/firestoreService').then(module => module.getTags()),
      ]);

      return {
        topics: topics,
        mcqs: [], // Now an empty array, actual MCQs are fetched on demand
        flashcards: [], // Now an empty array, actual Flashcards are fetched on demand
        keyClinicalTopics: tags,
      };
    },
    enabled: !loadingAuth, // Only run the query once AuthContext has determined auth state
    staleTime: 1000 * 60 * 5, // Data considered fresh for 5 minutes (for topics/tags)
    gcTime: 1000 * 60 * 60 * 24, // Data garbage collected after 24 hours
    refetchOnWindowFocus: false, // Prevents refetching on tab refocus
  });

  useEffect(() => {
    if (errorLoadingData) {
      console.error('Failed to load application data:', errorLoadingData);
      addToast(`Failed to load app data: ${errorLoadingData.message}`, 'error');
    }
  }, [errorLoadingData, addToast]);

  const refreshAppData = useCallback(() => {
    refetch();
  }, [refetch]);

  const contextValue = useMemo(() => ({
    appData: appData || null,
    isLoadingData: isLoadingData,
    errorLoadingData: errorLoadingData,
    refreshAppData: refreshAppData,
  }), [appData, isLoadingData, errorLoadingData, refreshAppData]);

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};