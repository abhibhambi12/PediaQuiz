// FILE: frontend/src/contexts/AuthContext.tsx

import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/firebase';
import type { User as PediaquizUserType } from '@pediaquiz/types';

interface UserContextType extends PediaquizUserType {
    uid: string;
    email: string | null;
    displayName: string | null;
    isAdmin: boolean;
    createdAt: Date;
    lastLogin: Date;
    bookmarks?: string[];
    currentStreak: number;
    lastStudiedDate?: Date;
}

interface AuthContextType {
    user: UserContextType | null;
    loading: boolean;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<UserContextType | null>(null);
    // --- FIXED: Call setLoading as a function ---
    const [loading, setLoading] = useState(true); 

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
            if (firebaseUser) {
                try {
                    const idTokenResult = await firebaseUser.getIdTokenResult(true); 

                    const userDocRef = doc(db, 'users', firebaseUser.uid);
                    const userDocSnap = await getDoc(userDocRef);

                    if (userDocSnap.exists()) {
                        const userData = userDocSnap.data();
                        setUser({
                            uid: firebaseUser.uid,
                            email: firebaseUser.email,
                            displayName: firebaseUser.displayName,
                            isAdmin: idTokenResult.claims.isAdmin === true,
                            createdAt: userData.createdAt?.toDate() || new Date(),
                            lastLogin: new Date(),
                            currentStreak: userData.currentStreak || 0,
                            lastStudiedDate: userData.lastStudiedDate?.toDate(),
                        });
                        await updateDoc(userDocRef, { lastLogin: serverTimestamp() });
                    } else {
                        const newUser: UserContextType = {
                            uid: firebaseUser.uid,
                            email: firebaseUser.email,
                            displayName: firebaseUser.displayName,
                            isAdmin: idTokenResult.claims.isAdmin === true,
                            createdAt: new Date(),
                            lastLogin: new Date(),
                            currentStreak: 0,
                            lastStudiedDate: undefined,
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
        } catch (error: any) { 
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