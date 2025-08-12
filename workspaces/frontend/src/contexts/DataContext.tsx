// FILE: workspaces/frontend/src/contexts/DataContext.tsx

import { createContext, useContext, ReactNode } from 'react';
import { UseQueryResult } from '@tanstack/react-query';
import { AppData } from '@pediaquiz/types';

// The context now provides 'undefined' and does nothing.
// This allows for a progressive refactor of components that still use useData().
const DataContext = createContext<UseQueryResult<AppData, Error> | undefined>(undefined);

export const DataProvider = ({ children }: { children: ReactNode }) => {
    // The query has been removed. We pass null to the provider.
    return (
        <DataContext.Provider value={null as any}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = (): UseQueryResult<AppData, Error> | undefined => {
    // Components still calling this will get 'undefined' or a 'null' object.
    // This will force us to update them in Step C but prevents the app from crashing immediately.
    return useContext(DataContext);
};