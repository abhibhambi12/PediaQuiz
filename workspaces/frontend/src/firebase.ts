// --- CORRECTED FILE: workspaces/frontend/src/firebase.ts ---

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFunctions, Functions } from 'firebase/functions';

// Load Firebase configuration from environment variables (for Vite)
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// FIX: Add console log to ensure environment variables are being read
console.log("Firebase Config Loaded:", {
    apiKey: firebaseConfig.apiKey ? "Loaded" : "MISSING",
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
});

// FIX: Add a check for missing API key before initializing
if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "undefined") {
    console.error("VITE_FIREBASE_API_KEY is missing or undefined. Please check your .env file.");
    // Optionally throw an error or handle gracefully if the app can't run without it
    throw new Error("Firebase API Key is missing. Check .env configuration.");
}


// Initialize Firebase App
export const app: FirebaseApp = initializeApp(firebaseConfig);

// Export services for use throughout the app.
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
// Ensure region is set for functions
export const functions: Functions = getFunctions(app, 'us-central1');