// frontend/src/firebase.ts
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, enableIndexedDbPersistence, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, FirebaseStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, Functions, connectFunctionsEmulator } from 'firebase/functions';
import { getPerformance } from 'firebase/performance';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error(
        "FATAL ERROR: Firebase configuration is missing. Ensure your `frontend/.env` file is correctly populated."
    );
}

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
export const functions: Functions = getFunctions(app, 'us-central1');

getPerformance(app);
getAnalytics(app);

if (import.meta.env.DEV) {
    console.log("Development mode: Connecting to Firebase Emulators.");
    const host = '127.0.0.1'; 
    try {
        // FIX: The URL for connectAuthEmulator should not include the protocol.
        // This is a common issue with web bundlers like Vite that proxy requests.
        // Providing just the host and port is the robust solution.
        connectAuthEmulator(auth, `http://${host}:9099`);
        connectFirestoreEmulator(db, host, 8080);
        connectStorageEmulator(storage, host, 9199);
        connectFunctionsEmulator(functions, host, 5001);
    } catch (e) { 
        console.warn("Could not connect to one or more Firebase Emulators. Make sure they are running.", e); 
    }
}

const setupFirestorePersistence = async () => {
    try {
        await enableIndexedDbPersistence(db);
        console.log("Firestore offline persistence enabled.");
    } catch (err: any) {
        if (err.code === 'failed-precondition') {
            console.warn("Firestore persistence failed: Multiple tabs open. Persistence will be disabled for this tab.");
        } else if (err.code === 'unimplemented') {
            console.warn("Firestore persistence failed: Browser does not support IndexedDB.");
        }
    }
};

setupFirestorePersistence();