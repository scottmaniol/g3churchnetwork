// Restore payment tracking data for First Baptist Church
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
db.settings({ databaseId: 'g3network' });

const CHURCH_EMAIL = 'saniol+rockford@gmail.com';

async function restorePaymentData() {
  console.log(`🔄 Restoring payment tracking data for: ${CHURCH_EMAIL}\n`);
  
  try {
    const snapshot = await db.collection('applications')
      .where('applicantEmail', '==', CHURCH_EMAIL)
      .get();
    
    if (snapshot.empty) {
      console.log('❌ Church not found');
      return;
    }

    const churchDoc = snapshot.docs[0];
    
    console.log(`✓ Found: First Baptist Church`);
    console.log(`\n📝 Restoring payment tracking data...`);
    
    await churchDoc.ref.update({
      paymentAmount: 500,
      paymentFrequency: 'yearly',
      lastPaymentDate: '2025-11-29T16:30:48.876Z',
      nextDueDate: '2030-12-09T00:00:00.000Z'
    });
    
    console.log(`\n✅ Payment tracking data restored:`);
    console.log(`   Payment Amount: $500`);
    console.log(`   Payment Frequency: yearly`);
    console.log(`   Last Payment Date: 2025-11-29`);
    console.log(`   Next Due Date: 2030-12-09`);
    console.log(`\n💡 Note: Stripe IDs remain cleared so "Pay Dues" button will appear.`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

restorePaymentData();
