// Script to check what Stripe data exists
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
db.settings({ databaseId: 'g3network' });

async function checkStripeData() {
  console.log('🔍 Checking Stripe data in church records...\n');
  
  try {
    const snapshot = await db.collection('applications').get();
    
    let withStripeData = 0;
    const churchesWithStripe = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      
      if (data.stripeCustomerId || data.stripeSubscriptionId || data.stripePaymentMethodId) {
        withStripeData++;
        churchesWithStripe.push({
          churchName: data.churchName,
          customerId: data.stripeCustomerId || 'N/A',
          subscriptionId: data.stripeSubscriptionId || 'N/A',
          paymentMethodId: data.stripePaymentMethodId || 'N/A',
          paymentFrequency: data.paymentFrequency || 'N/A',
          paymentAmount: data.paymentAmount || 'N/A'
        });
      }
    });

    console.log(`📊 Found ${withStripeData} churches with Stripe data:\n`);
    
    churchesWithStripe.forEach((church, index) => {
      console.log(`${index + 1}. ${church.churchName}`);
      console.log(`   Customer ID: ${church.customerId}`);
      console.log(`   Subscription ID: ${church.subscriptionId}`);
      console.log(`   Payment Method ID: ${church.paymentMethodId}`);
      console.log(`   Payment Frequency: ${church.paymentFrequency}`);
      console.log(`   Payment Amount: $${church.paymentAmount}`);
      console.log('');
    });
    
    console.log(`📊 Summary:`);
    console.log(`   Total churches: ${snapshot.size}`);
    console.log(`   Churches with Stripe data: ${withStripeData}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

checkStripeData();
