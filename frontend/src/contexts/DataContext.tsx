import { createContext, useContext, ReactNode } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { getAppData } from '@/services/firestoreService';
import type { AppData } from '@pediaquiz/types';
import { useAuth } from './AuthContext'; // <--- Import useAuth

// Using the lightweight AppData type from our performance refactor
type LightweightAppData = Omit<AppData, 'mcqs' | 'flashcards'>;
type DataContextType = UseQueryResult<LightweightAppData, Error>;

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider = ({ children }: { children: ReactNode }) => {
    const { user } = useAuth(); // <--- Get the current user from the AuthContext

    const appDataQuery = useQuery<LightweightAppData, Error>({
        queryKey: ['appData'],
        queryFn: getAppData,
        staleTime: 1000 * 60 * 60, // 1 hour
        gcTime: 1000 * 60 * 60 * 24,
        
        // --- FIX: This is the crucial change ---
        // The 'enabled' option tells TanStack Query to ONLY run this query
        // when the condition is true. In this case, only run when 'user' is not null.
        enabled: !!user, 
    });

    return (
        <DataContext.Provider value={appDataQuery}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = (): DataContextType => {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};