import { createContext, useContext, ReactNode } from 'react'; // Removed React import as it's not directly used
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { getAppData } from '@/services/firestoreService';
import type { AppData } from '@pediaquiz/types';

// The context will provide the result of the TanStack Query
type DataContextType = UseQueryResult<AppData, Error>;

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider = ({ children }: { children: ReactNode }) => {
    // Use TanStack Query to fetch, cache, and manage the app data.
    const appDataQuery = useQuery<AppData, Error>({
        queryKey: ['appData'],
        queryFn: getAppData,
        staleTime: 1000 * 60 * 60, // 1 hour
        gcTime: 1000 * 60 * 60 * 24, // Corrected from cacheTime to gcTime for v5
        refetchOnWindowFocus: true, 
    });

    return (
        <DataContext.Provider value={appDataQuery}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = (): DataContextType => { // Return the specific type
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};