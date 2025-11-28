import * as firebaseApp from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  doc, 
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  Firestore
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  Auth,
  User,
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getStorage, 
  FirebaseStorage,
  ref,
  uploadBytes,
  getDownloadURL 
} from 'firebase/storage';
import {
  getFunctions,
  httpsCallable,
  Functions
} from 'firebase/functions';
import { ChurchApplication, ApplicationStatus, EmailTemplate, EmailType, UserProfile, AdminUser } from '../types';

// ------------------------------------------------------------------
// FIREBASE CONFIGURATION
// ------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyD-ivEktFlzvBMNJYQcBdM4cAoiofN1zP0",
  authDomain: "g3-church-network.firebaseapp.com",
  projectId: "g3-church-network",
  storageBucket: "g3-church-network.firebasestorage.app",
  messagingSenderId: "360689492450",
  appId: "1:360689492450:web:8da35742f8ba47a37999bb"
};

// ------------------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------------------

// 1. Initialize Firebase App (Singleton Pattern)
// We check if an app is already initialized to prevent errors during hot-reloading.
let app: firebaseApp.FirebaseApp;
if (firebaseApp.getApps().length > 0) {
  app = firebaseApp.getApp();
} else {
  app = firebaseApp.initializeApp(firebaseConfig);
}

// 2. Initialize Firestore
// Connect to the named database "g3network"
const db: Firestore = getFirestore(app, 'g3network');

// Add connection monitoring for debugging
if (typeof window !== 'undefined') {
  console.log('🔥 Firestore initialized for project:', firebaseConfig.projectId);
  console.log('📊 Using database: g3network');
}

// 3. Initialize other services
const auth: Auth = getAuth(app);
const storage: FirebaseStorage = getStorage(app);
const functions: Functions = getFunctions(app);

const APPS_COLLECTION = 'applications';
const USER_PROFILES_COLLECTION = 'userProfiles'; // New collection for user profiles

export { db, auth, storage, functions };
export type { User };
export { onAuthStateChanged };

// Cloud Function callables for admin user management
const _getAllUsersCallable = httpsCallable(functions, 'getAllUsers');
const _setAdminClaimCallable = httpsCallable(functions, 'setAdminClaim');
const _removeAdminClaimCallable = httpsCallable(functions, 'removeAdminClaim');
const _createAdminCallable = httpsCallable(functions, 'createAdminUser');

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

export const isFirebaseConfigured = () => {
  return !!firebaseConfig.apiKey;
};

export const getProjectId = () => {
  return firebaseConfig.projectId;
};

// ------------------------------------------------------------------
// DATABASE OPERATIONS
// ------------------------------------------------------------------

/**
 * Submit a new application to Firestore.
 */
export const submitApplication = async (application: Omit<ChurchApplication, 'id'>) => {
  console.log("🚀 Starting submission...", { application });
  
  try {
    console.log("📝 Attempting to add document to Firestore...");
    const docRef = await addDoc(collection(db, APPS_COLLECTION), application);
    console.log("✅ Application submitted successfully with ID:", docRef.id);
    return docRef.id;
  } catch (error: any) {
    console.error("❌ Error adding document:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    throw error;
  }
};

/**
 * Get a user profile by UID from Firestore.
 */
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const docRef = doc(db, USER_PROFILES_COLLECTION, uid);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return snapshot.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error("Error getting user profile:", error);
    throw error;
  }
};

/**
 * Update a user's role in their Firestore profile.
 */
export const updateUserProfileRole = async (uid: string, role: UserProfile['role']) => {
  try {
    const docRef = doc(db, USER_PROFILES_COLLECTION, uid);
    await updateDoc(docRef, { role });
  } catch (error) {
    console.error("Error updating user profile role:", error);
    throw error;
  }
};

/**
 * Create a user profile in Firestore.
 */
export const createUserProfile = async (uid: string, email: string, role: UserProfile['role'], displayName?: string, churchId?: string) => {
  try {
    const docRef = doc(db, USER_PROFILES_COLLECTION, uid);
    const userProfile: UserProfile = {
      uid,
      email,
      role,
      ...(displayName && { displayName }),
      ...(churchId && { churchId })
    };
    await setDoc(docRef, userProfile);
  } catch (error) {
    console.error("Error creating user profile:", error);
    throw error;
  }
};

/**
 * Update the status of an application (e.g., Approve/Reject).
 */
export const updateApplicationStatus = async (id: string, status: ApplicationStatus, coordinates?: { lat: number, lng: number }) => {
  try {
    const docRef = doc(db, APPS_COLLECTION, id);
    await updateDoc(docRef, { 
      status,
      ...(coordinates ? { coordinates } : {})
    });
  } catch (error) {
    console.error("Error updating status:", error);
    throw error;
  }
};

/**
 * Subscribe to APPROVED applications (Public View).
 */
export const subscribeToPublicApplications = (callback: (apps: ChurchApplication[]) => void) => {
  const q = query(
    collection(db, APPS_COLLECTION),
    where('status', '==', 'APPROVED')
  );
  
  return onSnapshot(q, (snapshot) => {
    const apps = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as ChurchApplication[];
    callback(apps);
  }, (error) => {
    console.error("Error in public subscription:", error);
  });
};

/**
 * Subscribe to ALL applications (Admin View).
 */
export const subscribeToAllApplications = (callback: (apps: ChurchApplication[]) => void) => {
  const q = query(
    collection(db, APPS_COLLECTION),
    orderBy('submittedAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const apps = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as ChurchApplication[];
    callback(apps);
  }, (error) => {
    console.error("Error in admin subscription:", error);
  });
};

// ------------------------------------------------------------------
// AUTH OPERATIONS
// ------------------------------------------------------------------

export const loginWithEmail = async (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const registerWithEmail = async (email: string, password: string) => {
  return createUserWithEmailAndPassword(auth, email, password);
};

export const logout = async () => {
  return signOut(auth);
};

// ------------------------------------------------------------------
// CHURCH ACCOUNT OPERATIONS
// ------------------------------------------------------------------

/**
 * Upload church logo
 */
export const uploadChurchLogo = async (file: File, churchId: string) => {
  try {
    const storageRef = ref(storage, `logos/${churchId}/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  } catch (error) {
    console.error("Error uploading logo:", error);
    throw error;
  }
};

/**
 * Create a church account when they apply
 */
export const createChurchAccount = async (email: string, password: string) => {
  return createUserWithEmailAndPassword(auth, email, password);
};

/**
 * Login as a church
 */
export const loginAsChurch = async (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

/**
 * Get church application by user ID
 */
export const getChurchByUserId = (userId: string, callback: (church: ChurchApplication | null) => void) => {
  const q = query(
    collection(db, APPS_COLLECTION),
    where('userId', '==', userId)
  );
  
  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      callback(null);
      return;
    }
    const church = {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data()
    } as ChurchApplication;
    callback(church);
  }, (error) => {
    console.error("Error getting church by userId:", error);
    callback(null);
  });
};

/**
 * Update church profile
 */
export const updateChurchProfile = async (id: string, updates: Partial<ChurchApplication>) => {
  try {
    const docRef = doc(db, APPS_COLLECTION, id);
    await updateDoc(docRef, updates);
  } catch (error) {
    console.error("Error updating church profile:", error);
    throw error;
  }
};

/**
 * Delete a church application
 */
export const deleteChurchApplication = async (id: string) => {
  try {
    const docRef = doc(db, APPS_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting church:", error);
    throw error;
  }
};

/**
 * Update church coordinates
 */
export const updateChurchCoordinates = async (id: string, coordinates: { lat: number, lng: number }) => {
  try {
    const docRef = doc(db, APPS_COLLECTION, id);
    await updateDoc(docRef, { coordinates });
  } catch (error) {
    console.error("Error updating church coordinates:", error);
    throw error;
  }
};

// ------------------------------------------------------------------
// SETTINGS / EMAIL TEMPLATES
// ------------------------------------------------------------------

export const saveEmailTemplate = async (template: EmailTemplate) => {
  try {
    const docRef = doc(db, 'settings', `email_template_${template.type}`);
    await setDoc(docRef, template);
  } catch (error) {
    console.error("Error saving email template:", error);
    throw error;
  }
};

export const getEmailTemplate = async (type: EmailType): Promise<EmailTemplate | null> => {
  try {
    const docRef = doc(db, 'settings', `email_template_${type}`);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return snapshot.data() as EmailTemplate;
    }
    return null;
  } catch (error) {
    console.error("Error getting email template:", error);
    throw error;
  }
};

// ------------------------------------------------------------------
// CLOUD FUNCTIONS
// ------------------------------------------------------------------

export const sendEmail = async (recipients: string[], subject: string, html: string, from?: string) => {
  try {
    const sendEmailFn = httpsCallable(functions, 'sendEmailV2');
    const result = await sendEmailFn({ recipients, subject, html, from });
    return result.data;
  } catch (error) {
    console.error("Error calling sendEmail function:", error);
    throw error;
  }
};

export const resendSystemEmail = async (churchId: string, type: EmailType) => {
  try {
    const resendFn = httpsCallable(functions, 'resendSystemEmailV2');
    const result = await resendFn({ churchId, type });
    return result.data;
  } catch (error) {
    console.error("Error calling resendSystemEmail function:", error);
    throw error;
  }
};

export const createStripeSetupIntent = async (email: string, name: string) => {
  try {
    const fn = httpsCallable(functions, 'createStripeSetupIntent');
    const result = await fn({ email, name });
    return result.data as { clientSecret: string, customerId: string };
  } catch (error) {
    console.error("Error creating SetupIntent:", error);
    throw error;
  }
};

export const approveApplication = async (applicationId: string) => {
  try {
    const fn = httpsCallable(functions, 'approveApplication');
    const result = await fn({ applicationId });
    return result.data;
  } catch (error) {
    console.error("Error approving application:", error);
    throw error;
  }
};

export const createChurchUserAndSendResetEmailClient = async (churchId: string, applicantEmail: string) => {
  try {
    const fn = httpsCallable(functions, 'createChurchUserAndSendResetEmail');
    const result = await fn({ churchId, applicantEmail });
    // After creating the Auth user via Cloud Function, also create a Firestore profile
    await createUserProfile(result.data as string, applicantEmail, 'church_user', undefined, churchId);
    return result.data;
  } catch (error) {
    console.error("Error calling createChurchUserAndSendResetEmail function:", error);
    throw error;
  }
};

/**
 * ADMIN FUNCTIONS (CALLING CLOUD FUNCTIONS)
 */

/**
 * Get all users with their custom claims and Firestore profile data.
 * Requires admin privileges on the backend.
 */
export const getAllUsers = async (): Promise<AdminUser[]> => {
  try {
    const result = await _getAllUsersCallable();
    return result.data as AdminUser[];
  } catch (error) {
    console.error("Error fetching all users:", error);
    throw error;
  }
};

/**
 * Set a user's role to 'admin' by setting a custom claim.
 * Requires admin privileges on the backend.
 */
export const setAdminRole = async (uid: string) => {
  try {
    const result = await _setAdminClaimCallable({ uid, role: 'admin' });
    return result.data;
  } catch (error) {
    console.error("Error setting admin role:", error);
    throw error;
  }
};

/**
 * Remove a user's 'admin' role by clearing the custom claim.
 * Requires admin privileges on the backend.
 */
export const removeAdminRole = async (uid: string) => {
  try {
    const result = await _removeAdminClaimCallable({ uid });
    return result.data;
  } catch (error) {
    console.error("Error removing admin role:", error);
    throw error;
  }
};

/**
 * Create a new admin user account.
 * Requires admin privileges on the backend.
 */
export const createAdminUser = async (email: string, password: string): Promise<string> => {
  try {
    const result = await _createAdminCallable({ email, password });
    const uid = result.data as string;
    await createUserProfile(uid, email, 'admin'); // Also create Firestore profile for the new admin
    return uid;
  } catch (error) {
    console.error("Error creating admin user:", error);
    throw error;
  }
};

export const backfillGeocodes = async (startAfterDocId?: string) => {
  try {
    const fn = httpsCallable(functions, 'backfillGeocodes');
    const result = await fn({ startAfterDocId });
    return result.data as { success: boolean; message: string; successCount: number; failCount: number; remaining: number; lastDocId: string | null; };
  } catch (error) {
    console.error("Error calling backfillGeocodes function:", error);
    throw error;
  }
};

export const regeocodeAddress = async (churchId: string) => {
  try {
    const fn = httpsCallable(functions, 'regeocodeAddress');
    const result = await fn({ churchId });
    return result.data as { success: boolean; coordinates: { lat: number; lng: number; } };
  } catch (error) {
    console.error("Error calling regeocodeAddress function:", error);
    throw error;
  }
};
