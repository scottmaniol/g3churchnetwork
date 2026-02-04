// Script to clear all payment data for a specific church
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
db.settings({ databaseId: 'g3network' });

// Find church by email (from screenshot)
const CHURCH_EMAIL = 'saniol+rockford@gmail.com';

async function clearChurchPaymentData() {
  console.log(`🔍 Looking for church with email: ${CHURCH_EMAIL}\n`);
  
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
    
    console.log(`✓ Found: ${churchData.churchName}`);
    console.log(`\n📋 Current Payment Data:`);
    console.log(`   Payment Amount: ${churchData.paymentAmount || 'N/A'}`);
    console.log(`   Payment Frequency: ${churchData.paymentFrequency || 'N/A'}`);
    console.log(`   Stripe Customer ID: ${churchData.stripeCustomerId || 'N/A'}`);
    console.log(`   Stripe Subscription ID: ${churchData.stripeSubscriptionId || 'N/A'}`);
    console.log(`   Stripe Payment Method ID: ${churchData.stripePaymentMethodId || 'N/A'}`);
    console.log(`   Last Payment Date: ${churchData.lastPaymentDate || 'N/A'}`);
    console.log(`   Next Due Date: ${churchData.nextDueDate || 'N/A'}`);
    
    console.log(`\n🗑️  Clearing ALL payment-related fields...`);
    
    await churchDoc.ref.update({
      stripeCustomerId: admin.firestore.FieldValue.delete(),
      stripeSubscriptionId: admin.firestore.FieldValue.delete(),
      stripePaymentMethodId: admin.firestore.FieldValue.delete(),
      paymentAmount: admin.firestore.FieldValue.delete(),
      paymentFrequency: admin.firestore.FieldValue.delete(),
      lastPaymentDate: admin.firestore.FieldValue.delete(),
      nextDueDate: admin.firestore.FieldValue.delete()
    });
    
    console.log(`\n✅ Successfully cleared all payment data for ${churchData.churchName}`);
    console.log(`\n💡 The church dashboard should now show the "Pay Dues" form after refresh.`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

clearChurchPaymentData();
