// frontend/src/firebase.ts
// MODIFIED: Corrected environment variable access for Vite (`import.meta.env`).
//           Corrected `getFunctions` initialization.
//           Ensured offline persistence is enabled.

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFunctions, Functions } from 'firebase/functions'; // Corrected import for getFunctions

// Firebase configuration from environment variables
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Basic validation for Firebase config to ensure .env variables are loaded
if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "undefined") {
    throw new Error("Firebase API Key (VITE_FIREBASE_API_KEY) is missing. Check your .env configuration.");
}
if (!firebaseConfig.projectId || firebaseConfig.projectId === "undefined") {
    throw new Error("Firebase Project ID (VITE_FIREBASE_PROJECT_ID) is missing. Check your .env configuration.");
}


// Initialize Firebase App
export const app: FirebaseApp = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
// Initialize Cloud Functions with the correct region
export const functions: Functions = getFunctions(app, 'us-central1'); // Correct usage of getFunctions with region

// Enable Firestore offline persistence
enableIndexedDbPersistence(db)
    .then(() => {
        console.log("Firestore offline persistence enabled successfully.");
    })
    .catch((err) => {
        // Handle persistence errors more gracefully for the user
        if (err.code === 'failed-precondition') {
            console.warn("Firestore persistence failed to enable: Multiple tabs open or previous uncleaned state. Persistence will be disabled for this tab.", err);
        } else if (err.code === 'unimplemented') {
            console.warn("Firestore persistence unimplemented: Browser does not support indexedDB. Persistence will be disabled.", err);
        } else {
            console.error("Firestore persistence failed with an unexpected error:", err);
        }
    });