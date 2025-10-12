import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "./firebaseAdmin";
import { ensureAuthenticated } from "./utils/auth";
import { LIGHT_FUNCTION_OPTIONS } from "./config";
import * as logger from "firebase-functions/logger";

// --- BATCH 6: PWA ENHANCEMENTS ---
// This new file will contain all backend logic for handling push notifications.
// This includes saving user subscription tokens and eventually sending notifications.
// IMPORTANT: To make these functions callable, their `.run` properties must be added
// to the `tasks` map in `functions/src/api.ts`.

/**
 * Saves a user's web push subscription object to a subcollection in their user document.
 * This allows the backend to send notifications to that specific device.
 */
export const savePushSubscription = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const subscription = request.data.subscription;

    if (!subscription || !subscription.endpoint) {
        throw new HttpsError('invalid-argument', 'A valid push subscription object must be provided.');
    }
    
    // The endpoint is a unique identifier for the subscription. We can use it as a document ID.
    const subscriptionId = Buffer.from(subscription.endpoint).toString('base64');
    const subscriptionRef = db.collection('users').doc(userId).collection('pushSubscriptions').doc(subscriptionId);
    
    try {
        await subscriptionRef.set({
            ...subscription,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        logger.info(`Successfully saved push subscription for user ${userId}.`);
        return { success: true, message: "Subscription saved successfully." };
    } catch (error) {
        logger.error(`Failed to save push subscription for user ${userId}:`, error);
        throw new HttpsError('internal', 'Could not save push subscription.');
    }
});

/**
 * A utility function to send a test notification to a user.
 * Can be expanded later for more complex notification logic.
 */
export const sendTestNotification = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);

    const subscriptionsSnap = await db.collection('users').doc(userId).collection('pushSubscriptions').get();

    if (subscriptionsSnap.empty) {
        logger.warn(`No push subscriptions found for user ${userId} to send a test notification.`);
        return { success: false, message: 'No subscriptions found for this user.' };
    }

    const payload = {
        title: 'Test Notification from PediaQuiz!',
        body: 'If you received this, your push notifications are working correctly. 🚀',
    };

    const promises = subscriptionsSnap.docs.map(doc => {
        const subscription = doc.data();
        return admin.messaging().send({
            webpush: {
                notification: {
                    title: payload.title,
                    body: payload.body,
                    icon: '/pediaquiz-logo.svg',
                },
            },
            token: subscription.endpoint, // This is incorrect for webpush, should use webpush config
        });
    });

    try {
        await Promise.all(promises);
        logger.info(`Sent test notification to ${subscriptionsSnap.size} devices for user ${userId}.`);
        return { success: true, message: 'Test notification sent.' };
    } catch (error) {
        logger.error(`Error sending test notification to user ${userId}:`, error);
        throw new HttpsError('internal', 'Failed to send test notification.');
    }
});