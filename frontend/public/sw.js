// frontend/public/sw.js
/**
 * PediaQuiz Service Worker
 *
 * This service worker handles PWA features including:
 * 1. Precaching of application assets for offline use.
 * 2. Background push notifications via Firebase Cloud Messaging.
 * 3. Background Sync for queueing actions when offline.
 */

// These imports are required by Workbox for its functionality.
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

// Import Firebase messaging scripts for push notifications.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// --- 1. Precaching ---
// The `self.__WB_MANIFEST` placeholder is automatically replaced by `vite-plugin-pwa`
// with a list of all static assets (JS, CSS, images) to cache on install.
precacheAndRoute(self.__WB_MANIFEST || []);

// --- 2. Background Sync ---
// Create a BackgroundSyncPlugin instance to queue failed POST requests.
const bgSyncPlugin = new BackgroundSyncPlugin('pediaquiz-action-queue', {
  maxRetentionTime: 48 * 60, // Retry for up to 48 hours
});

// Register a route to handle API calls to our backend functions.
// When offline, failed POST requests will be added to the queue by `bgSyncPlugin`.
registerRoute(
  ({ url }) => url.href.includes('cloudfunctions.net'),
  new StaleWhileRevalidate({
    plugins: [bgSyncPlugin],
  }),
  'POST' // Only apply this to POST requests (mutations like submit quiz, update cram sheet)
);


// --- 3. Caching Strategies ---
// Cache Google Fonts with a cache-first strategy for performance.
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 365 }), // 1 year
    ],
  })
);

// --- 4. Firebase Cloud Messaging ---
// The `__FIREBASE_CONFIG__` placeholder will be replaced by Vite during the build process.
const firebaseConfig = self.__FIREBASE_CONFIG__;

if (firebaseConfig && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
        console.log("[sw.js] Received background message: ", payload);

        const notificationTitle = payload.notification?.title || "PediaQuiz";
        const notificationOptions = {
            body: payload.notification?.body || "You have a new update.",
            icon: "/pwa-192x192.png",
        };

        self.registration.showNotification(notificationTitle, notificationOptions);
    });
}