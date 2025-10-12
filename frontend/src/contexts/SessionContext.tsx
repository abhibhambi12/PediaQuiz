import { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { SessionManager } from '@/services/sessionService';
import { QuizSession } from '@pediaquiz/types';

interface SessionContextProps {
  activeSession: QuizSession | null | undefined;
  isLoading: boolean;
}

const SessionContext = createContext<SessionContextProps | undefined>(undefined);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();

  const { data: activeSession, isLoading } = useQuery({
    queryKey: ['activeSession', user?.uid, user?.activeSessionId],
    queryFn: () => {
      if (!user?.activeSessionId) return null;
      return SessionManager.getSession(user.activeSessionId);
    },
    enabled: !!user?.activeSessionId,
    refetchOnWindowFocus: true, 
    staleTime: 1000 * 60, 
  });

  return (
    <SessionContext.Provider value={{ activeSession, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = (): SessionContextProps => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};