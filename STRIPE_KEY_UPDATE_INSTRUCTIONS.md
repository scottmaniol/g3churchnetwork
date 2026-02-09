# How to Fix the Expired Stripe API Key

## Problem
Your Stripe API key has expired. The current key in `functions/.env` is no longer valid.

## Solution: Get a New Stripe API Key

### Step 1: Log in to Stripe Dashboard
1. Go to https://dashboard.stripe.com/
2. Log in with your Stripe account credentials

### Step 2: Navigate to API Keys
1. In the left sidebar, click on **"Developers"**
2. Click on **"API keys"**

### Step 3: Create or Reveal Your Secret Key
1. Look for the **"Secret key"** section
2. If you see a masked key like `sk_live_••••••••••••••••`, click **"Reveal live key"**
3. Copy the full key (it will start with `sk_live_`)

**IMPORTANT:** If there's a note saying the key is expired or restricted, you need to create a new one:
- Click **"Create secret key"** button
- Give it a name like "G3 Church Network"
- Copy the newly generated key

### Step 4: Update Your .env File
1. Open the file: `functions/.env`
2. Replace the STRIPE_SECRET_KEY value with your new key:
   ```
   STRIPE_SECRET_KEY=sk_live_YOUR_NEW_KEY_HERE
   ```

### Step 5: Redeploy Firebase Functions
Run these commands in your terminal:
```bash
cd functions
npm run build
firebase deploy --only functions
```

### Step 6: Test the Pay Dues Button
1. Go to the church portal
2. Click "Pay Dues"
3. It should now redirect to Stripe checkout without errors

## Need Help?
If you don't have access to the Stripe dashboard or need assistance, contact the person who originally set up the Stripe account for G3 Church Network.

## Current Status
- ❌ API Key: EXPIRED (needs to be updated)
- ✅ Environment Variables: Properly configured
- ✅ Firebase Functions: Deployed and ready (just needs new key)
