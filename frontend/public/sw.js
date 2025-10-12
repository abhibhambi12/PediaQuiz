import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

// This is a placeholder for the manifest that VitePWA will inject.
// The existing precaching functionality is preserved.
precacheAndRoute(self.__WB_MANIFEST);

// Existing runtime caching for API calls is preserved.
registerRoute(
  ({ url }) => url.origin === 'https://us-central1-pediaquizapp.cloudfunctions.net',
  new NetworkFirst({
    cacheName: 'api-cache',
  })
);

// This ensures the new service worker activates immediately.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// This ensures that the page is controlled by the service worker on first load.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// --- BATCH 4: PWA ENHANCEMENTS ---
// New event listener for incoming push notifications.
self.addEventListener('push', (event) => {
  const data = event.data.json();
  const title = data.title || 'PediaQuiz';
  const options = {
    body: data.body || 'You have a new notification.',
    icon: '/pediaquiz-logo.svg', // Path to your app icon
    badge: '/pediaquiz-logo.svg', // Path to a badge icon
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// New event listener for clicking on a notification.
// This example focuses the browser tab or opens a new one to the app's root URL.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});

// New event listener for future background sync tasks.
// This provides the foundation for robust offline functionality.
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-quiz-results') {
        console.log('Service Worker: Background sync for quiz results triggered.');
        // In a future batch, logic to sync from IndexedDB to Firestore will be added here.
        // event.waitUntil(syncQuizResults());
    }
});