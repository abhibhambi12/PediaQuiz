const admin = require('firebase-admin');

admin.initializeApp();

const targetEmail = 'abhibhambi01@gmail.com'; 

async function setAdminClaim() {
  try {
    const user = await admin.auth().getUserByEmail(targetEmail);
    
    await admin.auth().setCustomUserClaims(user.uid, { isAdmin: true });
    console.log(`Successfully set custom claim 'isAdmin: true' for user: ${targetEmail} (UID: ${user.uid})`);

    await admin.firestore().collection('users').doc(user.uid).update({ isAdmin: true });
    console.log(`Successfully updated Firestore document 'isAdmin: true' for user: ${targetEmail}`);

  } catch (error) {
    console.error('Error setting admin claim:', error);
    process.exit(1);
  }
}

setAdminClaim();