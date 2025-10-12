// set-admin-role.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// --- CONFIGURATION ---
// 1. UPDATE this path to point to your service account key file.
const serviceAccount = require('./serviceAccountKey.json');

// 2. PASTE a user UID here to make them an admin.
const USER_ID_TO_MAKE_ADMIN = "7nycjkm2f0Omnni1Ut2QNxYBWyH3";
// --- END OF CONFIGURATION ---

initializeApp({
  credential: cert(serviceAccount)
});

async function setAdminRole() {
  if (!USER_ID_TO_MAKE_ADMIN) {
    console.error("Error: Please specify the USER_ID_TO_MAKE_ADMIN in the script.");
    return;
  }

  console.log(`Attempting to set 'admin' role for user: ${USER_ID_TO_MAKE_ADMIN}`);

  try {
    // Set the custom claim
    await getAuth().setCustomUserClaims(USER_ID_TO_MAKE_ADMIN, { role: 'admin' });

    // Verify the claim was set
    const userRecord = await getAuth().getUser(USER_ID_TO_MAKE_ADMIN);
    console.log("Verification successful. Current claims:", userRecord.customClaims);
    
    console.log(`\n✅ Success! User ${USER_ID_TO_MAKE_ADMIN} has been assigned the 'admin' role.`);
    console.log("IMPORTANT: You must now SIGN OUT and SIGN BACK IN to the PediaQuiz app for the change to take effect.");

  } catch (error) {
    console.error("\n❌ Error setting custom claim:", error);
  }
}

setAdminRole();