// --- CORRECTED FILE: workspaces/frontend/src/contexts/DataContext.tsx ---

import { createContext, useContext, ReactNode } from 'react';
import { UseQueryResult } from '@tanstack/react-query';
import { AppData } from '@pediaquiz/types';

// This context is effectively deprecated. Components should now use specific data hooks.
// This context will provide 'undefined' to any consumers.
const DataContext = createContext<UseQueryResult<AppData, Error> | undefined>(undefined);

export const DataProvider = ({ children }: { children: ReactNode }) => {
    // The query and data fetching logic have been removed from here.
    // Passing 'undefined' to the provider ensures components cannot rely on it.
    return (
        <DataContext.Provider value={undefined}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = (): UseQueryResult<AppData, Error> | undefined => {
    // This hook will now always return 'undefined'.
    // Components calling it will need to be refactored to use granular data fetching hooks.
    return useContext(DataContext);
};