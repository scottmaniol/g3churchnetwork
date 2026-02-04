/**
 * Clear Test Mode Stripe Customer IDs
 * Run with: firebase firestore:delete --all-collections --yes
 * 
 * Or use this script with: node clear-test-stripe.js
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, deleteField } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAp3zqVxOPbKo8sQa8h_N7bWHcW0aJmJrQ",
  authDomain: "g3-church-network.firebaseapp.com",
  projectId: "g3-church-network",
  storageBucket: "g3-church-network.firebasestorage.app",
  messagingSenderId: "437486829084",
  appId: "1:437486829084:web:b7b6a3fcf1c4e8c5e2f8a0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'g3network');

async function clearTestStripeData() {
  console.log('🔍 Scanning for churches with test mode Stripe data...\n');

  try {
    const querySnapshot = await getDocs(collection(db, 'applications'));
    
    let testModeCount = 0;
    let updatedCount = 0;
    const updates = [];

    querySnapshot.forEach(doc => {
      const data = doc.data();
      const customerId = data.stripeCustomerId || '';
      
      // Check if this is a test mode customer
      const isTestMode = customerId.startsWith('cus_') && !customerId.startsWith('cus_live_');
      
      if (isTestMode) {
        console.log(`📋 ${data.churchName || doc.id}`);
        console.log(`   Old Customer ID: ${customerId}`);
        console.log(`   Payment Method ID: ${data.stripePaymentMethodId || 'none'}`);
        
        testModeCount++;
        
        // Queue update to clear test Stripe data
        updates.push(
          updateDoc(doc.ref, {
            stripeCustomerId: deleteField(),
            stripePaymentMethodId: deleteField(),
            stripeSubscriptionId: deleteField()
          }).then(() => {
            console.log(`   ✅ Cleared test data for ${data.churchName}\n`);
            updatedCount++;
          })
        );
      }
    });

    if (updates.length > 0) {
      console.log(`\n📝 Updating ${updates.length} churches...\n`);
      await Promise.all(updates);
      console.log(`✅ Successfully cleared test Stripe data from ${updatedCount} churches!\n`);
      console.log(`💡 These churches can now set up their payment methods fresh with live mode.\n`);
    } else {
      console.log('✨ No test mode Stripe data found. All clear!\n');
    }

    console.log(`📊 Summary:`);
    console.log(`   Total churches scanned: ${querySnapshot.size}`);
    console.log(`   Churches with test data: ${testModeCount}`);
    console.log(`   Churches updated: ${updatedCount}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

clearTestStripeData();
