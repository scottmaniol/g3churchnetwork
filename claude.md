# Claude AI Assistant Guide - G3 Church Network

> **Important**: Always consult this file before starting any task or answering questions about this project.

---

## Project Overview

**G3 Church Network** is a comprehensive web application for managing a global fellowship of Reformed Baptist churches. It includes:

- 🗺️ Interactive church map
- 💼 Job board for church positions  
- 📝 Church application and membership system
- 🏢 Church member portal
- ⚙️ Admin dashboard
- 💳 Stripe payment processing
- 📧 Email automation
- 📊 Analytics tracking

**Tech Stack**: React + TypeScript + Vite + Firebase + Stripe + TailwindCSS

**Detailed Documentation**: See `app_overview.md` in the `.gemini/antigravity/brain/` directory for complete architecture details.

---

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

**Environment Setup**: Ensure `.env.local` contains `GEMINI_API_KEY`

---

## Deployment Instructions

### Firebase Hosting Deployment

#### Prerequisites
- Firebase CLI installed globally: `npm install -g firebase-tools`
- Logged into Firebase: `firebase login`
- Project initialized (already done - `.firebaserc` exists)

#### Deploy to Production

```bash
# Build the production bundle
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting

# Deploy everything (hosting + functions + firestore rules)
firebase deploy
```

#### Deploy Functions Only
```bash
cd functions
npm install  # Ensure dependencies are installed
cd ..
firebase deploy --only functions
```

#### Deploy Firestore Rules Only
```bash
firebase deploy --only firestore:rules
```

#### Deploy Firestore Indexes
```bash
firebase deploy --only firestore:indexes
```

### Custom Domain
- Custom domain configured: `network.g3min.org`
- See `CUSTOM_DOMAIN_SETUP.md` for detailed setup instructions

### Post-Deployment Verification
1. Check Firebase Console: https://console.firebase.google.com
2. Visit production site
3. Test authentication flows
4. Verify Stripe webhooks are receiving events
5. Check Cloud Functions logs for errors

---

## Project Structure

```
g3churchnetwork/
├── App.tsx                    # Main app component & routing
├── components/                # All React components
│   ├── AdminDashboard.tsx     # Admin portal (LARGE - 5,743 lines)
│   ├── ChurchDashboard.tsx    # Church member portal
│   ├── ApplicationForm.tsx    # Church application
│   ├── JobBoard.tsx           # Job listings
│   └── ...
├── services/
│   ├── firebase.ts            # Firebase SDK wrapper (1,398 lines)
│   └── stripe.ts              # Stripe integration
├── functions/                 # Cloud Functions
│   └── src/
│       └── index.ts           # All backend logic
├── types.ts                   # TypeScript definitions
└── index.html                 # Entry HTML
```

---

## Firebase Configuration

### Named Database
This project uses a **named Firestore database**: `g3network`  
(Not the default database)

### Key Collections
- `applications` - Church profiles and applications
- `jobListings` - Job postings
- `jobApplications` - Job applications
- `userProfiles` - User roles and profiles
- `promoCodes` - Active promo codes
- `settings` - Email templates and network benefits
- `churchStatistics` - Analytics data
- `churchEvents` - Event tracking

### Important Files
- `firestore.rules` - Security rules
- `firestore.indexes.json` - Query indexes
- `storage.rules` - Storage security
- `firebase.json` - Firebase configuration

---

## Common Tasks

### Adding a New Component
1. Create component in `components/` directory
2. Use TypeScript with proper types from `types.ts`
3. Follow existing patterns (lazy loading for large components)
4. Export using named export: `export const ComponentName = () => { ... }`
5. Import lazily in `App.tsx` if needed:
   ```typescript
   const ComponentName = lazy(() => import('./components/ComponentName').then(module => ({ default: module.ComponentName })));
   ```

### Updating Firebase Functions
1. Edit `functions/src/index.ts`
2. Test locally: `cd functions && npm run serve`
3. Deploy: `firebase deploy --only functions`
4. Check logs: `firebase functions:log`

### Modifying Types
1. All shared types are in `types.ts` (root) and `functions/src/types.ts`
2. Keep both in sync when making changes
3. Use strict TypeScript - no `any` types unless absolutely necessary

### Working with Forms
- Use controlled components
- Validate on submission
- Show clear error messages
- Include loading states
- Disable submit button while processing

### Adding Email Templates
1. Go to Admin Dashboard → Email Templates
2. Edit template with rich text editor
3. Use variables: `{churchName}`, `{applicantName}`, etc.
4. Test by triggering the associated action

---

## Important Code Patterns

### Firebase Operations
All Firebase operations go through `services/firebase.ts`. Never use Firebase SDK directly in components.

```typescript
// ✅ Good
import { subscribeToPublicApplications } from './services/firebase';

// ❌ Bad
import { collection, query } from 'firebase/firestore';
```

### State Management
- Use React hooks (`useState`, `useEffect`)
- Keep state local to components when possible
- Lift state only when needed
- Use real-time subscriptions for live data

### Error Handling
```typescript
try {
  await someFirebaseOperation();
  setNotification({ message: 'Success!', type: 'success' });
} catch (error: any) {
  console.error('Error:', error);
  setNotification({ 
    message: 'Error message', 
    type: 'error',
    details: error.message 
  });
}
```

### Lazy Loading
Large components are lazy loaded for performance:
```typescript
const AdminDashboard = lazy(() => 
  import('./components/AdminDashboard').then(module => ({ 
    default: module.AdminDashboard 
  }))
);
```

---

## Security Considerations

### Firestore Security Rules
- Documented in `FIRESTORE_SECURITY_RULES.md`
- Rules are in `firestore.rules`
- Test rules before deploying: `firebase emulators:start`

### Authentication
- Churches: Email/password auth
- Admins: Custom claims set via Cloud Functions
- Role-based access control in Firestore rules

### Payment Security
- Never expose Stripe secret keys in frontend
- All payment operations via Cloud Functions
- Webhook signature verification enabled

---

## Testing & Debugging

### Local Testing
```bash
npm run dev  # Opens on http://localhost:5173
```

### Firebase Emulators
```bash
firebase emulators:start
# Emulates Firestore, Functions, Auth locally
```

### Debug Mode
Development mode shows orange indicator in header when `import.meta.env.DEV` is true.

### Common Issues

**Issue**: Firestore permission denied  
**Fix**: Check security rules in `firestore.rules`, ensure user is authenticated

**Issue**: Function deployment fails  
**Fix**: Check `functions/package.json` dependencies, run `npm install` in functions directory

**Issue**: Stripe webhooks not working  
**Fix**: Verify webhook signing secret in Cloud Functions environment config

**Issue**: Map not loading  
**Fix**: Check Mapbox token, verify churches have coordinates

---

## Scripts & Utilities

### Database Management
Located in root and `functions/` directory:
- `clear-test-stripe-client.js` - Clear test Stripe data
- `clear-test-data.js` - Clear test applications
- `verify-church-data.js` - Verify church records

### Running Scripts
```bash
node script-name.js
```

---

## Key URLs

- **Production**: https://network.g3min.org
- **Firebase Console**: https://console.firebase.google.com/project/g3-church-network
- **Stripe Dashboard**: Check with project owner
- **G3 Main Site**: https://g3min.org

---

## Code Style Guidelines

1. **TypeScript**: Use strict typing, avoid `any`
2. **Naming**: 
   - Components: PascalCase (`ChurchDashboard`)
   - Functions: camelCase (`handleSubmit`)
   - Constants: UPPER_SNAKE_CASE (`APPS_COLLECTION`)
3. **Comments**: Add comments for complex logic
4. **Formatting**: Follow existing indentation (2 spaces)
5. **Imports**: Group by external, internal, types

---

## Admin Access

To access admin dashboard:
1. Navigate to `/admin`
2. Login with admin credentials
3. Admin role must be set via Cloud Function

**Creating Admins**: Use Admin Dashboard → User Management → Add Admin

---

## Recent Changes & Context

- **Projects Feature Refactor** (Jan 2026): Migrated to `ProjectsContext`, removed prop drilling
- **Multi-database Setup**: Uses named database `g3network`
- **Payment System**: Integrated Stripe subscriptions with promo codes

---

## When in Doubt

1. ✅ Check this file first
2. ✅ Reference `app_overview.md` for detailed architecture
3. ✅ Check `types.ts` for data structures
4. ✅ Look at existing similar components for patterns
5. ✅ Review `services/firebase.ts` for available operations
6. ✅ Check Firebase Console for live data and logs

---

## Important Notes

- ⚠️ **Named Database**: Always use `g3network` database, not default
- ⚠️ **AdminDashboard**: This is the largest component (5,743 lines), be careful with changes
- ⚠️ **Lazy Loading**: Keep it for large components (AdminDashboard, ChurchDashboard, etc.)
- ⚠️ **Payment Testing**: Use Stripe test mode, never real cards in development
- ⚠️ **Geocoding**: Auto-geocodes addresses, requires Google Maps API key in Functions

---

## Contact & Support

For questions about:
- **Architecture**: Refer to `app_overview.md`
- **Deployment**: See sections above
- **Firebase**: Check Firebase Console and documentation
- **Stripe**: Reference Stripe dashboard and documentation

---

*Last Updated: January 2026*
