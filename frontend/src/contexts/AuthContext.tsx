import {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  PropsWithChildren,
} from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/firebase';
import type { ClientUser, User as PediaquizUserType } from '@pediaquiz/types';
import { getOrCreateUserProfile, updateUserProfile } from '@/services/apiService';
import { signOut } from 'firebase/auth';

interface AuthContextType {
  user: ClientUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUserDoc: (updates: Partial<PediaquizUserType>) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async (firebaseUser: FirebaseUser) => {
    // This function's implementation remains the same.
    const idTokenResult = await firebaseUser.getIdTokenResult(true);
    const response = await getOrCreateUserProfile();
    const userDataFromBackend = response.data;

    setUser({
      ...userDataFromBackend,
      isAdmin: idTokenResult.claims.isAdmin === true,
      role: (idTokenResult.claims.role as PediaquizUserType['role']) || 'student',
    });
  }, []);

  const handleLogout = useCallback(async () => {
    // This function's implementation remains the same.
    try {
      await signOut(auth);
      setUser(null);
      localStorage.removeItem('pediaquiz_onboarding_completed');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setLoading(true);
        try {
          await fetchUserData(firebaseUser);
        } catch (error) {
          console.error("Auth Error: Failed to fetch user data, signing out.", error);
          await handleLogout();
        } finally {
          setLoading(false);
        }
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    // --- BATCH 1: GLOBAL AUTH ERROR HANDLING ---
    // This new event listener connects the AuthContext to the new apiClient.
    // If any API call fails with an authentication error, the apiClient dispatches
    // this event, and this listener ensures the user is logged out immediately.
    const handleForceLogout = () => {
      console.warn("Authentication error detected via global event. Forcing logout.");
      handleLogout();
    };
    window.addEventListener('force-logout', handleForceLogout);

    // Cleanup function to remove both listeners when the component unmounts.
    return () => {
      unsubscribe();
      window.removeEventListener('force-logout', handleForceLogout);
    };
  }, [fetchUserData, handleLogout]);

  const updateUserDoc = useCallback(
    async (updates: Partial<PediaquizUserType>) => {
      // This function's implementation remains the same.
      if (!auth.currentUser) throw new Error('No authenticated user found.');

      await updateUserProfile({ updates });
      setUser((prev) =>
        prev ? { ...prev, ...(updates as Partial<ClientUser>) } : null
      );
      await fetchUserData(auth.currentUser);
    },
    [fetchUserData]
  );

  const refreshUser = useCallback(async () => {
    // This function's implementation remains the same.
    if (auth.currentUser) await fetchUserData(auth.currentUser);
  }, [fetchUserData]);

  return (
    <AuthContext.Provider
      value={{ user, loading, logout: handleLogout, updateUserDoc, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};