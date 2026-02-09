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
import { ChurchApplication, ApplicationStatus, EmailTemplate, EmailType, UserProfile, AdminUser, ChurchStatistics, ContactFormData, JobListing, JobApplication, NetworkBenefit } from '../types';

// ------------------------------------------------------------------
// FIREBASE CONFIGURATION
// ------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyD-ivEktFlzvBMNJYQcBdM4cAoiofN1zP0",
  authDomain: "network.g3min.org",
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
const PROMO_CODES_COLLECTION = 'promoCodes';

export { db, auth, storage, functions };
export type { User };
export { onAuthStateChanged };

const JOBS_COLLECTION = 'jobListings';
const JOB_APPLICATIONS_COLLECTION = 'jobApplications';

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

// ------------------------------------------------------------------
// PROMO CODE OPERATIONS
// ------------------------------------------------------------------

export const subscribeToPromoCodes = (
  callback: (codes: { id: string, createdAt: string }[]) => void,
  onError: (error: Error) => void
) => {
  const q = query(collection(db, PROMO_CODES_COLLECTION), orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const codes = snapshot.docs.map(doc => ({
      id: doc.id,
      createdAt: doc.data().createdAt?.toDate?.().toISOString() || new Date().toISOString()
    }));
    callback(codes);
  }, onError);
};

export const addPromoCode = async (code: string) => {
  try {
    const docRef = doc(db, PROMO_CODES_COLLECTION, code);
    await setDoc(docRef, {
      createdAt: new Date()
    });
  } catch (error) {
    console.error("Error adding promo code:", error);
    throw error;
  }
};

export const deletePromoCode = async (code: string) => {
  try {
    const docRef = doc(db, PROMO_CODES_COLLECTION, code);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting promo code:", error);
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
 * Ensure a user profile exists for the current user. If not, create it.
 */
export const ensureUserProfile = async (uid: string, email: string, churchId: string) => {
  try {
    const docRef = doc(db, USER_PROFILES_COLLECTION, uid);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      console.log("User profile missing. Creating now...");
      const userProfile: UserProfile = {
        uid,
        email,
        role: 'church_user',
        churchId
      };
      await setDoc(docRef, userProfile);
      console.log("User profile created successfully.");
    } else {
      // Ensure churchId is set correctly if missing
      const data = snapshot.data();
      if (!data.churchId) {
        console.log("User profile missing churchId. Updating...");
        await updateDoc(docRef, { churchId });
      }
    }
  } catch (error) {
    console.error("Error ensuring user profile:", error);
    // Don't throw, just log. This is a repair operation.
  }
};

/**
 * DEBUG HELPER: Force create an admin profile for the current user.
 * Use this to fix missing profile issues in development.
 */
export const forceCreateAdminProfile = async (uid: string, email: string) => {
  try {
    const docRef = doc(db, USER_PROFILES_COLLECTION, uid);
    await setDoc(docRef, {
      uid,
      email,
      role: 'admin',
      churchId: null
    }, { merge: true });
    console.log("Admin profile force-created successfully.");
  } catch (error) {
    console.error("Error force-creating admin profile:", error);
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

  return onSnapshot(q, async (snapshot) => {
    const churchesWithJobs = await Promise.all(snapshot.docs.map(async doc => {
      const church = {
        id: doc.id,
        ...doc.data()
      } as ChurchApplication;

      // Fetch active job listings for this church
      const jobListings = await getJobListingsByChurch(church.id);
      if (jobListings.length > 0) {
        console.log(`Found ${jobListings.length} jobs for church ${church.churchName} (${church.id})`);
      }
      return { ...church, jobListings: jobListings.filter(job => job.status === 'active') };
    }));
    callback(churchesWithJobs);
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
// JOB LISTING OPERATIONS
// ------------------------------------------------------------------

/**
 * Create a new job listing.
 */
export const createJobListing = async (job: Omit<JobListing, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'churchLogoUrl'>) => {
  try {
    let finalChurchLogoUrl: string | undefined;

    // Fetch church details to get the logo URL
    const churchDocRef = doc(db, APPS_COLLECTION, job.churchId);
    const churchSnapshot = await getDoc(churchDocRef);
    if (churchSnapshot.exists()) {
      const churchData = churchSnapshot.data() as ChurchApplication;
      finalChurchLogoUrl = churchData.churchLogoUrl;
    }

    const newJob: Omit<JobListing, 'id'> = {
      ...job,
      status: 'active',
      datePosted: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(finalChurchLogoUrl && { churchLogoUrl: finalChurchLogoUrl })
    };
    const docRef = await addDoc(collection(db, JOBS_COLLECTION), newJob);
    return docRef.id;
  } catch (error) {
    console.error("Error creating job listing:", error);
    throw error;
  }
};

/**
 * Get a specific job listing by ID.
 */
export const getJobListing = async (id: string): Promise<JobListing | null> => {
  try {
    const docRef = doc(db, JOBS_COLLECTION, id);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const job = { id: snapshot.id, ...snapshot.data() } as JobListing;

      // If churchLogoUrl is missing, fetch it from the church application
      if (!job.churchLogoUrl && job.churchId) {
        try {
          const churchDocRef = doc(db, APPS_COLLECTION, job.churchId);
          const churchSnapshot = await getDoc(churchDocRef);
          if (churchSnapshot.exists()) {
            const churchData = churchSnapshot.data() as ChurchApplication;
            if (churchData.status === 'APPROVED') {
              job.churchLogoUrl = churchData.churchLogoUrl;
            }
          }
        } catch (err) {
          console.error(`Error fetching church details for job ${job.id}:`, err);
        }
      }

      return job;
    }
    return null;
  } catch (error) {
    console.error("Error getting job listing:", error);
    throw error;
  }
};

/**
 * Update an existing job listing.
 */
export const updateJobListing = async (id: string, updates: Partial<JobListing>) => {
  try {
    const docRef = doc(db, JOBS_COLLECTION, id);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error updating job listing:", error);
    throw error;
  }
};

/**
 * Delete a job listing.
 */
export const deleteJobListing = async (id: string) => {
  try {
    const docRef = doc(db, JOBS_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting job listing:", error);
    throw error;
  }
};

/**
 * Subscribe to all active job listings (for public job board).
 */
export const subscribeToActiveJobs = (callback: (jobs: JobListing[]) => void) => {
  const q = query(
    collection(db, JOBS_COLLECTION),
    where('status', '==', 'active'),
    orderBy('datePosted', 'desc')
  );
  return onSnapshot(q, async (snapshot) => {
    const jobsWithLogos = await Promise.all(snapshot.docs.map(async docSnapshot => {
      const job = {
        id: docSnapshot.id,
        ...docSnapshot.data()
      } as JobListing;

      // If churchLogoUrl is missing, fetch it from the church application
      if (!job.churchLogoUrl && job.churchId) {
        try {
          const churchDocRef = doc(db, APPS_COLLECTION, job.churchId);
          const churchSnapshot = await getDoc(churchDocRef);
          if (churchSnapshot.exists()) {
            const churchData = churchSnapshot.data() as ChurchApplication;
            if (churchData.status === 'APPROVED') {
              job.churchLogoUrl = churchData.churchLogoUrl;
            }
          }
        } catch (err) {
          console.error(`Error fetching church details for job ${job.id}:`, err);
          // Continue without logo
        }
      }
      return job;
    }));
    callback(jobsWithLogos);
  }, (error) => {
    console.error("Error in active jobs subscription:", error);
  });
};

/**
 * Subscribe to job listings by a specific church (for church dashboard).
 */
export const subscribeToJobListingsByChurch = (churchId: string, callback: (jobs: JobListing[]) => void) => {
  const q = query(
    collection(db, JOBS_COLLECTION),
    where('churchId', '==', churchId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const jobs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as JobListing[];
    callback(jobs);
  }, (error) => {
    console.error("Error in church jobs subscription:", error);
  });
};

/**
 * Get job listings by a specific church (one-time fetch).
 */
export const getJobListingsByChurch = async (churchId: string): Promise<JobListing[]> => {
  try {
    const q = query(
      collection(db, JOBS_COLLECTION),
      where('churchId', '==', churchId),
      where('status', '==', 'active'), // Filter for active jobs to comply with security rules
      orderBy('createdAt', 'desc')
    );
    const { getDocs } = await import('firebase/firestore');
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as JobListing[];
  } catch (error: any) {
    console.error("Error fetching church jobs:", error.code, error.message);
    return [];
  }
};

/**
 * Subscribe to all job listings (for admin dashboard).
 */
export const subscribeToAllJobs = (callback: (jobs: JobListing[]) => void) => {
  const q = query(
    collection(db, JOBS_COLLECTION),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const jobs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as JobListing[];
    callback(jobs);
  }, (error) => {
    console.error("Error in all jobs subscription:", error);
  });
};

// ------------------------------------------------------------------
// JOB APPLICATION OPERATIONS
// ------------------------------------------------------------------

/**
 * Submit a new job application.
 */
export const submitJobApplication = async (application: Omit<JobApplication, 'id'>) => {
  try {
    const docRef = await addDoc(collection(db, JOB_APPLICATIONS_COLLECTION), application);
    return docRef.id;
  } catch (error) {
    console.error("Error submitting job application:", error);
    throw error;
  }
};

/**
 * Delete a job application.
 */
export const deleteJobApplication = async (id: string) => {
  try {
    const docRef = doc(db, JOB_APPLICATIONS_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting job application:", error);
    throw error;
  }
};

/**
 * Upload an applicant's resume.
 */
export const uploadResume = async (file: File, jobId: string, applicantName: string) => {
  try {
    const storageRef = ref(storage, `resumes/${jobId}/${applicantName.replace(/\s/g, '_')}_${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  } catch (error) {
    console.error("Error uploading resume:", error);
    throw error;
  }
};

/**
 * Subscribe to job applications for a specific job (for church to view).
 */
export const subscribeToJobApplicationsByJob = (jobId: string, callback: (applications: JobApplication[]) => void) => {
  const q = query(
    collection(db, JOB_APPLICATIONS_COLLECTION),
    where('jobId', '==', jobId),
    orderBy('appliedAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const apps = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as JobApplication[];
    callback(apps);
  }, (error) => {
    console.error("Error in job applications subscription:", error);
  });
};

/**
 * Subscribe to job applications for all jobs posted by a specific church.
 */
export const subscribeToJobApplicationsByChurch = (churchId: string, callback: (applications: JobApplication[]) => void) => {
  const q = query(
    collection(db, JOB_APPLICATIONS_COLLECTION),
    where('churchId', '==', churchId),
    orderBy('appliedAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const apps = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as JobApplication[];
    callback(apps);
  }, (error) => {
    console.error("Error in church job applications subscription:", error);
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
  console.log('🔍 Querying for church with userId:', userId);
  console.log('🔍 Current auth user:', auth.currentUser?.uid);
  console.log('🔍 Auth user email:', auth.currentUser?.email);

  const q = query(
    collection(db, APPS_COLLECTION),
    where('userId', '==', userId)
  );

  return onSnapshot(q, (snapshot) => {
    console.log('📊 Query snapshot received, empty:', snapshot.empty, 'size:', snapshot.size);
    if (snapshot.empty) {
      callback(null);
      return;
    }
    const church = {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data()
    } as ChurchApplication;
    console.log('✅ Church data found:', church.churchName);
    callback(church);
  }, (error) => {
    console.error("❌ Error getting church by userId:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
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
    console.log(`Profile ${id} updated. Shopify sync will be triggered.`);
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

/**
 * Get a specific church application by ID.
 */
export const getChurchApplication = async (id: string): Promise<ChurchApplication | null> => {
  try {
    const docRef = doc(db, APPS_COLLECTION, id);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return { id: snapshot.id, ...snapshot.data() } as ChurchApplication;
    }
    return null;
  } catch (error) {
    console.error("Error getting church application:", error);
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
// NETWORK BENEFITS
// ------------------------------------------------------------------

export const saveNetworkBenefits = async (benefits: NetworkBenefit[]) => {
  try {
    const docRef = doc(db, 'settings', 'network_benefits');
    await setDoc(docRef, { benefits });
  } catch (error) {
    console.error("Error saving network benefits:", error);
    throw error;
  }
};

export const getNetworkBenefits = async (): Promise<NetworkBenefit[] | null> => {
  try {
    const docRef = doc(db, 'settings', 'network_benefits');
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return snapshot.data().benefits as NetworkBenefit[];
    }
    return null;
  } catch (error) {
    console.error("Error getting network benefits:", error);
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

export const syncSubscriptionStatus = async (churchId: string) => {
  try {
    const fn = httpsCallable(functions, 'syncSubscriptionStatus');
    const result = await fn({ churchId });
    return result.data;
  } catch (error) {
    console.error("Error calling syncSubscriptionStatus function:", error);
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

export const verifyPromoCode = async (code: string): Promise<boolean> => {
  console.log(`Verifying promo code: ${code}`);
  try {
    const projectId = getProjectId();
    let functionUrl = `https://us-central1-${projectId}.cloudfunctions.net/verifyPromoCode`;

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      // Assuming local emulator if localhost, though if not running it will fail.
      // It's safer to try to fetch, and if it fails, fallback to Firestore.
      functionUrl = `http://127.0.0.1:5001/${projectId}/us-central1/verifyPromoCode`;
    }
    console.log(`Attempting to verify via Cloud Function: ${functionUrl}`);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { code } }),
    });

    if (!response.ok) {
      console.warn(`Cloud function HTTP request failed with status: ${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log("Cloud function verification result:", result);
    return result.data.valid;

  } catch (error) {
    console.warn("Cloud function HTTP request failed or error occurred, falling back to direct Firestore check:", error);
    // Fallback to direct Firestore query
    try {
      console.log(`Checking promo code ${code} directly in Firestore...`);
      const docRef = doc(db, PROMO_CODES_COLLECTION, code);
      const snapshot = await getDoc(docRef);
      const exists = snapshot.exists();
      console.log(`Firestore check result for ${code}: ${exists}`);
      return exists;
    } catch (dbError) {
      console.error("Error verifying promo code via Firestore:", dbError);
      return false;
    }
  }
};

// Provisionally approve application (creates portal account, sends provisional approval email)
export const provisionallyApproveApplication = async (applicationId: string) => {
  try {
    const provisionalApprove = httpsCallable(functions, 'provisionallyApproveApplication');
    await provisionalApprove({ applicationId });
  } catch (error: any) {
    console.error("Error calling provisionallyApproveApplication:", error);
    throw new Error(error.message || 'Failed to provisionally approve application');
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
    const responseData = result.data as { success: boolean; message: string; uid: string };
    await createUserProfile(responseData.uid, applicantEmail, 'church_user', undefined, churchId);
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

/**
 * Delete a user account.
 * Requires admin privileges on the backend.
 */
export const deleteUser = async (uid: string) => {
  try {
    const deleteUserCallable = httpsCallable(functions, 'deleteUser');
    const result = await deleteUserCallable({ uid });
    return result.data;
  } catch (error) {
    console.error("Error deleting user:", error);
    throw error;
  }
};

/**
 * Change a user's password.
 * Requires admin privileges on the backend.
 */
export const changeUserPassword = async (uid: string, newPassword: string) => {
  try {
    const changePasswordCallable = httpsCallable(functions, 'changeUserPassword');
    const result = await changePasswordCallable({ uid, newPassword });
    return result.data;
  } catch (error) {
    console.error("Error changing user password:", error);
    throw error;
  }
};

/**
 * Send a password reset email to a user.
 * Requires admin privileges on the backend.
 */
export const sendPasswordResetEmail = async (email: string) => {
  try {
    const sendResetEmailCallable = httpsCallable(functions, 'sendPasswordResetEmail');
    const result = await sendResetEmailCallable({ email });
    return result.data;
  } catch (error) {
    console.error("Error sending password reset email:", error);
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

export const createStripeBillingPortalSession = async (customerId: string, returnUrl?: string) => {
  try {
    const fn = httpsCallable(functions, 'createStripeBillingPortalSession');
    const result = await fn({ customerId, returnUrl });
    return result.data as { url: string };
  } catch (error) {
    console.error("Error creating billing portal session:", error);
    throw error;
  }
};

// ------------------------------------------------------------------
// STATISTICS & CONTACT OPERATIONS
// ------------------------------------------------------------------

/**
 * Increment a church statistic (visits, contacts, or views)
 */
export const incrementChurchStatistic = async (churchId: string, type: 'visits' | 'contacts' | 'views') => {
  try {
    const fn = httpsCallable(functions, 'incrementChurchStatistic');
    const result = await fn({ churchId, type });
    return result.data;
  } catch (error) {
    console.error(`Error incrementing ${type} for church ${churchId}:`, error);
    throw error;
  }
};

/**
 * Send a contact email to the admin
 */
export const sendAdminContactEmail = async (formData: ContactFormData) => {
  try {
    const fn = httpsCallable(functions, 'sendAdminContactEmail');
    const result = await fn({
      senderName: formData.senderName,
      senderEmail: formData.senderEmail,
      message: formData.message
    });
    return result.data;
  } catch (error) {
    console.error("Error sending admin contact email:", error);
    throw error;
  }
};

/**
 * Send a contact email to a church
 */
export const sendChurchContactEmail = async (churchId: string, formData: ContactFormData) => {
  try {
    const fn = httpsCallable(functions, 'sendChurchContactEmail');
    const result = await fn({
      churchId,
      senderName: formData.senderName,
      senderEmail: formData.senderEmail,
      message: formData.message
    });
    return result.data;
  } catch (error) {
    console.error("Error sending contact email:", error);
    throw error;
  }
};

/**
 * Get statistics for a specific church
 */
export const getChurchStatistics = async (churchId: string): Promise<ChurchStatistics | null> => {
  try {
    const docRef = doc(db, 'churchStats', churchId);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      return {
        churchId,
        visits: data.visits || 0,
        contacts: data.contacts || 0,
        views: data.views || 0,
        lastUpdated: data.lastUpdated?.toDate?.()?.toISOString() || new Date().toISOString()
      };
    }
    return null;
  } catch (error) {
    console.error("Error getting church statistics:", error);
    throw error;
  }
};

/**
 * Subscribe to statistics for a specific church
 */
export const subscribeToChurchStatistics = (churchId: string, callback: (stats: ChurchStatistics | null) => void) => {
  const docRef = doc(db, 'churchStats', churchId);

  return onSnapshot(docRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      callback({
        churchId,
        visits: data.visits || 0,
        contacts: data.contacts || 0,
        views: data.views || 0,
        lastUpdated: data.lastUpdated?.toDate?.()?.toISOString() || new Date().toISOString()
      });
    } else {
      callback(null);
    }
  }, (error) => {
    console.error("Error in statistics subscription:", error);
    callback(null);
  });
};

/**
 * Get all church statistics (Admin only)
 */
export const getAllChurchStatistics = async (): Promise<ChurchStatistics[]> => {
  try {
    const q = query(collection(db, 'churchStats'));
    const { getDocs } = await import('firebase/firestore');
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        churchId: doc.id,
        visits: data.visits || 0,
        contacts: data.contacts || 0,
        views: data.views || 0,
        lastUpdated: data.lastUpdated?.toDate?.()?.toISOString() || new Date().toISOString()
      };
    });
  } catch (error) {
    console.error("Error getting all church statistics:", error);
    throw error;
  }
};

/**
 * Subscribe to all church statistics (Admin only)
 */
export const subscribeToAllChurchStatistics = (callback: (stats: ChurchStatistics[]) => void) => {
  const q = query(collection(db, 'churchStats'));

  return onSnapshot(q, (snapshot) => {
    const stats = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        churchId: doc.id,
        visits: data.visits || 0,
        contacts: data.contacts || 0,
        views: data.views || 0,
        lastUpdated: data.lastUpdated?.toDate?.()?.toISOString() || new Date().toISOString()
      };
    });
    callback(stats);
  }, (error) => {
    console.error("Error in all statistics subscription:", error);
  });
};

// ------------------------------------------------------------------
// ENHANCED ANALYTICS & EVENT TRACKING
// ------------------------------------------------------------------

/**
 * Log a detailed event with metadata
 */
export const logChurchEvent = async (
  churchId: string,
  type: 'view' | 'contact' | 'visit' | 'email_sent' | 'email_opened' | 'email_clicked' | 'social_click',
  metadata?: {
    source?: string;
    platform?: string;
    emailType?: EmailType;
    referrer?: string;
  }
) => {
  try {
    const fn = httpsCallable(functions, 'logChurchEvent');
    const result = await fn({ churchId, type, metadata });
    return result.data;
  } catch (error) {
    console.error(`Error logging event ${type} for church ${churchId}:`, error);
    throw error;
  }
};

/**
 * Get comprehensive analytics for a specific church
 */
export const getChurchAnalytics = async (churchId: string) => {
  try {
    const fn = httpsCallable(functions, 'getChurchAnalytics');
    const result = await fn({ churchId });
    return result.data;
  } catch (error) {
    console.error(`Error getting analytics for church ${churchId}:`, error);
    throw error;
  }
};

/**
 * Get global analytics across all churches (Admin only)
 */
export const getGlobalAnalytics = async () => {
  try {
    const fn = httpsCallable(functions, 'getGlobalAnalytics');
    const result = await fn();
    return result.data;
  } catch (error) {
    console.error("Error getting global analytics:", error);
    throw error;
  }
};

/**
 * Get time-series data for charts (Admin only)
 */
export const getTimeSeriesData = async (churchId?: string, days: number = 30) => {
  try {
    const fn = httpsCallable(functions, 'getTimeSeriesData');
    const result = await fn({ churchId, days });
    return result.data;
  } catch (error) {
    console.error("Error getting time-series data:", error);
    throw error;
  }
};

/**
 * Reset all analytics data (Admin Only)
 */
export const resetAnalytics = async () => {
  try {
    const fn = httpsCallable(functions, 'resetAnalytics');
    const result = await fn();
    return result.data;
  } catch (error) {
    console.error("Error resetting analytics:", error);
    throw error;
  }
};

/**
 * Track a profile view
 */
export const trackChurchView = async (churchId: string, source?: string) => {
  console.group(`📊 Tracking View: ${churchId}`);
  console.log('Source:', source);
  try {
    await logChurchEvent(churchId, 'view', { source });
    console.log('✅ View logged successfully');
  } catch (error) {
    console.error(`❌ Error tracking view for church ${churchId}:`, error);
    // Don't throw - tracking errors shouldn't break the UI
  } finally {
    console.groupEnd();
  }
};

/**
 * Track a website visit (button click)
 */
export const trackChurchVisit = async (churchId: string, platform?: string) => {
  const finalPlatform = platform || 'website';
  console.group(`📊 Tracking Visit: ${churchId}`);
  console.log('Platform:', finalPlatform);
  try {
    await logChurchEvent(churchId, 'visit', { platform: finalPlatform });
    console.log('✅ Visit logged successfully');
  } catch (error) {
    console.error(`❌ Error tracking visit for church ${churchId}:`, error);
    // Don't throw - tracking errors shouldn't break the UI
  } finally {
    console.groupEnd();
  }
};

/**
 * Track a social media click
 */
export const trackSocialClick = async (churchId: string, platform: string) => {
  console.group(`📊 Tracking Social Click: ${churchId}`);
  console.log('Platform:', platform);
  try {
    await logChurchEvent(churchId, 'social_click', { platform });
    console.log('✅ Social click logged successfully');
  } catch (error) {
    console.error(`❌ Error tracking social click for church ${churchId}:`, error);
    // Don't throw - tracking errors shouldn't break the UI
  } finally {
    console.groupEnd();
  }
};

/**
 * Track a contact form submission
 */
export const trackChurchContact = async (churchId: string, source?: string) => {
  console.group(`📊 Tracking Contact: ${churchId}`);
  console.log('Source:', source);
  try {
    await logChurchEvent(churchId, 'contact', { source });
    console.log('✅ Contact logged successfully');
  } catch (error) {
    console.error(`❌ Error tracking contact for church ${churchId}:`, error);
    // Don't throw - tracking errors shouldn't break the UI
  } finally {
    console.groupEnd();
  }
};

/**
 * Clear test mode Stripe customer IDs from all churches (Admin Only)
 */
export const clearTestStripeData = async () => {
  try {
    const fn = httpsCallable(functions, 'clearTestStripeData');
    const result = await fn();
    return result.data as {
      success: boolean;
      message: string;
      scanned: number;
      updated: number;
      testModeFound: number;
    };
  } catch (error) {
    console.error("Error clearing test Stripe data:", error);
    throw error;
  }
};

/**
 * Create a Stripe Checkout Session for initial payment setup
 * Redirects churches to Stripe to set up their first recurring payment
 */
export const createStripeCheckoutSession = async (churchId: string, amount?: number, paymentPlan?: 'annual' | 'biannual' | 'quarterly') => {
  try {
    const fn = httpsCallable(functions, 'createStripeCheckoutSession');
    const result = await fn({ churchId, amount, paymentPlan: paymentPlan || 'annual' });
    return result.data as { url: string; sessionId: string };
  } catch (error) {
    console.error("Error creating Stripe Checkout session:", error);
    throw error;
  }
};
