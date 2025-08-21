// frontend/src/contexts/AuthContext.tsx
// MODIFIED: Updated to handle new user fields (XP, Level, Streak, Theme, Badges).
//           Corrected Firebase Firestore imports.

import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore'; // Import Timestamp
import { auth, db } from '@/firebase'; // Correct import path for db
import type { User as PediaquizUserType } from '@pediaquiz/types';

interface UserContextType extends Omit<PediaquizUserType, 'createdAt' | 'lastLogin' | 'lastStudiedDate'> {
    uid: string;
    email: string | null;
    displayName: string | null;
    isAdmin: boolean;
    createdAt?: Date;
    lastLogin?: Date;
    bookmarkedMcqs?: string[];
    bookmarkedFlashcards?: string[];
    activeSessionId?: string;
    currentStreak?: number;
    lastStudiedDate?: Date | null;
    xp?: number;
    level?: number;
    theme?: string;
    badges?: string[];
}

interface AuthContextType {
    user: UserContextType | null;
    loading: boolean;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
    updateUserDoc: (updates: Partial<PediaquizUserType>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<UserContextType | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchUserData = useCallback(async (firebaseUser: FirebaseUser) => {
        try {
            const idTokenResult = await firebaseUser.getIdTokenResult(true);
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            const userDocSnap = await getDoc(userDocRef);

            let userDataFromFirestore: any = userDocSnap.exists() ? userDocSnap.data() : null;

            if (!userDocSnap.exists()) {
                const newUserDefaults = {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    displayName: firebaseUser.displayName,
                    isAdmin: false,
                    createdAt: serverTimestamp(),
                    lastLogin: serverTimestamp(),
                    bookmarkedMcqs: [],
                    bookmarkedFlashcards: [],
                    currentStreak: 0,
                    lastStudiedDate: null,
                    xp: 0,
                    level: 1,
                    theme: 'default',
                    badges: [],
                };
                await setDoc(userDocRef, newUserDefaults);
                console.log("New user document created in Firestore.");
                userDataFromFirestore = newUserDefaults;
            } else {
                await updateDoc(userDocRef, { lastLogin: serverTimestamp() });
            }

            const currentUserData: UserContextType = {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName,
                isAdmin: idTokenResult.claims.isAdmin === true,
                createdAt: userDataFromFirestore?.createdAt instanceof Timestamp ? userDataFromFirestore.createdAt.toDate() : undefined,
                lastLogin: userDataFromFirestore?.lastLogin instanceof Timestamp ? userDataFromFirestore.lastLogin.toDate() : undefined,
                bookmarkedMcqs: userDataFromFirestore?.bookmarkedMcqs || [],
                bookmarkedFlashcards: userDataFromFirestore?.bookmarkedFlashcards || [],
                activeSessionId: userDataFromFirestore?.activeSessionId || undefined,
                currentStreak: userDataFromFirestore?.currentStreak || 0,
                lastStudiedDate: userDataFromFirestore?.lastStudiedDate instanceof Timestamp ? userDataFromFirestore.lastStudiedDate.toDate() : null,
                xp: userDataFromFirestore?.xp || 0,
                level: userDataFromFirestore?.level || 1,
                theme: userDataFromFirestore?.theme || 'default',
                badges: userDataFromFirestore?.badges || [],
            };

            setUser(currentUserData);
        } catch (error) {
            console.error("Error fetching/creating user profile:", error);
            setUser(null);
            throw error;
        }
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
            if (firebaseUser) {
                await fetchUserData(firebaseUser);
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [fetchUserData]);

    const logout = useCallback(async () => {
        try {
            await signOut(auth);
            setUser(null);
            localStorage.removeItem('pediaquiz_onboarding_completed');
            console.log("User signed out successfully.");
        } catch (error: any) {
            console.error("Error signing out:", error);
        }
    }, []);

    const refreshUser = useCallback(async () => {
        if (auth.currentUser) {
            await fetchUserData(auth.currentUser);
        }
    }, [fetchUserData]);

    const updateUserDoc = useCallback(async (updates: Partial<PediaquizUserType>) => {
        if (!user?.uid) {
            console.error("Cannot update user: No authenticated user.");
            return;
        }
        const userDocRef = doc(db, 'users', user.uid);
        try {
            const updatesToApply = { ...updates };
            // CRITICAL FIX: Ensure only mutable user fields are passed to Firestore `updateDoc`
            // immutable fields like `createdAt`, `lastLogin`, and gamification stats
            // managed by backend functions should not be updated directly by frontend `updateUserDoc`.
            delete updatesToApply.createdAt;
            delete updatesToApply.lastLogin;
            delete updatesToApply.xp;
            delete updatesToApply.level;
            delete updatesToApply.currentStreak;
            delete updatesToApply.lastStudiedDate;
            delete updatesToApply.badges;

            await updateDoc(userDocRef, updatesToApply);
            console.log("User document updated successfully.");
            await refreshUser();
        } catch (error) {
            console.error("Error updating user document:", error);
            throw error;
        }
    }, [user, refreshUser]);

    return (
        <AuthContext.Provider value={{ user, loading, logout, refreshUser, updateUserDoc }}>
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