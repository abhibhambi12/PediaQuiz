import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, FieldValue } from 'firebase/firestore';
import { auth, db } from '@/firebase';
import type { User as PediaquizUserType, ToggleBookmarkCallableData } from '@pediaquiz/types';
import { useQueryClient } from '@tanstack/react-query';
import { toggleBookmark as toggleBookmarkService } from '@/services/userDataService';

// This interface is now solely for context typing, not for function arguments
interface AuthContextType {
    user: PediaquizUserType | null;
    loading: boolean;
    logout: () => Promise<void>;
    updateUserDoc: (data: { [key: string]: any | FieldValue }) => Promise<void>;
    toggleBookmark: (data: ToggleBookmarkCallableData) => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<PediaquizUserType | null>(null);
    const [loading, setLoading] = useState(true);
    const queryClient = useQueryClient();

    const fetchAndSetUser = useCallback(async (firebaseUser: FirebaseUser) => {
        const idTokenResult = await firebaseUser.getIdTokenResult(true);
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        let pediaquizUserData: PediaquizUserType;

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            pediaquizUserData = {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName,
                isAdmin: idTokenResult.claims.isAdmin === true,
                createdAt: (userData.createdAt as Timestamp)?.toDate() || new Date(),
                lastLogin: new Date(),
                currentStreak: userData.currentStreak || 0,
                lastStudiedDate: (userData.lastStudiedDate as Timestamp)?.toDate(),
                bookmarkedMcqs: userData.bookmarkedMcqs || [],
                bookmarkedFlashcards: userData.bookmarkedFlashcards || [],
                activeSessionId: userData.activeSessionId,
            };
            await updateDoc(userDocRef, { lastLogin: serverTimestamp() });
        } else {
            pediaquizUserData = {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName,
                isAdmin: false,
                createdAt: new Date(),
                lastLogin: new Date(),
                bookmarkedMcqs: [],
                bookmarkedFlashcards: [],
            };
            await setDoc(userDocRef, {
                ...pediaquizUserData,
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp(),
            });
        }
        setUser(pediaquizUserData);
        return pediaquizUserData;
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                try {
                    await fetchAndSetUser(firebaseUser);
                } catch (error) {
                    console.error("Error fetching or setting user document:", error);
                    setUser(null);
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [fetchAndSetUser]);

    const refreshUser = useCallback(async () => {
        const firebaseUser = auth.currentUser;
        if (firebaseUser) {
            await fetchAndSetUser(firebaseUser);
        }
    }, [fetchAndSetUser]);

    const logout = useCallback(async () => {
        await signOut(auth);
        setUser(null);
        queryClient.clear();
    }, [queryClient]);

    const updateUserDoc = useCallback(async (data: { [key: string]: any | FieldValue }) => {
        if (!user) return;
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, data);
        await refreshUser(); // Refresh user state after update
    }, [user, refreshUser]);

    const toggleBookmark = useCallback(async (data: ToggleBookmarkCallableData) => {
        if (!user) return;

        // Optimistic update for instant UI feedback
        const key = data.contentType === 'mcq' ? 'bookmarkedMcqs' : 'bookmarkedFlashcards';
        const currentBookmarks = user[key] || [];
        const isBookmarked = currentBookmarks.includes(data.contentId);

        const newBookmarks = isBookmarked
            ? currentBookmarks.filter(id => id !== data.contentId)
            : [...currentBookmarks, data.contentId];

        setUser(currentUser => currentUser ? { ...currentUser, [key]: newBookmarks } : null);

        try {
            // Call backend to persist the change
            await toggleBookmarkService({ ...data, action: isBookmarked ? 'remove' : 'add' });
            // Refresh user from source to ensure consistency
            await refreshUser();
        } catch (error) {
            console.error("Failed to toggle bookmark", error);
            // Revert optimistic update on failure
            setUser(currentUser => currentUser ? { ...currentUser, [key]: currentBookmarks } : null);
        }
    }, [user, refreshUser]);

    const value = useMemo(() => ({
        user,
        loading,
        logout,
        updateUserDoc,
        toggleBookmark,
        refreshUser,
    }), [user, loading, logout, updateUserDoc, toggleBookmark, refreshUser]);

    return (
        <AuthContext.Provider value={value}>
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