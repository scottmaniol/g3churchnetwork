/**
 * Clear Test Mode Stripe Customer IDs from Church Records
 * 
 * This script removes test mode Stripe customer IDs and payment method IDs
 * from all church applications, allowing them to set up fresh with live mode.
 * 
 * Run with: node clear-test-stripe-data.cjs
 */

const admin = require('firebase-admin');

// Use application default credentials
admin.initializeApp({
  projectId: 'g3-church-network',
  databaseURL: 'https://g3-church-network.firebaseio.com'
});

const DATABASE_ID = 'g3network';
const db = admin.firestore(DATABASE_ID);

async function clearTestStripeData() {
  console.log('🔍 Scanning for churches with test mode Stripe data...\n');

  try {
    const snapshot = await db.collection('applications').get();
    
    let testModeCount = 0;
    let updatedCount = 0;
    const batch = db.batch();

    snapshot.forEach(doc => {
      const data = doc.data();
      const customerId = data.stripeCustomerId || '';
      
      // Check if this is a test mode customer (starts with cus_test_ or has test in production data)
      const isTestMode = customerId.startsWith('cus_') && !customerId.includes('_live_');
      
      if (isTestMode || customerId.startsWith('cus_test_')) {
        console.log(`📋 ${data.churchName || doc.id}`);
        console.log(`   Old Customer ID: ${customerId}`);
        console.log(`   Payment Method ID: ${data.stripePaymentMethodId || 'none'}`);
        
        testModeCount++;
        
        // Clear the test Stripe data
        batch.update(doc.ref, {
          stripeCustomerId: admin.firestore.FieldValue.delete(),
          stripePaymentMethodId: admin.firestore.FieldValue.delete(),
          stripeSubscriptionId: admin.firestore.FieldValue.delete()
        });
        
        updatedCount++;
        console.log(`   ✅ Queued for cleanup\n`);
      }
    });

    if (updatedCount > 0) {
      console.log(`\n📝 Committing ${updatedCount} updates...\n`);
      await batch.commit();
      console.log(`✅ Successfully cleared test Stripe data from ${updatedCount} churches!\n`);
      console.log(`💡 These churches can now set up their payment methods fresh with live mode.\n`);
    } else {
      console.log('✨ No test mode Stripe data found. All clear!\n');
    }

    console.log(`📊 Summary:`);
    console.log(`   Total churches scanned: ${snapshot.size}`);
    console.log(`   Churches with test data: ${testModeCount}`);
    console.log(`   Churches updated: ${updatedCount}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

clearTestStripeData();
