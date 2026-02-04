# Stripe Webhook Bug Analysis - Jessup Baptist Church Issue

## Problem
Churches that complete payment through Stripe Checkout are not automatically moved from `PROVISIONAL_APPROVED` to `APPROVED` status, even though payment succeeds.

## Root Cause
The Stripe webhook handler (`handleStripeWebhook` in `functions/src/index.ts`) is missing critical logic to update the church status when processing `checkout.session.completed` events.

### Current Webhook Handler (Lines ~1841-1867)

```typescript
case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session;
  const churchId = session.metadata?.churchId;
  const subscriptionId = session.subscription as string;
  
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const lastPaymentDate = toSafeISOString(new Date());
    const nextDueDate = toSafeISOString(new Date(subscription.current_period_end * 1000));

    // ❌ BUG: Only updates payment data, NOT status
    await db.collection('applications').doc(churchId).update({
      stripeSubscriptionId: subscriptionId,
      lastPaymentDate,
      nextDueDate,
      paymentAmount: paymentAmount ? parseFloat(paymentAmount) : 500,
      paymentFrequency: 'yearly',
      updatedAt: toSafeISOString(new Date())
    });
  }
  break;
}
```

### What's Missing
The webhook does NOT:
1. ✗ Update `status` from `PROVISIONAL_APPROVED` to `APPROVED`
2. ✗ Clear `isManuallyDelinquent` flag (if present)
3. ✗ Send the "application_fully_approved" welcome email
4. ✗ Store the payment method ID for future use

### Comparison with Manual Payment Flow
The `processChurchPayment` function (which works correctly when churches pay through the portal form) DOES update the status:

```typescript
// Line ~1564
await docRef.update({
  status: 'APPROVED',  // ✓ Updates status
  isManuallyDelinquent: false,  // ✓ Clears delinquency
  paymentAmount,
  paymentFrequency,
  stripePaymentMethodId: paymentMethodId,
  stripeSubscriptionId: subscriptionId,
  lastPaymentDate,
  nextDueDate,
  updatedAt: toSafeISOString(new Date())
});
```

## Impact
**ANY church that pays through Stripe Checkout** (the redirect payment flow):
- ❌ Stays in `PROVISIONAL_APPROVED` status forever
- ❌ Doesn't receive the welcome email
- ❌ Doesn't appear on the public map
- ❌ Doesn't get full portal access

This affects ALL provisional churches who pay via Stripe Checkout, not just Jessup Baptist.

## Fix Required
The webhook handler needs to be updated to:

### 1. Update Church Status on Successful Payment
```typescript
case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session;
  const churchId = session.metadata?.churchId;
  
  if (!churchId) {
    console.error('No churchId in session metadata');
    break;
  }

  // Get current church data to check status
  const churchDoc = await db.collection('applications').doc(churchId).get();
  const churchData = churchDoc.data();
  
  if (!churchData) {
    console.error(`Church ${churchId} not found`);
    break;
  }

  const subscriptionId = session.subscription as string;
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const lastPaymentDate = toSafeISOString(new Date());
    const nextDueDate = toSafeISOString(new Date(subscription.current_period_end * 1000));

    // ✅ FIX: Update status to APPROVED if currently PROVISIONAL or DELINQUENT
    const updateData: any = {
      stripeSubscriptionId: subscriptionId,
      lastPaymentDate,
      nextDueDate,
      paymentAmount: session.metadata?.paymentAmount ? parseFloat(session.metadata.paymentAmount) : 500,
      paymentFrequency: 'yearly',
      updatedAt: toSafeISOString(new Date())
    };

    // If church is provisionally approved or delinquent, activate them
    if (churchData.status === 'PROVISIONAL_APPROVED' || churchData.status === 'DELINQUENT') {
      updateData.status = 'APPROVED';
      updateData.isManuallyDelinquent = false;
      console.log(`Activating church ${churchId} after successful payment`);
    }

    await db.collection('applications').doc(churchId).update(updateData);

    // ✅ FIX: Send welcome email if transitioning from provisional
    if (churchData.status === 'PROVISIONAL_APPROVED') {
      try {
        const template = await getTemplate('application_fully_approved');
        const subject = replaceVariables(template.subject, churchData);
        const body = replaceVariables(template.body, churchData);
        await sendEmailBatch([churchData.applicantEmail], subject, body, SYSTEM_SENDER);
        console.log(`Sent welcome email to ${churchData.applicantEmail}`);
      } catch (emailError) {
        console.error(`Error sending welcome email to ${churchData.applicantEmail}:`, emailError);
        // Don't fail the whole webhook if email fails
      }
    }
  }
  break;
}
```

### 2. Also Handle invoice.payment_succeeded for Renewals
When a subscription renews, we should also check if church was delinquent:

```typescript
case 'invoice.payment_succeeded': {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = invoice.subscription;
  
  if (subscriptionId) {
    const snapshot = await db.collection('applications')
      .where('stripeSubscriptionId', '==', subscriptionId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const churchDoc = snapshot.docs[0];
      const churchData = churchDoc.data();
      const lastPaymentDate = invoice.status_transitions?.paid_at 
        ? toSafeISOString(new Date(invoice.status_transitions.paid_at * 1000)) 
        : toSafeISOString(new Date());

      const updateData: any = {
        lastPaymentDate,
        updatedAt: toSafeISOString(new Date())
      };

      // ✅ If church was delinquent, reactivate them
      if (churchData.status === 'DELINQUENT') {
        updateData.status = 'APPROVED';
        updateData.isManuallyDelinquent = false;
        console.log(`Reactivating delinquent church ${churchDoc.id} after payment`);
      }

      await churchDoc.ref.update(updateData);
    }
  }
  break;
}
```

## Testing Required After Fix

1. **Create a test church**
2. **Provisionally approve it** (status = PROVISIONAL_APPROVED)
3. **Complete payment through Stripe Checkout** (use test mode)
4. **Verify webhook processes correctly**:
   - Status should change to APPROVED
   - Should receive welcome email
   - Should appear on map (if coordinates exist)
   - Payment data should be recorded

## Prevention
- Add comprehensive webhook logging
- Add webhook monitoring/alerting
- Consider webhook retry logic for failed status updates
- Add unit tests for webhook handlers

## Immediate Action for Jessup Baptist
Since the webhook didn't work:
1. Manually approve them through Admin Dashboard (already documented)
2. Deploy the webhook fix ASAP
3. Check for other churches stuck in PROVISIONAL_APPROVED with valid Stripe data
