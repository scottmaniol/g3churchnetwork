// Verify the church data was actually cleared
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
db.settings({ databaseId: 'g3network' });

const CHURCH_EMAIL = 'saniol+rockford@gmail.com';

async function verifyChurchData() {
  console.log(`🔍 Verifying data for: ${CHURCH_EMAIL}\n`);
  
  try {
    const snapshot = await db.collection('applications')
      .where('applicantEmail', '==', CHURCH_EMAIL)
      .get();
    
    if (snapshot.empty) {
      console.log('❌ Church not found');
      return;
    }

    const churchDoc = snapshot.docs[0];
    const churchData = churchDoc.data();
    
    console.log(`✓ Church: ${churchData.churchName}`);
    console.log(`\n📋 ALL Fields in Database:`);
    console.log(JSON.stringify(churchData, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

verifyChurchData();
