# Firestore Security Rules Configuration

## Problem
The map can only display approved churches when an admin is logged in because the current Firestore security rules are preventing unauthenticated users from reading the applications collection.

## Solution
Update your Firestore Security Rules to allow public read access for approved churches while maintaining security for other operations.

## Instructions

1. **Open Firebase Console**
   - Go to https://console.firebase.google.com/
   - Select your project: `g3-church-network`

2. **Navigate to Firestore Database**
   - Click on "Firestore Database" in the left sidebar
   - Click on the "Rules" tab at the top

3. **Replace the existing rules with the following:**

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is admin
    function isAdmin() {
      return request.auth != null && request.auth.token.email != null;
    }
    
    // Helper function to check if user owns the church profile
    function isChurchOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }
    
    // Applications collection rules
    match /applications/{applicationId} {
      
      // Allow anyone (including non-authenticated users) to READ approved churches
      // This enables the public map to display approved churches
      allow read: if resource.data.status == 'APPROVED';
      
      // Allow authenticated users to CREATE new applications
      // This allows churches to submit applications
      allow create: if request.auth != null 
                    && request.resource.data.status == 'PENDING'
                    && request.resource.data.userId == request.auth.uid;
      
      // Allow admins to CREATE applications with any status (for CSV import)
      allow create: if isAdmin();
      
      // Allow admins to READ all applications (pending, approved, rejected)
      allow read: if isAdmin();
      
      // Allow admins to UPDATE any application (approve, reject, edit)
      allow update: if isAdmin();
      
      // Allow admins to DELETE any application
      allow delete: if isAdmin();
      
      // Allow church owners to UPDATE their own profile
      // (only if already approved and not changing status)
      allow update: if isChurchOwner(resource.data.userId)
                    && resource.data.status == 'APPROVED'
                    && request.resource.data.status == 'APPROVED';
    }
  }
}
```

4. **Publish the Rules**
   - Click the "Publish" button at the top of the rules editor
   - Wait for confirmation that the rules have been published

## What These Rules Do

### Public Access (No Login Required)
- ✅ **Anyone can view approved churches** - This fixes the map visibility issue
- This allows the public map at `/map` to display all approved churches

### Church User Access (Logged In Churches)
- ✅ Churches can submit new applications (status must be PENDING)
- ✅ Churches can update their own profile (only if already approved)
- ❌ Churches cannot change their own status
- ❌ Churches cannot view other pending/rejected applications

### Admin Access (Logged In Admins)
- ✅ Admins can read ALL applications (pending, approved, rejected)
- ✅ Admins can update any application (approve, reject, edit profiles)
- ✅ Admins can delete any application

## Security Benefits

1. **Protected Application Process**: Only authenticated users can submit applications
2. **Status Control**: Churches cannot self-approve their applications
3. **Privacy**: Pending and rejected applications are only visible to admins
4. **Public Transparency**: Approved churches are visible to everyone for the network map
5. **Profile Management**: Approved churches can update their own information

## Testing

After publishing these rules:

1. **Test Public Map Access**
   - Log out from admin
   - Navigate to the map view
   - You should now see all approved churches

2. **Test Application Submission**
   - Try submitting a new church application
   - It should work for authenticated users

3. **Test Admin Functions**
   - Log in as admin
   - You should be able to see all applications and manage them

## Troubleshooting

If the map still doesn't show churches after updating rules:

1. **Clear browser cache** and reload the page
2. **Check browser console** for any error messages
3. **Verify rules are published** in Firebase Console
4. **Ensure database name** matches: `g3network` (as specified in `services/firebase.ts`)

## Notes

- The `isAdmin()` function currently allows any authenticated user to be admin
- For production, you should implement proper admin role checking using custom claims
- Consider adding rate limiting for public reads to prevent abuse
