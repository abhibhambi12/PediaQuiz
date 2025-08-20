const admin = require('firebase-admin');

// --- FIX: SECURE INITIALIZATION ---
// The SDK will now automatically find the credentials from the
// GOOGLE_APPLICATION_CREDENTIALS environment variable.
// No require() statement or hardcoded file path is needed.
admin.initializeApp();

// Ensure this is the correct email you want to make an admin
const targetEmail = 'abhibhambi01@gmail.com';

async function setAdminClaim() {
  try {
    const user = await admin.auth().getUserByEmail(targetEmail);

    // Set the custom claim for the Firebase Authentication user
    await admin.auth().setCustomUserClaims(user.uid, { isAdmin: true });
    console.log(`Successfully set custom claim 'isAdmin: true' for user: ${targetEmail} (UID: ${user.uid})`);

    // Also update the Firestore user document for consistency
    // This is important because security rules often check `resource.data.isAdmin`
    // which comes from the Firestore document, not just the token.
    await admin.firestore().collection('users').doc(user.uid).update({ isAdmin: true });
    console.log(`Successfully updated Firestore document 'isAdmin: true' for user: ${targetEmail}`);

  } catch (error) {
    console.error('Error setting admin claim:', error);
    process.exit(1); // Exit with an error code for scripting
  }
}

setAdminClaim();