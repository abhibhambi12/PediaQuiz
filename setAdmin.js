// setAdmin.js
const admin = require('firebase-admin');
const serviceAccount = require('./pediaquizapp-firebase-adminsdk.json'); // Adjust path if needed

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const targetEmail = 'abhibhambi01@gmail.com'; // <--- !!! REPLACE THIS WITH YOUR EMAIL !!!

async function setAdminClaim() {
  try {
    const user = await admin.auth().getUserByEmail(targetEmail);
    
    // Set the custom claim for the Firebase Authentication user
    await admin.auth().setCustomUserClaims(user.uid, { isAdmin: true });
    console.log(`Successfully set custom claim 'isAdmin: true' for user: ${targetEmail} (UID: ${user.uid})`);

    // Also update the Firestore user document for consistency with frontend
    await admin.firestore().collection('users').doc(user.uid).update({ isAdmin: true });
    console.log(`Successfully updated Firestore document 'isAdmin: true' for user: ${targetEmail}`);

  } catch (error) {
    console.error('Error setting admin claim:', error);
  } finally {
    process.exit(); // Exit the script
  }
}

setAdminClaim();