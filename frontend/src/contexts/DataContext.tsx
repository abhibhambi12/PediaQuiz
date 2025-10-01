import { createContext, useContext, ReactNode, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
// FIX #8, #9: All data fetching is now centralized in apiService.
import { getAppData as fetchAppDataCallable } from '@/services/apiService'; 
import Loader from '@/components/Loader';
import type { AppData } from '@pediaquiz/types';

interface DataContextType {
    appData: AppData | null;
    isLoadingData: boolean;
    errorLoadingData: Error | null;
    refetchAppData: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider = ({ children }: { children: ReactNode }) => {
    const { user, loading: authLoading } = useAuth();

    // FIX #8, #9: This single query is now the source of truth for all core application content.
    // It fetches data from our robust, server-side getAppData Cloud Function.
    const { data, isLoading, error, refetch } = useQuery<AppData, Error>({
        queryKey: ['appData'], // Query is no longer user-specific, cache is global once logged in.
        queryFn: async () => {
            const response = await fetchAppDataCallable();
            return response.data;
        },
        enabled: !!user && !authLoading, // Only run when a user is authenticated and not loading
        staleTime: 1000 * 60 * 15,       // Data is considered fresh for 15 minutes
        gcTime: 1000 * 60 * 60,          // Cache is kept for 1 hour
        refetchOnWindowFocus: false,     // Prevents unnecessary refetches
    });

    const refetchAppData = useCallback(() => {
        refetch();
    }, [refetch]);

    // Show a loading state while auth or the initial data fetch is in progress
    if (authLoading || (isLoading && !data)) {
        return <Loader fullScreen message="Loading application data..." />;
    }

    // Show an error state if the main data fetch fails
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <h1 className="text-2xl font-bold text-red-500">Failed to Load Application Data</h1>
                <p className="mt-2 text-slate-600 dark:text-slate-400">{error.message}</p>
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
        <DataContext.Provider value={contextValue}>
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