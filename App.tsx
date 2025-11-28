import React, { useState, useEffect } from 'react';
import { AppView, ChurchApplication, ApplicationStatus } from './types';
import { ApplicationForm } from './components/ApplicationForm';
import { AdminDashboard } from './components/AdminDashboard';
import { WorldMap } from './components/WorldMap';
import { ChurchLogin } from './components/ChurchLogin';
import { ChurchDashboard } from './components/ChurchDashboard';
import { RequirementsModal } from './components/RequirementsModal';
import { Button as MainButton } from './components/Button';
import { ArrowRight, Lock, Map, Menu, X, CheckCircle, AlertCircle, Church } from 'lucide-react';
import { 
  subscribeToPublicApplications, 
  submitApplication, 
  isFirebaseConfigured, 
  getProjectId,
  createChurchAccount,
  auth,
  onAuthStateChanged,
  updateChurchProfile
} from './services/firebase';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.HOME);
  const [publicApplications, setPublicApplications] = useState<ChurchApplication[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [churchUserId, setChurchUserId] = useState<string | null>(null);
  const [showRequirementsModal, setShowRequirementsModal] = useState(false);
  
  // Notification State
  const [notification, setNotification] = useState<{
    message: React.ReactNode;
    type: 'success' | 'error';
    details?: string;
  } | null>(null);

  // Check Configuration on Mount
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setNotification({
        message: "SETUP REQUIRED: Update services/firebase.ts with your Firebase Project Config.",
        type: 'error'
      });
    }
  }, []);

  // Monitor auth state for church users
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Check if this is a church user (not admin)
        // For now, we'll assume if they land on church dashboard, they're a church user
        setChurchUserId(user.uid);
      } else {
        setChurchUserId(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to Public (Approved) Data for Map and Home
  useEffect(() => {
    if (!isFirebaseConfigured()) return;

    const unsubscribe = subscribeToPublicApplications((data) => {
      setPublicApplications(data);
    });
    return () => unsubscribe();
  }, []);

  const navigateTo = (newView: AppView) => {
    // Show requirements modal before applying
    if (newView === AppView.APPLY) {
      setShowRequirementsModal(true);
      setMobileMenuOpen(false);
      return;
    }
    
    setView(newView);
    setMobileMenuOpen(false);
  };

  const handleContinueToApplication = () => {
    setShowRequirementsModal(false);
    setView(AppView.APPLY);
  };

  const handleCloseModal = () => {
    setShowRequirementsModal(false);
  };

  const handleApplicationSubmit = async (appData: Omit<ChurchApplication, 'id'>, password: string) => {
    setNotification(null);
    try {
      // Create Firebase auth account
      const userCredential = await createChurchAccount(appData.applicantEmail, password);
      const userId = userCredential.user.uid;

      // Add userId to application data
      const applicationWithUserId = {
        ...appData,
        userId
      };

      // Submit application to Firestore
      await submitApplication(applicationWithUserId);

      setView(AppView.HOME);
      setNotification({
        message: "Account created and application submitted! You can now log in to manage your profile.",
        type: 'success'
      });
      setTimeout(() => setNotification(null), 7000);
    } catch (error: any) {
      console.error("Error submitting application:", error);
      
      const projectId = getProjectId();
      let errorMessage = "Error submitting application.";
      let details = error.message;

      if (error.code === 'auth/email-already-in-use') {
        errorMessage = "Email Already in Use";
        details = "An account with this email already exists. Please use a different email or sign in.";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "Invalid Email";
        details = "Please provide a valid email address.";
      } else if (error.code === 'auth/weak-password') {
        errorMessage = "Weak Password";
        details = "Password should be at least 6 characters.";
      } else if (error.code === 'permission-denied') {
        errorMessage = "Permission Denied (Security Rules).";
        details = `Ensure your Firestore Rules allow 'create' for public users.\n\nProject ID: ${projectId}`;
      } else if (error.code === 'unavailable') {
        errorMessage = "Network/Service Unavailable.";
        details = "Check your internet connection or firewall.";
      } else if (error.code === 'not-found') {
        errorMessage = "Project/Database Not Found.";
        details = `The Project ID '${projectId}' might be incorrect or the database hasn't been created in the console.`;
      }

      setNotification({
        message: (
          <div>
            <div className="font-bold">{errorMessage}</div>
            <div className="text-xs mt-1 opacity-90">Code: {error.code || 'unknown'}</div>
          </div>
        ),
        type: 'error',
        details: details
      });
    }
  };

  const handleChurchLogin = (userId: string) => {
    setChurchUserId(userId);
    setView(AppView.CHURCH_DASHBOARD);
  };

  const handleChurchLogout = () => {
    setChurchUserId(null);
    setView(AppView.HOME);
  };

  // --- Views ---

  const renderHeader = () => (
    <nav className="bg-white text-gray-900 shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          <div className="flex items-center cursor-pointer" onClick={() => navigateTo(AppView.HOME)}>
             <img 
              src="https://firebasestorage.googleapis.com/v0/b/g3-church-network.firebasestorage.app/o/images%2Fg3_logo.png?alt=media" 
              alt="G3 Church Network" 
              className="h-12 w-auto object-contain" 
            />
          </div>
          
          {/* Desktop Nav */}
          <div className="hidden md:flex space-x-8 items-center">
            <button onClick={() => navigateTo(AppView.MAP)} className="text-gray-700 hover:text-gray-900 font-medium transition flex items-center gap-2">
              <Map className="w-4 h-4" /> Network Map
            </button>
            <button onClick={() => navigateTo(AppView.CHURCH_LOGIN)} className="text-gray-700 hover:text-gray-900 font-medium transition flex items-center gap-2">
              <Church className="w-4 h-4" /> Church Portal
            </button>
            <MainButton variant="primary" onClick={() => navigateTo(AppView.APPLY)} className="py-2 px-4 text-sm">
              Apply Now
            </MainButton>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-md text-gray-600 hover:bg-gray-100">
              {mobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t px-2 pt-2 pb-3 space-y-1 sm:px-3 shadow-lg">
          <button onClick={() => navigateTo(AppView.MAP)} className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-50 text-gray-800 w-full text-left">Network Map</button>
          <button onClick={() => navigateTo(AppView.CHURCH_LOGIN)} className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-50 text-gray-800 w-full text-left">Church Portal</button>
          <button onClick={() => navigateTo(AppView.APPLY)} className="block px-3 py-2 rounded-md text-base font-medium bg-gray-50 text-gray-900 w-full text-left mt-4">Apply Now</button>
        </div>
      )}
    </nav>
  );

  const renderHome = () => (
    <div className="bg-white">
      {/* Hero */}
      <div className="relative bg-black overflow-hidden">
        <div className="absolute inset-0">
          <img 
            className="w-full h-full object-cover opacity-70" 
            src="https://firebasestorage.googleapis.com/v0/b/g3-church-network.firebasestorage.app/o/images%2FChurch-White-Black-G3-scaled.jpeg?alt=media" 
            alt="Congregation" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent mix-blend-multiply" />
        </div>
        <div className="relative max-w-7xl mx-auto py-24 px-4 sm:py-32 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-serif font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            G3 Church Network
          </h1>
          <p className="mt-6 text-xl text-gray-200 max-w-3xl">
            The G3 Church Network is a global fellowship of Reformed Baptist churches committed to sound doctrine, expository preaching, and the sovereignty of God in all things.
          </p>
          <div className="mt-10 flex space-x-4">
            <MainButton onClick={() => navigateTo(AppView.APPLY)}>
              Join the Network
            </MainButton>
            <MainButton 
              variant="outline" 
              className="bg-white text-black border-white hover:bg-gray-100" 
              onClick={() => navigateTo(AppView.MAP)}
            >
              View Map <ArrowRight className="ml-2 w-4 h-4" />
            </MainButton>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-gray-600 font-semibold tracking-wide uppercase">Our Distinctives</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl font-serif">
              Why Join the G3 Network?
            </p>
          </div>

          <div className="mt-10">
            <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-10">
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-black text-white">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Doctrinal Integrity</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  United by the 1689 Second London Baptist Confession of Faith and a commitment to biblical orthodoxy.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-black text-white">
                     <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Global Fellowship</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Connect with like-minded churches around the world for encouragement and partnership.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-black text-white">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-gray-900">Ecclesial Support</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-gray-500">
                  Discounts on resources, conferences, and pastoral support to strengthen local churches.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen font-sans bg-gray-50 flex flex-col">
      {/* Requirements Modal */}
      <RequirementsModal
        isOpen={showRequirementsModal}
        onClose={handleCloseModal}
        onContinue={handleContinueToApplication}
      />

      {/* Notification Toast */}
      {notification && (
        <div 
          className={`fixed top-24 right-4 max-w-sm w-full bg-white shadow-2xl rounded-lg overflow-hidden border-l-4 z-50 animate-in slide-in-from-right duration-300 ${
            notification.type === 'success' ? 'border-green-600' : 'border-red-600'
          }`}
        >
           <div className="p-4 flex items-start">
            <div className="flex-shrink-0">
              {notification.type === 'success' ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
            </div>
            <div className="ml-3 w-0 flex-1 pt-0.5">
              <div className="text-sm font-medium text-gray-900">
                {notification.message}
              </div>
              {notification.details && (
                <p className="mt-1 text-xs text-gray-500 whitespace-pre-wrap break-words">
                  {notification.details}
                </p>
              )}
            </div>
            <div className="ml-4 flex-shrink-0 flex">
              <button
                className="bg-white rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none"
                onClick={() => setNotification(null)}
              >
                <span className="sr-only">Close</span>
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {view !== AppView.MAP && view !== AppView.CHURCH_LOGIN && view !== AppView.CHURCH_DASHBOARD && renderHeader()}
      
      <main className="flex-grow">
        {view === AppView.HOME && renderHome()}
        
        {view === AppView.APPLY && (
          <ApplicationForm 
            onSubmit={handleApplicationSubmit}
            onCancel={() => navigateTo(AppView.HOME)}
          />
        )}
        
        {view === AppView.ADMIN && (
          <AdminDashboard 
            onBack={() => navigateTo(AppView.HOME)}
          />
        )}
        
        {view === AppView.MAP && (
          <WorldMap 
            churches={publicApplications}
            onBack={() => navigateTo(AppView.HOME)}
            onJoinClick={() => navigateTo(AppView.APPLY)}
          />
        )}

        {view === AppView.CHURCH_LOGIN && (
          <ChurchLogin
            onBack={() => navigateTo(AppView.HOME)}
            onLoginSuccess={handleChurchLogin}
          />
        )}

        {view === AppView.CHURCH_DASHBOARD && churchUserId && (
          <ChurchDashboard
            userId={churchUserId}
            onBack={() => navigateTo(AppView.HOME)}
            onLogout={handleChurchLogout}
          />
        )}
      </main>

      {view !== AppView.MAP && view !== AppView.CHURCH_LOGIN && view !== AppView.CHURCH_DASHBOARD && (
        <footer className="bg-black text-white py-12">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <div className="font-serif text-2xl font-bold mb-4">G3 Church Network</div>
            <p className="text-gray-400 mb-2">© {new Date().getFullYear()} G3 Ministries. All rights reserved.</p>
            <button 
              onClick={() => navigateTo(AppView.ADMIN)} 
              className="text-gray-500 hover:text-gray-300 text-sm transition flex items-center gap-1 justify-center mx-auto"
            >
              <Lock className="w-3 h-3" /> Admin
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};

export default App;
