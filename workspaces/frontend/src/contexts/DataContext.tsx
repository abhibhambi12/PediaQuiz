import React, { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTopics, getKeyClinicalTopics } from '@/services/firestoreService';
import type { AppData, Topic } from '@pediaquiz/types';

interface DataContextType {
  data: AppData | undefined;
  isLoading: boolean;
  error: Error | null;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const { data: topics, isLoading: isLoadingTopics, error: topicsError } = useQuery<Topic[], Error>({
    queryKey: ['topics'],
    queryFn: getTopics,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });

  const { data: keyClinicalTopics, isLoading: isLoadingKCT, error: kctError } = useQuery<string[], Error>({
    queryKey: ['keyClinicalTopics'],
    queryFn: getKeyClinicalTopics,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });

  const appData: AppData | undefined = topics && keyClinicalTopics
    ? { topics, keyClinicalTopics }
    : undefined;

  const value: DataContextType = {
    data: appData,
    isLoading: isLoadingTopics || isLoadingKCT,
    error: topicsError || kctError || null,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};