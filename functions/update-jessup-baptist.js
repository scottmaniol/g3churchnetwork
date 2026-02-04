// Update Jessup Baptist Church status from Provisional to Active
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
db.settings({ databaseId: 'g3network' });

const CHURCH_EMAIL = 'jamie.danmartin3@gmail.com';

async function updateJessupBaptist() {
  console.log(`🔍 Finding Jessup Baptist Church: ${CHURCH_EMAIL}\n`);
  
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
    
    console.log(`✓ Found Church: ${churchData.churchName}`);
    console.log(`   Current Status: ${churchData.status}`);
    console.log(`   Has Coordinates: ${churchData.coordinates ? 'Yes' : 'No'}`);
    console.log(`   Stripe Customer: ${churchData.stripeCustomerId || 'None'}`);
    console.log(`   Last Payment: ${churchData.lastPaymentDate || 'None'}`);
    
    // Update to APPROVED status
    const updates = {
      status: 'APPROVED',
      lastPaymentDate: churchData.lastPaymentDate || new Date().toISOString()
    };
    
    // If no coordinates, try to add them (Jessup, MD is approximately this location)
    if (!churchData.coordinates && churchData.churchAddress) {
      // You may want to geocode the actual address, but for now we'll flag it
      console.log('⚠️  Warning: No coordinates set - church may not appear on map');
      console.log('   Church address:', JSON.stringify(churchData.churchAddress));
    }
    
    console.log('\n📝 Updating church...');
    await churchDoc.ref.update(updates);
    
    console.log('✅ Successfully updated Jessup Baptist Church to APPROVED status');
    
    // Verify the update
    const updatedDoc = await churchDoc.ref.get();
    const updatedData = updatedDoc.data();
    console.log(`\n✓ Verified Status: ${updatedData.status}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

updateJessupBaptist();
