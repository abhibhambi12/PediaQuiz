import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as functionsV1 from "firebase-functions"; // --- BATCH 4: CRITICAL FIX --- Import the v1 SDK for auth triggers.
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { db } from "./firebaseAdmin";
import { ensureAuthenticated } from "./utils/auth";
import { validateRequest, updateUserProfileSchema, updateEmailSchema, updatePasswordSchema, deleteUserAccountSchema } from "./utils/validation";
import { convertDocTimestamps } from "./utils/serializers";
import { LIGHT_FUNCTION_OPTIONS, LOCATION } from "./config";
import { createAuditLog } from "./utils/audit";
import type { User } from "@pediaquiz/types";

// --- BATCH 4: CRITICAL FIX ---
// The `onusercreated` function is reverted to the v1 Cloud Functions syntax.
// Auth triggers (`functions.auth.user()`) are not yet fully supported in the v2 SDK's top-level exports
// in the same way as `onCall` or `onObjectFinalized`. Using the v1 syntax is the
// official and correct way to handle this, resolving the deployment build error.
// The rest of the functions in the app correctly use the v2 `onCall` syntax.
export const onusercreated = functionsV1.region(LOCATION).auth.user().onCreate(async (user) => {
    const userRef = db.collection("users").doc(user.uid);

    logger.info(`New user created: ${user.uid}, email: ${user.email}. Assigning default 'student' role.`);

    const newUser: User = {
        uid: user.uid,
        email: user.email || null,
        displayName: user.displayName || "PediaQuiz User",
        createdAt: FieldValue.serverTimestamp(),
        lastLogin: FieldValue.serverTimestamp(),
        role: 'student',
        isAdmin: false,
        bookmarkedMcqs: [],
        bookmarkedFlashcards: [],
        xp: 0,
        level: 1,
        currentStreak: 0,
        lastStudiedDate: null,
        theme: 'system',
        badges: [],
        notificationSettings: { studyReminders: true, newContent: true }
    };
    await userRef.set(newUser);
    await admin.auth().setCustomUserClaims(user.uid, { role: 'student' });
});

export const getOrCreateUserProfile = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
        await userRef.update({ lastLogin: FieldValue.serverTimestamp() });
        const userData = userSnap.data();
        return convertDocTimestamps(userData);
    } else {
        logger.warn(`User document not found for user ${userId}. Creating one now as a fallback.`);
        const authUser = await admin.auth().getUser(userId);
        const newUser: User = {
            uid: userId,
            email: authUser.email || null,
            displayName: authUser.displayName || "PediaQuiz User",
            createdAt: FieldValue.serverTimestamp(),
            lastLogin: FieldValue.serverTimestamp(),
            role: 'student',
            isAdmin: false, bookmarkedMcqs: [], bookmarkedFlashcards: [],
            xp: 0, level: 1, currentStreak: 0, lastStudiedDate: null, theme: 'system', badges: [],
            notificationSettings: { studyReminders: true, newContent: true }
        };
        await userRef.set(newUser);
        await admin.auth().setCustomUserClaims(userId, { role: 'student' });
        return convertDocTimestamps(newUser);
    }
});

export const updateUserProfile = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { updates } = validateRequest(updateUserProfileSchema, request.data);

    const allowedUpdates: { [key: string]: any } = {};
    if (updates.displayName !== undefined) allowedUpdates.displayName = updates.displayName;
    if (updates.theme !== undefined) allowedUpdates.theme = updates.theme;
    if (updates.notificationSettings !== undefined) allowedUpdates.notificationSettings = updates.notificationSettings;

    if (Object.keys(allowedUpdates).length === 0) {
        throw new HttpsError("invalid-argument", "No valid fields to update were provided.");
    }
    
    if (updates.isAdmin || updates.role) {
        logger.warn(`User ${userId} attempted to illicitly change security fields (isAdmin, role).`);
        throw new HttpsError("permission-denied", "You cannot change your role or admin status.");
    }

    allowedUpdates.updatedAt = FieldValue.serverTimestamp();

    await db.collection("users").doc(userId).update(allowedUpdates);
    return { success: true };
});

export const updateEmail = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { newEmail } = validateRequest(updateEmailSchema, request.data);

    try {
        const oldEmail = request.auth?.token.email;
        await admin.auth().updateUser(userId, { email: newEmail });
        await db.collection('users').doc(userId).update({ email: newEmail, updatedAt: FieldValue.serverTimestamp() });
        
        await createAuditLog({ userId, message: 'User updated their email.', context: { oldEmail, newEmail } });
        
        return { success: true, message: 'Email updated successfully.' };
    } catch (error: any) {
        logger.error(`Failed to update email for user ${userId}:`, error);
        throw new HttpsError("internal", error.message);
    }
});

export const updatePassword = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { newPassword } = validateRequest(updatePasswordSchema, request.data);

    try {
        await admin.auth().updateUser(userId, { password: newPassword });
        await createAuditLog({ userId, message: 'User updated their password.' });
        return { success: true, message: 'Password updated successfully.' };
    } catch (error: any) {
        logger.error(`Failed to update password for user ${userId}:`, error);
        throw new HttpsError("internal", error.message);
    }
});

export const deleteUserAccount = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    validateRequest(deleteUserAccountSchema, request.data);

    try {
        await db.collection('users').doc(userId).delete();
        await admin.auth().deleteUser(userId);
        
        await createAuditLog({ userId, message: 'User deleted their own account.', context: { email: request.auth?.token.email } });
        
        logger.info(`User account ${userId} and all associated data deleted successfully.`);
        return { success: true, message: 'Account deleted successfully.' };
    } catch (error: any) {
        logger.error(`Failed to delete account for user ${userId}:`, error);
        throw new HttpsError("internal", error.message);
    }
});

export const updateTheme = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const { themeName } = request.data as { themeName: string };
    await db.collection('users').doc(userId).update({ theme: themeName });
    return { success: true };
});

export const getLogs = onCall(LIGHT_FUNCTION_OPTIONS, async (request) => {
    const userId = ensureAuthenticated(request);
    const logsSnap = await db.collection('logs').where('userId', '==', userId).orderBy('timestamp', 'desc').limit(50).get();
    return logsSnap.docs.map(doc => convertDocTimestamps({ id: doc.id, ...doc.data() }));
});