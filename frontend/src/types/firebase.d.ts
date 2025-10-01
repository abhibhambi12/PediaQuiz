// This declaration file provides explicit types for Firebase modules,
// resolving potential build issues in a strict TypeScript/Vite environment.

declare module 'firebase/app' {
    import { FirebaseApp } from '@firebase/app';
    export { initializeApp } from '@firebase/app';
    export type { FirebaseApp };
}

declare module 'firebase/auth' {
    import { Auth, User, AuthProvider, GoogleAuthProvider, AuthCredential, UserCredential } from '@firebase/auth';
    export { getAuth, onAuthStateChanged, signOut, GoogleAuthProvider, EmailAuthProvider, reauthenticateWithCredential, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, connectAuthEmulator, updateProfile, sendPasswordResetEmail } from '@firebase/auth';
    export type { Auth, User, AuthProvider, AuthCredential, UserCredential };
}

declare module 'firebase/firestore' {
    import { Firestore, QueryDocumentSnapshot, DocumentData, Transaction, FieldPath, Timestamp, FieldValue } from '@firebase/firestore';
    export { getFirestore, collection, getDocs, doc, getDoc, query, where, documentId, orderBy, setDoc, updateDoc, serverTimestamp, enableIndexedDbPersistence, deleteField, Timestamp, FieldValue, FieldPath, runTransaction, writeBatch, connectFirestoreEmulator } from '@firebase/firestore';
    export type { Firestore, QueryDocumentSnapshot, DocumentData, Transaction, FieldPath, Timestamp, FieldValue };
}

declare module 'firebase/storage' {
    import { FirebaseStorage, StorageReference } from '@firebase/storage';
    export { getStorage, ref, uploadBytes, getDownloadURL, connectStorageEmulator } from '@firebase/storage';
    export type { FirebaseStorage, StorageReference };
}

declare module 'firebase/functions' {
    import { Functions, HttpsCallableResult, HttpsCallable } from '@firebase/functions';
    export { getFunctions, httpsCallable, connectFunctionsEmulator } from '@firebase/functions';
    export type { Functions, HttpsCallableResult, HttpsCallable };
}

declare module 'firebase/messaging' {
    import { Messaging, MessagePayload } from '@firebase/messaging';
    export { getMessaging, getToken, onMessage } from '@firebase/messaging';
    export type { Messaging, MessagePayload };
}