// workspaces/frontend/src/contexts/AuthContext.tsx
import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, FieldValue } from 'firebase/firestore'; // FIX: Ensure FieldValue is imported for delete()
import { auth, db } from '@/firebase';
import type { User as PediaquizUserType } from '@pediaquiz/types';
import { useQuery } from '@tanstack/react-query';
import { getBookmarks } from '@/services/userDataService';

interface UserContextType extends PediaquizUserType {
    uid: string;
    email: string | null;
    displayName: string | null;
}

interface AuthContextType {
    user: UserContextType | null;
    loading: boolean;
    logout: () => Promise<void>;
    userBookmarksQuery: ReturnType<typeof useQuery<{ mcq: string[], flashcard: string[] }>>;
    updateUserDoc: (data: { [key: string]: any | FieldValue }) => Promise<void>; // FIX: Added FieldValue type
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<UserContextType | null>(null);
    const [loading, setLoading] = useState(true);

    const userBookmarksQuery = useQuery({
        queryKey: ['bookmarks', user?.uid],
        queryFn: () => getBookmarks(user!.uid),
        enabled: !!user,
        // FIX: userBookmarksQuery should use a default empty array for consistency if no bookmarks exist.
        // The service already returns { mcq: [], flashcard: [] } if none exist, so no explicit initialData needed here.
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    const updateUserDoc = useCallback(async (data: { [key: string]: any | FieldValue }) => { // FIX: Added FieldValue type
        if (!user) return;
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, data);
    }, [user]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
            if (firebaseUser) {
                try {
                    const idTokenResult = await firebaseUser.getIdTokenResult(true);
                    const userDocRef = doc(db, 'users', firebaseUser.uid);
                    const userDocSnap = await getDoc(userDocRef);

                    let pediaquizUserData: UserContextType;

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
                            activeSessionId: userData.activeSessionId || undefined,
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
                            currentStreak: 0,
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
                } catch (error) {
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
        await signOut(auth);
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, logout, userBookmarksQuery, updateUserDoc }}>
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