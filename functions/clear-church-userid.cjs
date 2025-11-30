// One-time script to clear userId from Pray's Mill Baptist Church
// Run with: node clear-church-userid.js

const admin = require('firebase-admin');

// Initialize Firebase Admin (uses default credentials from environment)
admin.initializeApp();

// IMPORTANT: Connect to the named database 'g3network', not the default database
const db = admin.firestore('g3network');

async function clearChurchUserId() {
  try {
    console.log('Searching for churches with "Pray" or "Mill" in the name...');
    
    // Get all churches (note: collection is named 'applications' not 'churches')
    const snapshot = await db.collection('applications').get();
    
    console.log(`\nFound ${snapshot.size} total churches in database`);
    console.log('\nSearching for matches...\n');
    
    let found = false;
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.churchName && (data.churchName.toLowerCase().includes('pray') || data.churchName.toLowerCase().includes('mill'))) {
        console.log(`Match found: "${data.churchName}"`);
        console.log(`  ID: ${doc.id}`);
        console.log(`  userId: ${data.userId || 'none'}`);
        console.log(`  Email: ${data.applicantEmail || 'none'}`);
        console.log('');
        found = true;
      }
    });
    
    if (!found) {
      console.log('No churches found with "Pray" or "Mill" in the name.');
      console.log('\nAll church names in database:');
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`  - ${data.churchName || 'Unnamed'} (ID: ${doc.id})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Exit
    process.exit(0);
  }
}

clearChurchUserId();
