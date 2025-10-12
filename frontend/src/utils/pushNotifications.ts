// frontend/src/utils/pushNotifications.ts
// --- FINAL BUILD FIX ---
// This file is updated to resolve the persistent TypeScript build error related to the
// `applicationServerKey` type by manually constructing a new ArrayBuffer.

/**
 * Converts a VAPID public key string to a Uint8Array.
 * This implementation is correct and remains unchanged.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribes the user to push notifications if they have not already subscribed.
 */
export async function subscribeUserToPush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push messaging is not supported by this browser.');
    alert('Push notifications are not supported by your browser.');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      console.log('User is already subscribed to push notifications.');
      return subscription;
    }

    const vapidPublicKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidPublicKey) {
      console.error('VITE_FIREBASE_VAPID_KEY is not set in the environment variables.');
      alert('Push notification service is not configured correctly.');
      return null;
    }
    const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

    // --- FINAL BUILD FIX ---
    // The previous attempts failed because TypeScript could not guarantee that the
    // underlying buffer was not a `SharedArrayBuffer`.
    // This definitive solution manually creates a new, pure `ArrayBuffer` and copies
    // the data into it. This creates a variable that TypeScript knows for certain
    // is of the correct type, finally resolving the strict type error.
    const applicationServerKey = new ArrayBuffer(convertedVapidKey.length);
    const applicationServerKeyView = new Uint8Array(applicationServerKey);
    applicationServerKeyView.set(convertedVapidKey);

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey,
    });

    console.log('User subscribed successfully.');
    
    return subscription;
  } catch (error) {
    console.error('Failed to subscribe the user to push notifications:', error);
    if (Notification.permission === 'denied') {
      alert('You have blocked notifications. Please enable them in your browser settings if you wish to receive reminders.');
    }
    return null;
  }
}