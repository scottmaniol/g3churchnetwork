// Check Bell Tower Bible church data
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
db.settings({ databaseId: 'g3network' });

const CHURCH_EMAIL = 'ljlafollette@yahoo.com';

async function checkChurchData() {
  console.log(`🔍 Checking Bell Tower Bible church data...\n`);
  
  try {
    const snapshot = await db.collection('applications')
      .where('applicantEmail', '==', CHURCH_EMAIL)
      .get();
    
    if (snapshot.empty) {
      console.log('❌ Church not found');
      return;
    }

    const churchDoc = snapshot.docs[0];
    const data = churchDoc.data();
    
    console.log(`✓ Found: ${data.churchName}`);
    console.log(`\n📋 Payment Data:`);
    console.log(`   Stripe Customer ID: ${data.stripeCustomerId || 'N/A'}`);
    console.log(`   Stripe Subscription ID: ${data.stripeSubscriptionId || 'N/A'}`);
    console.log(`   Payment Amount: $${data.paymentAmount || 'N/A'}`);
    console.log(`   Payment Frequency: ${data.paymentFrequency || 'N/A'}`);
    console.log(`   Last Payment Date: ${data.lastPaymentDate || 'N/A'}`);
    console.log(`   Next Due Date: ${data.nextDueDate || 'N/A'}`);
    console.log(`   Status: ${data.status}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

checkChurchData();
