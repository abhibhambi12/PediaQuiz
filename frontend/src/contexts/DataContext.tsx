import { createContext, useContext, ReactNode, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { getAppData as fetchAppDataCallable } from '@/services/apiService';
import Loader from '@/components/Loader';
import type { AppData } from '@pediaquiz/types';

type LightAppData = Omit<AppData, 'mcqs' | 'flashcards'>;

interface DataContextType {
  appData: LightAppData | null;
  isLoadingData: boolean;
  errorLoadingData: Error | null;
  refetchAppData: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();

  const { data, isLoading, error, refetch } = useQuery<LightAppData, Error>({
    queryKey: ['appData'],
    queryFn: async () => {
      const response = await fetchAppDataCallable();
      return response.data;
    },
    enabled: !!user && !authLoading,
  });

  const refetchAppData = useCallback(() => {
    refetch();
  }, [refetch]);

  if (authLoading || (isLoading && user)) {
    return <Loader fullScreen message="Loading application data..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <h1 className="text-2xl font-bold text-red-500">
          Failed to Load Application Data
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          {error.message}
        </p>
        <button onClick={() => refetch()} className="mt-6 btn-primary">
          Try Again
        </button>
      </div>
    );
  }

  const contextValue: DataContextType = {
    appData: data || null,
    isLoadingData: isLoading,
    errorLoadingData: error || null,
    refetchAppData,
  };

  return (
    <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};