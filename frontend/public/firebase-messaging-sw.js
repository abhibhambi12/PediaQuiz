    /**
     * This service worker handles background push notifications for Firebase Cloud Messaging.
     * It must be placed in the public/root directory of the frontend.
     */
    
    // Scripts for Firebase App and Messaging (using compat versions for broader service worker support)
    importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
    importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
    
    // The `self.__FIREBASE_CONFIG__` placeholder will be replaced by Vite during the build process.
    const firebaseConfig = self.__FIREBASE_CONFIG__;
    
    // Initialize Firebase
    if (firebaseConfig && !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    } else {
        console.error("[firebase-messaging-sw.js] Firebase config is missing.");
    }
    
    // Retrieve an instance of Firebase Messaging so that it can handle background messages.
    const messaging = firebase.messaging();
    
    messaging.onBackgroundMessage((payload) => {
        console.log("[firebase-messaging-sw.js] Received background message: ", payload);
    
        // Customize the notification that will be shown to the user
        const notificationTitle = payload.notification?.title || "New PediaQuiz Notification";
        const notificationOptions = {
            body: payload.notification?.body || "You have a new update.",
            icon: "/pediaquiz-logo.svg", // Ensure this logo exists in your public folder
        };
    
        self.registration.showNotification(notificationTitle, notificationOptions);
    });