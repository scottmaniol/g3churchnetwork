// Update Bell Tower Bible with subscription dates from Stripe
const admin = require('firebase-admin');
const Stripe = require('stripe');
require('dotenv').config();

admin.initializeApp();
const db = admin.firestore();
db.settings({ databaseId: 'g3network' });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const CHURCH_EMAIL = 'ljlafollette@yahoo.com';

async function updateDates() {
  console.log(`🔄 Updating Bell Tower Bible dates from Stripe...\n`);
  
  try {
    // 1. Get church from Firestore
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
    console.log(`  Stripe Customer ID: ${churchData.stripeCustomerId}`);
    
    if (!churchData.stripeCustomerId) {
      console.log('❌ No Stripe customer ID found');
      return;
    }

    // 2. Get subscriptions for this customer from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: churchData.stripeCustomerId,
      limit: 1
    });

    if (subscriptions.data.length === 0) {
      console.log('❌ No subscriptions found for this customer');
      return;
    }

    const subscription = subscriptions.data[0];
    console.log(`\n📊 Subscription found:`);
    console.log(`   ID: ${subscription.id}`);
    console.log(`   Status: ${subscription.status}`);
    console.log(`   Current Period End (raw): ${subscription.current_period_end}`);
    console.log(`   Created (raw): ${subscription.created}`);
    console.log(`\n📦 Full subscription object:`);
    console.log(JSON.stringify(subscription, null, 2));

    // 3. Update Firestore with the subscription data
    const lastPaymentDate = subscription.created 
      ? new Date(subscription.created * 1000).toISOString()
      : new Date().toISOString();
    
    // Get current_period_end from subscription item
    const periodEnd = subscription.items?.data?.[0]?.current_period_end;
    const nextDueDate = periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : null;
    
    const amount = subscription.items?.data?.[0]?.price?.unit_amount 
      ? subscription.items.data[0].price.unit_amount / 100
      : 500;

    console.log(`\n📅 Calculated dates:`);
    console.log(`   Last Payment: ${lastPaymentDate}`);
    console.log(`   Next Due: ${nextDueDate}`);
    console.log(`   Amount: $${amount}`);

    if (!nextDueDate) {
      console.log('❌ Could not determine next due date from subscription');
      return;
    }

    await churchDoc.ref.update({
      stripeSubscriptionId: subscription.id,
      lastPaymentDate,
      nextDueDate,
      paymentAmount: amount,
      paymentFrequency: 'yearly',
      updatedAt: new Date().toISOString()
    });
    
    console.log(`\n✅ Successfully updated church record:`);
    console.log(`   Subscription ID: ${subscription.id}`);
    console.log(`   Last Payment: ${lastPaymentDate}`);
    console.log(`   Next Due: ${nextDueDate}`);
    console.log(`   Amount: $${amount}/year`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

updateDates();
