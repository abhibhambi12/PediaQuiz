import { createContext, useContext, ReactNode } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { getAppData } from '@/services/firestoreService';
import type { AppData } from '@pediaquiz/types';
import { useAuth } from './AuthContext';

// --- FIX: Revert from LightweightAppData back to the full AppData type ---
// This resolves dozens of TS2339 errors across the application where
// components expected appData.mcqs and appData.flashcards to be present.
type DataContextType = UseQueryResult<AppData, Error>;

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider = ({ children }: { children: ReactNode }) => {
    const { user } = useAuth();

    const appDataQuery = useQuery<AppData, Error>({
        queryKey: ['appData'],
        queryFn: getAppData,
        staleTime: 1000 * 60 * 60, // 1 hour
        gcTime: 1000 * 60 * 60 * 24,
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