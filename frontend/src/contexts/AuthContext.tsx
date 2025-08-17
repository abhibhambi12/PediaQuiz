import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp, FieldValue } from 'firebase/firestore';
import { auth, db } from '@/firebase';
import type { User as PediaquizUserType, AttemptedMCQs } from '@pediaquiz/types'; // Import AttemptedMCQs type
import { useQuery } from '@tanstack/react-query';
import { getBookmarks } from '@/services/userDataService';

// Define QuizSession interface as it's used in AuthContext's UserContextType
interface QuizSession {
    id: string;
    userId: string;
    mode: 'practice' | 'quiz' | 'custom' | 'weakness' | 'incorrect' | 'mock' | 'review_due' | 'warmup';
    mcqIds: string[];
    currentIndex: number;
    answers: Record<number, string | null>;
    markedForReview: number[];
    isFinished: boolean;
    createdAt: Date;
    expiresAt: Date;
}

// Ensure UserContextType extends PediaquizUserType and includes all necessary fields
interface UserContextType extends PediaquizUserType {
    uid: string;
    email: string | null;
    displayName: string | null;
    isAdmin: boolean;
    createdAt: Date;
    lastLogin: Date;
    bookmarkedMcqs: string[]; // Ensure these are always initialized arrays
    bookmarkedFlashcards: string[]; // Ensure these are always initialized arrays
    currentStreak: number;
    lastStudiedDate?: Date;
    activeSessionId?: string; // Correctly typed now
}

interface AuthContextType {
    user: UserContextType | null;
    loading: boolean;
    logout: () => Promise<void>;
    userBookmarksQuery: ReturnType<typeof useQuery<{ mcq: string[], flashcard: string[] }>>;
    updateUserDoc: (data: { [key: string]: any | FieldValue }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<UserContextType | null>(null);
    const [loading, setLoading] = useState(true);

    const userBookmarksQuery = useQuery({
        queryKey: ['bookmarks', user?.uid],
        queryFn: () => getBookmarks(user!.uid),
        enabled: !!user,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    const updateUserDoc = useCallback(async (data: { [key: string]: any | FieldValue }) => {
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
                            bookmarkedMcqs: userData.bookmarkedMcqs || [], // Initialize with empty array if null/undefined
                            bookmarkedFlashcards: userData.bookmarkedFlashcards || [], // Initialize with empty array if null/undefined
                            activeSessionId: userData.activeSessionId || undefined,
                        };
                        await updateDoc(userDocRef, { lastLogin: serverTimestamp() });
                    } else {
                        // New user creation
                        pediaquizUserData = {
                            uid: firebaseUser.uid,
                            email: firebaseUser.email,
                            displayName: firebaseUser.displayName,
                            isAdmin: false,
                            createdAt: new Date(),
                            lastLogin: new Date(),
                            currentStreak: 0,
                            bookmarkedMcqs: [], // Initialize for new users
                            bookmarkedFlashcards: [], // Initialize for new users
                        };
                        await setDoc(userDocRef, {
                            ...pediaquizUserData,
                            createdAt: serverTimestamp(),
                            lastLogin: serverTimestamp(),
                        });
                    }
                    setUser(pediaquizUserData);
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
    }, []);

    const logout = useCallback(async () => {
        await signOut(auth);
        setUser(null);
    }, []);

    const value = useMemo(() => ({
        user,
        loading,
        logout,
        userBookmarksQuery,
        updateUserDoc
    }), [user, loading, logout, userBookmarksQuery, updateUserDoc]);

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