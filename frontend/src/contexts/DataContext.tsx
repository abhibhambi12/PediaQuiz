import React, { createContext, useContext, useState, useEffect } from 'react';
import { getUserData, UserData } from '../services/userDataService';

interface DataContextType {
  userData: UserData | null;
  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userData, setUserData] = useState<UserData | null>(null);

  const refreshData = async () => {
    try {
      const data = await getUserData();
      setUserData(data);
    } catch (error) {
      console.error('Failed to fetch user data:', error);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

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