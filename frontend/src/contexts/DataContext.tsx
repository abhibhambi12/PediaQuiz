import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getUserData } from '../services/userDataService';
import { useAuth } from './AuthContext'; // CORRECTED: Import useAuth to get UID
import type { UserData } from '@pediaquiz/types';

interface DataContextType {
  userData: UserData | null;
  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userData, setUserData] = useState<UserData | null>(null);
  const { user, loading } = useAuth(); // CORRECTED: Get user and loading from AuthContext

  const refreshData = async () => {
    // CORRECTED: Only attempt to fetch data if user is loaded and authenticated
    if (user && user.uid) {
      try {
        const data = await getUserData(user.uid); // CORRECTED: Pass user.uid
        setUserData(data);
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setUserData(null);
      }
    } else if (!loading && !user) {
      // If loading is complete and no user, set data to null
      setUserData(null);
    }
  };

  useEffect(() => {
    // Trigger refreshData whenever the user or loading state changes
    refreshData();
  }, [user, loading]); // CORRECTED: Add user and loading to dependencies

  return (
    <DataContext.Provider value={{ userData, refreshData }}>
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