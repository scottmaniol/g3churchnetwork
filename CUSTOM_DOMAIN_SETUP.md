# Custom Domain Setup Guide for network.g3min.org

## ✅ Completed Steps

1. **Firebase Configuration Updated** - The `authDomain` in `services/firebase.ts` has been changed from `g3-church-network.firebaseapp.com` to `network.g3min.org`
2. **Production Build Created** - The site has been built and is ready for deployment in the `dist/` directory

---

## 🚀 Next Steps to Complete Domain Setup

### Step 1: Add Custom Domain in Firebase Console

1. **Go to Firebase Console**
   - Visit: https://console.firebase.google.com/
   - Select your project: `g3-church-network`

2. **Navigate to Hosting**
   - In the left sidebar, click **Hosting**

3. **Add Custom Domain**
   - Click the **"Add custom domain"** button
   - Enter: `network.g3min.org`
   - Click **Continue**

4. **Choose Setup Type**
   - Select **"Quick setup"** (recommended) if available
   - Or choose **"Advanced setup"** if you need more control

5. **Firebase Will Provide DNS Records**
   - Firebase will display the DNS records you need to add
   - These typically include:
     - **A Records** (IPv4 addresses)
     - **AAAA Records** (IPv6 addresses - optional but recommended)
     - **TXT Record** (for domain verification)

6. **Copy the DNS Records**
   - Keep this page open or take note of the records shown

---

### Step 2: Configure DNS at Your Domain Registrar

You need to add DNS records at your domain registrar (where you registered g3min.org).

1. **Log in to Your Domain Registrar**
   - This could be GoDaddy, Namecheap, Google Domains, Cloudflare, etc.
   - Navigate to DNS settings for `g3min.org`

2. **Add the DNS Records**
   
   **Add A Records (Firebase will provide the exact IPs):**
   - Type: `A`
   - Name/Host: `network`
   - Value: `[IP Address from Firebase]` (typically something like `151.101.1.195`)
   - TTL: `3600` or `Automatic`
   
   **Add Second A Record if provided:**
   - Type: `A`
   - Name/Host: `network`
   - Value: `[Second IP Address from Firebase]`
   - TTL: `3600` or `Automatic`

   **Add TXT Record for Verification:**
   - Type: `TXT`
   - Name/Host: `network` (or `network.g3min.org` depending on your registrar)
   - Value: `[Verification string from Firebase]`
   - TTL: `3600` or `Automatic`

3. **Save DNS Changes**
   - Save all DNS records
   - Note: DNS propagation can take 5 minutes to 48 hours (usually within 1-2 hours)

---

### Step 3: Deploy to Firebase Hosting

Once DNS is configured (you can proceed while DNS propagates):

1. **Open Terminal in Project Directory**

2. **Login to Firebase** (if not already logged in)
   ```bash
   firebase login
   ```

3. **Deploy to Firebase Hosting**
   ```bash
   firebase deploy --only hosting
   ```

4. **Optional: Deploy Everything (Hosting, Functions, Firestore Rules)**
   ```bash
   firebase deploy
   ```

---

### Step 4: Verify Domain and SSL Certificate

1. **Return to Firebase Console → Hosting**
   - You should see `network.g3min.org` in your domains list
   - Status will show:
     - **"Pending"** → DNS verification in progress
     - **"Connected"** → Domain verified, SSL provisioning
     - **"Live"** → Everything is ready! ✅

2. **SSL Certificate Provisioning**
   - Firebase automatically provisions a free SSL certificate
   - This can take **24-48 hours** after DNS verification
   - During this time, the site may show a security warning

3. **Test Your Domain**
   - Once status shows **"Live"**, visit: `https://network.g3min.org`
   - Test authentication (login/logout) to ensure the authDomain works correctly

---

## 🔍 Troubleshooting

### DNS Not Propagating
- Check DNS propagation status: https://dnschecker.org/
- Enter: `network.g3min.org`
- Wait for the A records to appear globally

### Authentication Issues
- If users can't log in after domain change:
  1. Go to Firebase Console → Authentication → Settings → Authorized domains
  2. Add `network.g3min.org` to the list
  3. You may also need to keep `g3-church-network.firebaseapp.com` for existing sessions

### SSL Certificate Delayed
- SSL provisioning can take up to 48 hours
- If it takes longer, try:
  1. Remove the custom domain in Firebase Console
  2. Wait 10 minutes
  3. Re-add the custom domain

### "Site Can't Be Reached" Error
- Verify DNS records are correct in your registrar
- Check that the A records point to the IPs provided by Firebase
- Wait for DNS propagation (use dnschecker.org)

---

## 📋 Checklist

- [x] Update `authDomain` in Firebase config
- [x] Build production version (`npm run build`)
- [ ] Add custom domain in Firebase Console
- [ ] Configure DNS records at domain registrar
- [ ] Deploy to Firebase Hosting (`firebase deploy --only hosting`)
- [ ] Add `network.g3min.org` to Firebase Authentication authorized domains
- [ ] Wait for SSL certificate provisioning
- [ ] Test the site at `https://network.g3min.org`
- [ ] Test user authentication and all features

---

## 🎯 Important Notes

1. **Authorized Domains**: Don't forget to add `network.g3min.org` to Firebase Authentication's authorized domains

2. **Environment Variables**: Your `.env.local` file is set up correctly and will work with the custom domain

3. **Existing Users**: After switching domains, existing user sessions might need to re-authenticate

4. **Rollback Plan**: If you need to rollback, simply:
   - Change `authDomain` back to `"g3-church-network.firebaseapp.com"`
   - Rebuild and redeploy
   - Remove custom domain from Firebase Console

5. **Testing**: After deployment, thoroughly test:
   - User login/registration
   - Church dashboard access
   - Admin dashboard access
   - All CRUD operations
   - File uploads (logos, resumes)
   - Stripe integration
   - Email functionality

---

## 🆘 Need Help?

If you encounter any issues:
1. Check Firebase Console → Hosting for domain status and error messages
2. Review Firebase Console → Authentication → Settings → Authorized domains
3. Verify DNS records are correct and propagated
4. Check browser console for any JavaScript errors
5. Review Firebase Hosting logs for deployment issues

---

**Ready to deploy?** Run: `firebase deploy --only hosting`
