import { createContext, useState, useEffect, useContext, useCallback, PropsWithChildren } from 'react';
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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: PropsWithChildren) => {
    const [user, setUser] = useState<ClientUser | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchUserData = useCallback(async (firebaseUser: FirebaseUser) => {
        const idTokenResult = await firebaseUser.getIdTokenResult(true); // Force refresh of token
        const response = await getOrCreateUserProfile();
        const userDataFromBackend = response.data;

        setUser({
            ...userDataFromBackend,
            isAdmin: idTokenResult.claims.isAdmin === true,
            role: idTokenResult.claims.role || 'student', // Get role from token
        });
    }, []);
    
    const handleLogout = useCallback(async () => {
        try {
            await signOut(auth);
            setUser(null);
            // Clear any sensitive local storage
            localStorage.removeItem('pediaquiz_onboarding_completed');
        } catch (error) {
            console.error("Error signing out:", error);
        }
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                setLoading(true);
                try {
                    await fetchUserData(firebaseUser);
                } catch (error) {
                    console.error("Failed to fetch user data, signing out:", error);
                    await handleLogout();
                } finally {
                    setLoading(false);
                }
            } else {
                setUser(null);
                setLoading(false);
            }
        });

        // Listen for the global force-logout event from the API client
        const handleForceLogout = () => {
            console.warn("Authentication error detected. Forcing logout.");
            handleLogout();
        };
        window.addEventListener('force-logout', handleForceLogout);

        return () => {
            unsubscribe();
            window.removeEventListener('force-logout', handleForceLogout);
        };
    }, [fetchUserData, handleLogout]);

    const updateUserDoc = useCallback(async (updates: Partial<PediaquizUserType>) => {
        if (!auth.currentUser) throw new Error("No authenticated user found.");
        
        await updateUserProfile({ updates });
        // Optimistically update local state while waiting for token refresh
        setUser(prev => (prev ? { ...prev, ...updates } : null));
        await fetchUserData(auth.currentUser); // Re-fetch to get latest state
    }, [fetchUserData]);

    const refreshUser = useCallback(async () => {
        if (auth.currentUser) await fetchUserData(auth.currentUser);
    }, [fetchUserData]);

    return (
        <AuthContext.Provider value={{ user, loading, logout: handleLogout, updateUserDoc, refreshUser }}>
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