import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/firebase';
import type { User } from '@pediaquiz/types';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
            if (firebaseUser) {
                try {
                    // --- FIX: Force a refresh of the ID token ---
                    // This is CRITICAL after custom claims have been changed on the backend.
                    // It ensures the frontend gets the latest claims (like isAdmin).
                    const idTokenResult = await firebaseUser.getIdTokenResult(true); // true forces a refresh

                    const userDocRef = doc(db, 'users', firebaseUser.uid);
                    const userDocSnap = await getDoc(userDocRef);

                    if (userDocSnap.exists()) {
                        const userData = userDocSnap.data();
                        setUser({
                            uid: firebaseUser.uid,
                            email: firebaseUser.email,
                            displayName: firebaseUser.displayName,
                            // Use the refreshed token's claims as the source of truth for isAdmin
                            isAdmin: idTokenResult.claims.isAdmin === true,
                            createdAt: userData.createdAt?.toDate() || new Date(),
                            lastLogin: new Date(), // Set to now
                        });
                        // Update last login silently
                        await updateDoc(userDocRef, { lastLogin: serverTimestamp() });
                    } else {
                        // Create user profile if it doesn't exist
                        const newUser: User = {
                            uid: firebaseUser.uid,
                            email: firebaseUser.email,
                            displayName: firebaseUser.displayName,
                            // Use the refreshed token's claims here too
                            isAdmin: idTokenResult.claims.isAdmin === true,
                            createdAt: new Date(),
                            lastLogin: new Date(),
                        };
                        await setDoc(userDocRef, {
                            ...newUser,
                            createdAt: serverTimestamp(),
                            lastLogin: serverTimestamp()
                        });
                        setUser(newUser);
                    }
                } catch (error) {
                    console.error("Error fetching/creating user profile:", error);
                    setUser(null);
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const logout = useCallback(async () => {
        try {
            await signOut(auth);
            setUser(null);
        } catch (error) {
            console.error("Error signing out:", error);
        }
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, logout }}>
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