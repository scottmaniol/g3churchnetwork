// Script to clear test Stripe data from church records
const admin = require('firebase-admin');

// Use default credentials (works when running from Firebase environment)
admin.initializeApp();

const db = admin.firestore();
db.settings({ databaseId: 'g3network' });

async function clearTestStripeData() {
  console.log('🔍 Scanning for churches with test mode Stripe data...\n');
  
  try {
    const snapshot = await db.collection('applications').get();
    
    let testModeCount = 0;
    let updatedCount = 0;
    const batch = db.batch();
    const churchesToUpdate = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const customerId = data.stripeCustomerId || '';
      
      // Check if this is a test mode customer (starts with cus_ but not cus_live_)
      const isTestMode = customerId.startsWith('cus_') && !customerId.startsWith('cus_live_');
      
      if (isTestMode) {
        console.log(`✓ Found test data for: ${data.churchName}`);
        console.log(`  Customer ID: ${customerId}`);
        testModeCount++;
        
        churchesToUpdate.push({
          id: doc.id,
          churchName: data.churchName,
          customerId: customerId
        });
        
        // Clear the test Stripe data
        batch.update(doc.ref, {
          stripeCustomerId: admin.firestore.FieldValue.delete(),
          stripePaymentMethodId: admin.firestore.FieldValue.delete(),
          stripeSubscriptionId: admin.firestore.FieldValue.delete()
        });
        
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      console.log(`\n📝 Updating ${updatedCount} church(es)...`);
      await batch.commit();
      console.log(`\n✅ Successfully cleared test Stripe data from ${updatedCount} churches:`);
      churchesToUpdate.forEach(church => {
        console.log(`   - ${church.churchName} (${church.id})`);
      });
    } else {
      console.log('\n✅ No test mode Stripe data found.');
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total churches scanned: ${snapshot.size}`);
    console.log(`   Test mode data found: ${testModeCount}`);
    console.log(`   Churches updated: ${updatedCount}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

clearTestStripeData();
