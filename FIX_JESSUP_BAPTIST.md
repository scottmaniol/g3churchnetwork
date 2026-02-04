# Fix Jessup Baptist Church Status

## Issue
Jessup Baptist Church (jamie.danmartin3@gmail.com) is listed as a Provisional Application but has paid their dues through Stripe. They should be moved to Active status and appear on the map.

## Solution - Via Admin Dashboard

### Option 1: Manual Approval (Recommended)
1. Go to https://network.g3min.org
2. Navigate to the Admin Dashboard
3. Click on "Member Management" → "Provisional" tab
4. Find "Jessup Baptist Church (jamie.danmartin3@gmail.com)"
5. Click "View Details" or "View Profile"
6. In the modal, click "Manually Approve (Bypass Payment)" button
7. Confirm the action

This will:
- ✅ Change status from `PROVISIONAL_APPROVED` to `APPROVED`
- ✅ Send them the welcome email
- ✅ Make them visible on the map (if coordinates exist)
- ✅ Grant full portal access

### Option 2: Check Their Payment Status First
1. In the church detail modal, look for:
   - **Stripe Customer ID**: Should start with `cus_`
   - **Last Payment Date**: Should show their recent payment
   - **Next Due Date**: Should be ~1 year from payment
   
2. If they have valid payment info but wrong status:
   - Click "Manually Approve" to fix the status
   
3. If they DON'T have payment info:
   - They may need to redo payment through their portal
   - Or admin can manually approve them anyway

### Option 3: Sync Their Stripe Status (If Available)
If there's a "Sync Stripe Status" button in their profile, click it to refresh their payment status from Stripe.

## Why This Happened
Possible causes:
1. Stripe webhook didn't fire correctly
2. Payment was completed but webhook handler failed
3. They were manually set to Provisional and need manual approval
4. There was a timing issue during payment processing

## After Fixing
1. Verify church appears in "Active" tab
2. Check if church appears on the public map
3. If NOT on map, check if they have coordinates:
   - In their profile, look for Latitude/Longitude
   - If missing, click "Map" or "Reassign Coordinates" button
4. Send them a welcome email if needed (button in profile)

## Prevention
- Monitor Stripe webhooks in Stripe Dashboard
- Check Cloud Functions logs for any webhook failures
- Consider adding a daily sync job to catch missed webhook events
