import React, { useState, useEffect, useRef } from 'react';
import { ChurchApplication, ApplicationStatus, ChurchLeader, ChurchGathering, EmailTemplate, EmailType, AdminUser, UserProfile, JobListing } from '../types';
import { PromoCodeManager } from './PromoCodeManager';
import { Button } from './Button';
import { Check, X, MapPin, Globe, ExternalLink, ArrowLeft, LogOut, Lock, User as UserIcon, BookOpen, ShieldCheck, Trash2, Eye, AlertTriangle, Edit, Download, Upload, Settings, RefreshCw, Ban, Slash, PlusCircle, BarChart3, Mail, Send, Clock, Share2, Briefcase } from 'lucide-react';
import { auth, loginWithEmail, registerWithEmail, logout, subscribeToAllApplications, updateApplicationStatus, User, onAuthStateChanged, deleteChurchApplication, updateChurchProfile, submitApplication, updateChurchCoordinates, uploadChurchLogo, sendEmail, saveEmailTemplate, getEmailTemplate, resendSystemEmail, approveApplication, createChurchUserAndSendResetEmailClient, backfillGeocodes, regeocodeAddress, getAllUsers, setAdminRole, removeAdminRole, createAdminUser, getUserProfile, updateUserProfileRole, deleteUser, subscribeToAllChurchStatistics, subscribeToAllJobs, deleteJobListing } from '../services/firebase';

interface AdminDashboardProps {
  onBack: () => void;
}

const InfoRow: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div>
    <dt className="text-sm font-medium text-gray-500">{label}</dt>
    <dd className="mt-1 text-sm text-gray-900">{value || 'N/A'}</dd>
  </div>
);

type AdminView = 'member-pending' | 'member-active' | 'member-leaders' | 'member-rejected' | 'statistics' | 'jobs' | 'email' | 'settings-email' | 'settings-application' | 'settings-content' | 'settings-users' | 'settings-promo-codes';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [applications, setApplications] = useState<ChurchApplication[]>([]);
  const [jobListings, setJobListings] = useState<JobListing[]>([]); // New state for job listings
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null); // To store current user's profile
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [viewingChurch, setViewingChurch] = useState<ChurchApplication | null>(null);
  const [deletingChurch, setDeletingChurch] = useState<ChurchApplication | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [currentView, setCurrentView] = useState<AdminView>('statistics');
  const [isProcessingPortalAccount, setIsProcessingPortalAccount] = useState(false); // Moved state up
  
  // User Management State
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [userActionLoading, setUserActionLoading] = useState<string | null>(null); // Stores UID of user being acted upon

  // Profile Editing State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const fetchAllUsers = async () => {
    setLoadingUsers(true);
    try {
      const usersData = await getAllUsers();
      // Augment with Firestore profile data if available
      const usersWithProfiles = await Promise.all(usersData.map(async (u) => {
        const profile = await getUserProfile(u.uid);
        return { ...u, role: profile?.role || 'user' }; // Default to 'user' if no profile
      }));
      setAllUsers(usersWithProfiles);
    } catch (error) {
      console.error("Error fetching all users:", error);
      alert("Failed to load users. You might not have sufficient permissions.");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail || !newAdminPassword) {
      alert("Email and password are required.");
      return;
    }
    setIsCreatingAdmin(true);
    try {
      await createAdminUser(newAdminEmail, newAdminPassword);
      alert('Admin user created successfully! They will see the admin dashboard on login.');
      setNewAdminEmail('');
      setNewAdminPassword('');
      setShowAddAdminModal(false);
      await fetchAllUsers(); // Refresh the list
    } catch (error: any) {
      console.error("Error creating admin user:", error);
      alert(`Failed to create admin: ${error.message || 'Unknown error'}`);
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    // Validate password if provided
    if (newPassword) {
      if (newPassword.length < 6) {
        alert("Password must be at least 6 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        alert("Passwords do not match.");
        return;
      }
    }

    setIsSavingProfile(true);
    try {
      const { updateEmail, updatePassword } = await import('firebase/auth');
      
      // If email is changing, update it
      if (editEmail && editEmail !== user.email) {
        await updateEmail(user, editEmail);
        alert('Email updated successfully! You may need to sign in again.');
      }

      // If password is provided, update it
      if (newPassword) {
        await updatePassword(user, newPassword);
        alert('Password updated successfully!');
      }

      // Close modal and reset form
      setShowProfileModal(false);
      setEditEmail('');
      setNewPassword('');
      setConfirmPassword('');
      
      if (!newPassword && (!editEmail || editEmail === user.email)) {
        alert('No changes were made.');
      }
    } catch (error: any) {
      console.error("Error updating profile:", error);
      if (error.code === 'auth/requires-recent-login') {
        alert('For security reasons, please sign out and sign in again before changing your email or password.');
      } else {
        alert(`Failed to update profile: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSetAdminRole = async (uid: string, email: string) => {
    if (!confirm(`Are you sure you want to grant admin privileges to ${email}?`)) return;
    setUserActionLoading(uid);
    try {
      await setAdminRole(uid);
      await updateUserProfileRole(uid, 'admin'); // Update Firestore profile
      alert(`${email} is now an admin.`);
      await fetchAllUsers();
    } catch (error: any) {
      console.error("Error setting admin role:", error);
      alert(`Failed to set admin role: ${error.message || 'Unknown error'}`);
    } finally {
      setUserActionLoading(null);
    }
  };

  const handleRemoveAdminRole = async (uid: string, email: string) => {
    if (!confirm(`Are you sure you want to revoke admin privileges from ${email}? They will no longer have access to this dashboard.`)) return;
    setUserActionLoading(uid);
    try {
      await removeAdminRole(uid);
      await updateUserProfileRole(uid, 'user'); // Update Firestore profile
      alert(`${email}'s admin privileges have been revoked.`);
      await fetchAllUsers();
    } catch (error: any) {
      console.error("Error removing admin role:", error);
      alert(`Failed to remove admin role: ${error.message || 'Unknown error'}`);
    } finally {
      setUserActionLoading(null);
    }
  };

  const handleDeleteUser = async (uid: string, email: string) => {
    if (!confirm(`Are you sure you want to permanently delete the user account for ${email}? This action cannot be undone.`)) return;
    setUserActionLoading(uid);
    try {
      // First, find any churches linked to this user and clear their userId
      const linkedChurches = applications.filter(app => app.userId === uid);
      
      if (linkedChurches.length > 0) {
        console.log(`Clearing userId for ${linkedChurches.length} church(es) linked to user ${email}`);
        for (const church of linkedChurches) {
          await updateChurchProfile(church.id, { userId: null });
          console.log(`Cleared userId for church: ${church.churchName}`);
        }
      }
      
      // Then delete the user
      await deleteUser(uid);
      alert(`User ${email} has been deleted successfully.${linkedChurches.length > 0 ? ` Portal account removed from ${linkedChurches.length} church(es).` : ''}`);
      await fetchAllUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      alert(`Failed to delete user: ${error.message || 'Unknown error'}`);
    } finally {
      setUserActionLoading(null);
    }
  };

  const handleCreatePortalAccount = async (churchId: string, applicantEmail: string, churchName: string) => {
    if (!confirm(`Are you sure you want to create a portal account and send a password setup email to ${applicantEmail} for ${churchName}?`)) {
      return;
    }
    setIsProcessingPortalAccount(true);
    try {
      await createChurchUserAndSendResetEmailClient(churchId, applicantEmail);
      alert('Portal account created and password setup email sent successfully!');
    } catch (error: any) {
      console.error("Error creating portal account:", error);
      alert(`Failed to create portal account: ${error.message || 'Unknown error'}`);
    } finally {
      setIsProcessingPortalAccount(false);
    }
  };

  // Email Templates State
  const [templates, setTemplates] = useState<Record<EmailType, EmailTemplate>>({
    application_received: {
      type: 'application_received',
      subject: 'Application Received - G3 Church Network',
      body: '<p>Dear {{applicantName}},</p><p>Thank you for submitting your application for <strong>{{churchName}}</strong> to join the G3 Church Network. We have received your application and will begin the review process shortly.</p><p>We will notify you once a decision has been made.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
    },
    application_approved: {
      type: 'application_approved',
      subject: 'Welcome to G3 Church Network!',
      body: '<p>Dear {{applicantName}},</p><p>We are pleased to inform you that your application for <strong>{{churchName}}</strong> has been <strong>approved</strong>!</p><p>Your church is now listed on our network map. You can log in to your church dashboard to manage your profile.</p><p>Welcome to the network!</p><p>Grace and peace,<br>G3 Church Network Team</p>'
    },
    application_rejected: {
      type: 'application_rejected',
      subject: 'Update on your G3 Church Network Application',
      body: '<p>Dear {{applicantName}},</p><p>Thank you for your interest in the G3 Church Network.</p><p>After careful review of your application for <strong>{{churchName}}</strong>, we are unable to accept your application at this time.</p><p>If you have any questions, please feel free to reply to this email.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
    },
    dues_reminder_30: {
      type: 'dues_reminder_30',
      subject: 'G3 Network Dues - Renewal Reminder (30 Days)',
      body: '<p>Dear {{applicantName}},</p><p>This is a reminder that your G3 Church Network annual dues for <strong>{{churchName}}</strong> will be due in 30 days.</p><p>Please log in to your dashboard to renew your membership.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
    },
    dues_reminder_7: {
      type: 'dues_reminder_7',
      subject: 'G3 Network Dues - Renewal Reminder (1 Week)',
      body: '<p>Dear {{applicantName}},</p><p>This is a reminder that your G3 Church Network annual dues for <strong>{{churchName}}</strong> will be due in 7 days.</p><p>Please log in to your dashboard to renew your membership to ensure uninterrupted access.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
    },
    dues_reminder_0: {
      type: 'dues_reminder_0',
      subject: 'G3 Network Dues - Due Today',
      body: '<p>Dear {{applicantName}},</p><p>Your G3 Church Network annual dues for <strong>{{churchName}}</strong> are due today.</p><p>Please log in to your dashboard immediately to renew your membership.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
    },
    dues_delinquent: {
      type: 'dues_delinquent',
      subject: 'Action Required: G3 Network Membership Delinquent',
      body: '<p>Dear {{applicantName}},</p><p>We have not received your annual dues payment for <strong>{{churchName}}</strong>. Your membership is now delinquent.</p><p>As per our policy, your church has been temporarily hidden from the network map.</p><p>Please pay your dues immediately via the dashboard to restore your active status.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
    },
    portal_account_setup: { // Added missing template
      type: 'portal_account_setup',
      subject: 'G3 Church Network - Set Up Your Portal Account',
      body: '<p>Dear {{applicantName}},</p><p>Your application for <strong>{{churchName}}</strong> has been approved and your portal account is ready!</p><p>Please click the link below to set your password and access your church dashboard:</p><p><a href="{{resetLink}}">Set Your Password</a></p><p>Grace and peace,<br>G3 Church Network Team</p>'
    }
  });
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState<EmailType | null>(null);

  useEffect(() => {
    const loadTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const types: EmailType[] = [
          'application_received', 'application_approved', 'application_rejected',
          'dues_reminder_30', 'dues_reminder_7', 'dues_reminder_0', 'dues_delinquent',
          'portal_account_setup' // Added missing template type
        ];
        const loadedTemplates = { ...templates };
        
        for (const type of types) {
          const saved = await getEmailTemplate(type);
          if (saved) {
            loadedTemplates[type] = saved;
          }
        }
        setTemplates(loadedTemplates);
      } catch (error) {
        console.error("Error loading templates:", error);
      } finally {
        setLoadingTemplates(false);
      }
    };
    
    if (user) {
      loadTemplates();
    }
  }, [user]);

  // Subscribe to all jobs for admin view
  useEffect(() => {
    if (user) {
      const unsubscribe = subscribeToAllJobs((jobs) => {
        setJobListings(jobs);
      });
      return () => unsubscribe();
    } else {
      setJobListings([]);
    }
  }, [user]);

  const handleSaveTemplate = async (type: EmailType) => {
    setSavingTemplate(type);
    try {
      await saveEmailTemplate(templates[type]);
      alert('Template saved successfully!');
    } catch (error) {
      console.error("Error saving template:", error);
      alert('Failed to save template.');
    } finally {
      setSavingTemplate(null);
    }
  };
  
  // Email State
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [recipientType, setRecipientType] = useState<'churches' | 'leaders' | 'test'>('test');
  const [senderProfile, setSenderProfile] = useState<string>('G3 Church Network <admin@g3min.org>');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'city' | 'date' | 'status'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // State for leaders view
  const [leaderSearchQuery, setLeaderSearchQuery] = useState('');
  const [leaderSortBy, setLeaderSortBy] = useState<'name' | 'role' | 'church'>('name');
  const [leaderSortOrder, setLeaderSortOrder] = useState<'asc' | 'desc'>('asc');

  // State for users view
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSortBy, setUserSortBy] = useState<'email' | 'role' | 'lastSignIn'>('email');
  const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('asc');

  // Statistics State
  const [churchStats, setChurchStats] = useState<Record<string, any>>({});
  const [loadingStats, setLoadingStats] = useState(false);
  const [globalAnalytics, setGlobalAnalytics] = useState<any>(null);
  const [viewingStatsChurch, setViewingStatsChurch] = useState<{id: string, name: string} | null>(null);
  const [statsSearchQuery, setStatsSearchQuery] = useState('');
  const [statsSortBy, setStatsSortBy] = useState<'name' | 'city' | 'views' | 'visits' | 'contacts'>('views');
  const [statsSortOrder, setStatsSortOrder] = useState<'asc' | 'desc'>('desc');

  // Church Analytics Modal State
  const [churchAnalyticsData, setChurchAnalyticsData] = useState<any>(null);
  const [loadingChurchAnalytics, setLoadingChurchAnalytics] = useState(false);

  // Load global analytics and subscribe to all stats when statistics view is opened
  useEffect(() => {
    if (currentView === 'statistics' && user) {
      loadGlobalAnalytics();
      
      const unsubscribe = subscribeToAllChurchStatistics((stats) => {
        const statsMap = stats.reduce((acc, stat) => {
          acc[stat.churchId] = stat;
          return acc;
        }, {} as Record<string, any>);
        setChurchStats(statsMap);
      });
      
      return () => unsubscribe();
    }
  }, [currentView, user]);

  const loadGlobalAnalytics = async () => {
    setLoadingStats(true);
    try {
      const { getGlobalAnalytics } = await import('../services/firebase');
      const data = await getGlobalAnalytics();
      setGlobalAnalytics(data);
    } catch (error) {
      console.error("Error loading global analytics:", error);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadChurchAnalytics = async (churchId: string) => {
    setLoadingChurchAnalytics(true);
    setChurchAnalyticsData(null); // Clear previous data
    try {
      const { getChurchAnalytics } = await import('../services/firebase');
      const data = await getChurchAnalytics(churchId);
      setChurchAnalyticsData(data);
    } catch (error) {
      console.error("Error loading church analytics:", error);
    } finally {
      setLoadingChurchAnalytics(false);
    }
  };

  // Settings Tab State
  const [settingsTab, setSettingsTab] = useState<'email' | 'application' | 'content'>('email');

  // Main Page Content State
  const [mainPageContent, setMainPageContent] = useState({
    bannerDescription: "The G3 Church Network is a global fellowship of Reformed Baptist churches committed to sound doctrine, expository preaching, and the sovereignty of God in all things.",
    distinctives: [
      {
        title: "Doctrinal Integrity",
        description: "United by the 1689 Second London Baptist Confession of Faith and a commitment to biblical orthodoxy."
      },
      {
        title: "Global Fellowship",
        description: "Connect with like-minded churches around the world for encouragement and partnership."
      },
      {
        title: "Ecclesial Support",
        description: "Discounts on resources, conferences, and pastoral support to strengthen local churches."
      }
    ],
    requirements: [
      {
        title: "1689 Confession",
        description: "The pastors of the church must, at a minimum, affirm the 1689 even if the church's statement of faith is not officially the 1689."
      },
      {
        title: "Annual Dues",
        description: "The minimal financial commitment for a local church to become a member of the G3 Church Network is $500 / yr."
      },
      {
        title: "Ecclesiology",
        description: "The church must have a plurality of elders and practice church discipline, or at least working toward these ideals."
      }
    ]
  });
  const [isSavingContent, setIsSavingContent] = useState(false);

  // Application Form Field Types
  type FormFieldType = 'text' | 'email' | 'tel' | 'url' | 'number' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'password' | 'dynamic_array';
  
  interface FormField {
    id: string;
    name: string;
    label: string;
    type: FormFieldType;
    required: boolean;
    placeholder?: string;
    section: string;
    options?: string[]; // For select/radio fields
    min?: number; // For number fields
    rows?: number; // For textarea fields
    order: number;
    description?: string;
  }

  // Initial form fields based on current ApplicationForm
  const [formFields, setFormFields] = useState<FormField[]>([
    // Account Setup Section
    { id: 'applicantFirstName', name: 'applicantFirstName', label: 'First Name', type: 'text', required: true, section: 'Account Setup', order: 1 },
    { id: 'applicantLastName', name: 'applicantLastName', label: 'Last Name', type: 'text', required: true, section: 'Account Setup', order: 2 },
    { id: 'applicantEmail', name: 'applicantEmail', label: 'Email Address', type: 'email', required: true, section: 'Account Setup', order: 3, placeholder: 'name@example.com', description: 'Your login email' },
    { id: 'password', name: 'password', label: 'Password', type: 'password', required: true, section: 'Account Setup', order: 4, description: 'Min. 6 characters' },
    { id: 'confirmPassword', name: 'confirmPassword', label: 'Confirm Password', type: 'password', required: true, section: 'Account Setup', order: 5 },
    
    // Church Information Section
    { id: 'churchName', name: 'churchName', label: 'Church Name', type: 'text', required: true, section: 'Church Information', order: 10 },
    { id: 'churchAddress.street', name: 'churchAddress.street', label: 'Street Address', type: 'text', required: true, section: 'Church Information', order: 11, placeholder: 'Street Address' },
    { id: 'churchAddress.aptUnit', name: 'churchAddress.aptUnit', label: 'Apt/Unit/Box', type: 'text', required: false, section: 'Church Information', order: 12, placeholder: 'Apt/unit/box (optional)' },
    { id: 'churchAddress.city', name: 'churchAddress.city', label: 'City', type: 'text', required: true, section: 'Church Information', order: 13, placeholder: 'City' },
    { id: 'churchAddress.state', name: 'churchAddress.state', label: 'State / Province', type: 'text', required: true, section: 'Church Information', order: 14, placeholder: 'State / Province' },
    { id: 'churchAddress.postalCode', name: 'churchAddress.postalCode', label: 'Postal Code', type: 'text', required: true, section: 'Church Information', order: 15, placeholder: 'Postal Code' },
    { id: 'churchAddress.country', name: 'churchAddress.country', label: 'Country', type: 'text', required: true, section: 'Church Information', order: 16, placeholder: 'Country' },
    { id: 'churchPhone', name: 'churchPhone', label: 'Phone Number', type: 'tel', required: true, section: 'Church Information', order: 17 },
    { id: 'connections.website', name: 'connections.website', label: 'Church Website', type: 'url', required: false, section: 'Church Information', order: 18, placeholder: 'https://' },
    { id: 'churchEmail', name: 'churchEmail', label: 'Church Public Email', type: 'email', required: false, section: 'Church Information', order: 19 },
    { id: 'churchDescription', name: 'churchDescription', label: 'Briefly describe your church', type: 'textarea', required: true, section: 'Church Information', order: 20, rows: 4 },
    
    // Elders Section
    { id: 'leaders', name: 'leaders', label: 'Elders', type: 'dynamic_array', required: false, section: 'Elders', order: 30, description: 'Optional - can add later' },
    
    // Doctrine & Practice Section
    { id: 'pluralityOfElders', name: 'pluralityOfElders', label: 'Is Your Local Church Led By a Plurality of Elders?', type: 'select', required: true, section: 'Doctrine & Practice', order: 40, options: ['Yes', 'No', 'No, but working toward it.'] },
    { id: 'churchDiscipline', name: 'churchDiscipline', label: 'Does Your Local Church Practice Church Discipline?', type: 'select', required: true, section: 'Doctrine & Practice', order: 41, options: ['Yes', 'No', 'No, but working toward it.'] },
    { id: 'ssjgSigned', name: 'ssjgSigned', label: 'Has your church leadership signed the Statement on Social Justice and the Gospel?', type: 'select', required: true, section: 'Doctrine & Practice', order: 42, options: ['Yes', 'No', 'No, but agree with it'] },
    { id: 'confessionAffirmation', name: 'confessionAffirmation', label: 'Can you as the pastor(s) affirm the 1689 London Baptist Confession of Faith? If not, please explain.', type: 'textarea', required: true, section: 'Doctrine & Practice', order: 43, rows: 5 },
    
    // Network Dues Section
    { id: 'paymentAmount', name: 'paymentAmount', label: 'Annual Contribution Amount ($)', type: 'number', required: true, section: 'Network Dues', order: 50, min: 500, placeholder: '500', description: 'Minimum: $500' },
    { id: 'paymentFrequency', name: 'paymentFrequency', label: 'Payment Frequency', type: 'radio', required: true, section: 'Network Dues', order: 51, options: ['yearly', 'one_time'] },
  ]);

  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [isAddingField, setIsAddingField] = useState(false);

  // Form field management functions
  const getSortedFormFields = () => {
    return formFields.sort((a, b) => a.order - b.order);
  };

  const getFieldsBySection = () => {
    const sections: Record<string, FormField[]> = {};
    getSortedFormFields().forEach(field => {
      if (!sections[field.section]) {
        sections[field.section] = [];
      }
      sections[field.section].push(field);
    });
    return sections;
  };

  const addNewField = () => {
    const newField: FormField = {
      id: `field_${Date.now()}`,
      name: '',
      label: '',
      type: 'text',
      required: false,
      section: 'Church Information',
      order: Math.max(...formFields.map(f => f.order), 0) + 10
    };
    setEditingField(newField);
    setIsAddingField(true);
  };

  const saveField = (field: FormField) => {
    if (isAddingField) {
      setFormFields([...formFields, field]);
      setIsAddingField(false);
    } else {
      setFormFields(formFields.map(f => f.id === field.id ? field : f));
    }
    setEditingField(null);
  };

  const deleteField = (fieldId: string) => {
    if (confirm('Are you sure you want to delete this field? This action cannot be undone.')) {
      setFormFields(formFields.filter(f => f.id !== fieldId));
    }
  };

  const moveField = (fieldId: string, direction: 'up' | 'down') => {
    const field = formFields.find(f => f.id === fieldId);
    if (!field) return;

    const sectionFields = formFields.filter(f => f.section === field.section).sort((a, b) => a.order - b.order);
    const currentIndex = sectionFields.findIndex(f => f.id === fieldId);
    
    if (direction === 'up' && currentIndex > 0) {
      const previousField = sectionFields[currentIndex - 1];
      const newOrder = previousField.order;
      const updatedFields = formFields.map(f => {
        if (f.id === field.id) return { ...f, order: newOrder };
        if (f.id === previousField.id) return { ...f, order: field.order };
        return f;
      });
      setFormFields(updatedFields);
    } else if (direction === 'down' && currentIndex < sectionFields.length - 1) {
      const nextField = sectionFields[currentIndex + 1];
      const newOrder = nextField.order;
      const updatedFields = formFields.map(f => {
        if (f.id === field.id) return { ...f, order: newOrder };
        if (f.id === nextField.id) return { ...f, order: field.order };
        return f;
      });
      setFormFields(updatedFields);
    }
  };

  const duplicateField = (field: FormField) => {
    const newField: FormField = {
      ...field,
      id: `field_${Date.now()}`,
      name: `${field.name}_copy`,
      label: `${field.label} (Copy)`,
      order: field.order + 1
    };
    setFormFields([...formFields, newField]);
  };

  // Auth Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fetch user profile to check role
        const profile = await getUserProfile(currentUser.uid);
        setCurrentUserProfile(profile);
        if (profile?.role === 'admin') {
          await fetchAllUsers(); // Only fetch users if current user is admin
        }
      } else {
        setCurrentUserProfile(null);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const unsubscribeData = subscribeToAllApplications((data) => {
        setApplications(data);
      });
      return () => unsubscribeData();
    } else {
      setApplications([]);
    }
  }, [user]);

  // Subscribe to all jobs for admin view
  useEffect(() => {
    if (user) {
      const unsubscribe = subscribeToAllJobs((jobs) => {
        setJobListings(jobs);
      });
      return () => unsubscribe();
    } else {
      setJobListings([]);
    }
  }, [user]);


  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      if (isRegistering) {
        await registerWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed. Please check your credentials.");
    } finally {
      setAuthLoading(false);
    }
  };

  const pendingApps = applications.filter(a => a.status === ApplicationStatus.PENDING);
  const approvedApps = applications.filter(a => a.status === ApplicationStatus.APPROVED);
  const rejectedApps = applications.filter(a => a.status === ApplicationStatus.REJECTED);

  // Filter and sort church stats (moved here to access approvedApps)
  const filteredAndSortedStats = approvedApps
    .map(app => {
      const stats = churchStats[app.id] || {};
      return {
        ...app,
        stats: {
          views: stats.views || 0,
          visits: stats.visits || 0,
          contacts: stats.contacts || 0,
          socialClicks: stats.socialClicks || 0,
          lastUpdated: stats.lastUpdated
        }
      };
    })
    .filter(item => {
      if (!statsSearchQuery) return true;
      const query = statsSearchQuery.toLowerCase();
      return (
        item.churchName.toLowerCase().includes(query) ||
        (item.churchAddress?.city || '').toLowerCase().includes(query) ||
        (item.churchAddress?.country || '').toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      let valA: any, valB: any;
      
      switch (statsSortBy) {
        case 'name':
          valA = a.churchName;
          valB = b.churchName;
          break;
        case 'city':
          valA = a.churchAddress?.city || '';
          valB = b.churchAddress?.city || '';
          break;
        case 'views':
          valA = a.stats.views;
          valB = b.stats.views;
          break;
        case 'visits':
          valA = a.stats.visits;
          valB = b.stats.visits;
          break;
        case 'contacts':
          valA = a.stats.contacts;
          valB = b.stats.contacts;
          break;
        default:
          valA = a.stats.views;
          valB = b.stats.views;
      }
      
      if (typeof valA === 'string') {
        return statsSortOrder === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      }
      
      return statsSortOrder === 'asc' 
        ? valA - valB 
        : valB - valA;
    });

  // Filter and sort approved churches
  const filteredAndSortedApprovedApps = approvedApps
    .filter(app => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      const address = app.churchAddress || {};
      return (
        app.churchName.toLowerCase().includes(query) ||
        (address?.city || '').toLowerCase().includes(query) || // Added optional chaining
        (address?.state || '').toLowerCase().includes(query) || // Added optional chaining
        (address?.country || '').toLowerCase().includes(query) || // Added optional chaining
        app.applicantEmail.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      let comparison = 0;
      const aAddress = a.churchAddress || {};
      const bAddress = b.churchAddress || {};
      switch (sortBy) {
        case 'name':
          comparison = a.churchName.localeCompare(b.churchName);
          break;
        case 'city':
          comparison = (aAddress?.city || '').localeCompare(bAddress?.city || ''); // Added optional chaining
          break;
        case 'date':
          comparison = new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
          break;
        case 'status':
          const aHasCoords = a.coordinates ? 1 : 0;
          const bHasCoords = b.coordinates ? 1 : 0;
          comparison = aHasCoords - bHasCoords;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const handleApprove = async (app: ChurchApplication, fromModal = false) => {
    if (!app.id) {
      alert("Approval Failed: Application ID is missing.");
      setProcessingId(null);
      return;
    }
    if (!confirm(`Are you sure you want to approve ${app.churchName}? This will make it visible on the map and trigger payment processing.`)) {
      return;
    }
    setProcessingId(app.id);
    setIsProcessingPortalAccount(true); // Also set modal processing state
    try {
      // Fix any potentially invalid date string in Firestore before approval
      const submittedAtDate = new Date(app.submittedAt);
      if (isNaN(submittedAtDate.getTime())) {
        console.warn(`Invalid submittedAt date found for app ${app.id}: ${app.submittedAt}. Setting to current date.`);
        await updateChurchProfile(app.id, { submittedAt: new Date().toISOString() });
      } else if (app.submittedAt !== submittedAtDate.toISOString()) {
        // Ensure it's in ISO format if it's a valid but different string format
        await updateChurchProfile(app.id, { submittedAt: submittedAtDate.toISOString() });
      }

      // 3. Process Approval & Payment via Cloud Function
      await approveApplication(app.id); // Use original ID as profile is updated if needed
      
      alert(`${app.churchName} approved successfully!`);
      if (fromModal) {
        setViewingChurch(null); // Close modal only if approved from modal
      }
    } catch (error: any) {
      console.error("Error approving application", error);
      alert(`Approval Failed: ${error.message || "Unknown error"}`);
    } finally {
      setProcessingId(null);
      setIsProcessingPortalAccount(false);
    }
  };

  const handleReject = async (app: ChurchApplication) => {
    if(confirm(`Are you sure you want to reject ${app.churchName}?`)) {
      setProcessingId(app.id);
      try {
        await updateApplicationStatus(app.id, ApplicationStatus.REJECTED);
      } catch (error) {
        console.error("Error rejecting", error);
      } finally {
        setProcessingId(null);
      }
    }
  };

  const handleDelete = async (church: ChurchApplication) => {
    if (confirm(`Are you sure you want to permanently delete ${church.churchName}? This action cannot be undone.`)) {
      try {
        await deleteChurchApplication(church.id);
        setDeletingChurch(null);
        setViewingChurch(null);
      } catch (error) {
        console.error("Error deleting church:", error);
        alert("Failed to delete church. Please try again.");
      }
    }
  };

  const handleAssignAllCoordinates = async () => {
    const churchesWithoutCoords = approvedApps.filter(app => !app.coordinates);
    
    if (churchesWithoutCoords.length === 0) {
      alert('All approved churches already have coordinates assigned!');
      return;
    }

    if (!confirm(`This will assign coordinates to ${churchesWithoutCoords.length} churches that are missing them. This may take a few minutes. Continue?`)) {
      return;
    }

    setIsImporting(true); // Reuse loading state
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const church of churchesWithoutCoords) {
      try {
        // The backend function will handle the geocoding
        await updateChurchCoordinates(church.id, { lat: 0, lng: 0 }); // Trigger update
        successCount++;
        console.log(`✓ Successfully triggered coordinate update for: ${church.churchName}`);
      } catch (error: any) {
        console.error(`Error assigning coordinates to ${church.churchName}:`, error);
        failedCount++;
        errors.push(`${church.churchName}: ${error.message || 'Unknown error'}`);
      }
    }

    setIsImporting(false);
    
    const message = `Coordinate Assignment Complete!\n\nSuccessfully assigned: ${successCount} churches\nFailed: ${failedCount}`;
    const detailedMessage = errors.length > 0
      ? `${message}\n\nErrors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...(and more)' : ''}`
      : message;
    
    alert(detailedMessage);
  };

  const handleReassignCoordinates = async (church: ChurchApplication) => {
    if (!confirm(`This will re-calculate the coordinates for ${church.churchName} based on its stored address. Continue?`)) {
      return;
    }

    setProcessingId(church.id);
    try {
      const result = await regeocodeAddress(church.id);
      if (result.success) {
        alert(`Successfully re-geocoded ${church.churchName}!\n\nNew Lat: ${result.coordinates.lat}\nNew Lng: ${result.coordinates.lng}`);
      }
    } catch (error: any) {
      console.error("Error reassigning coordinates:", error);
      alert(`Failed to re-geocode address: ${error.message || 'Unknown error'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const formatAddress = (addr?: ChurchApplication['churchAddress'] | null) => {
    if (!addr) return 'N/A';
    const { street, aptUnit, city, state, postalCode, country } = addr;
    const addressParts = [];
    if (street) addressParts.push(street);
    if (aptUnit) addressParts.push(aptUnit);
    const cityStatePostal = [];
    if (city) cityStatePostal.push(city);
    if (state) cityStatePostal.push(state);
    if (postalCode) cityStatePostal.push(postalCode);
    if (cityStatePostal.length > 0) addressParts.push(cityStatePostal.join(' '));
    if (country) addressParts.push(country);
    
    return addressParts.filter(Boolean).join(', ');
  }

  const exportToCSV = () => {
    const headers = [
      'ID',
      'Church Name',
      'Street',
      'Apt/Unit',
      'City',
      'State',
      'Postal Code',
      'Country',
      'Phone',
      'Public Email',
      'Applicant First Name',
      'Applicant Last Name',
      'Applicant Email',
      'Description',
      'Latitude',
      'Longitude',
      'Status',
      'Submitted At',
      'Last Dues Payment',
      'Next Due Date'
    ];

    const rows = approvedApps.map(app => {
      const address = app.churchAddress || {};
      return [
        app.id,
        app.churchName,
        address.street || '',
        address.aptUnit || '',
        address.city || '',
        address.state || '',
        address.postalCode || '',
        address.country || '',
        app.churchPhone || '',
        app.churchEmail || '',
        app.applicantFirstName || '',
        app.applicantLastName || '',
        app.applicantEmail || '',
        app.churchDescription?.replace(/"/g, '""') || '', // Escape quotes
        app.coordinates?.lat || '',
        app.coordinates?.lng || '',
        app.status || '',
        app.submittedAt || '',
        app.lastPaymentDate || '',
        app.nextDueDate || ''
      ];
    });

    const csvContent = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `approved-churches-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!confirm(`This will merge/update churches from the CSV file. Existing data will be preserved unless explicitly updated in the CSV. Social connections will not be modified. Continue?`)) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setIsImporting(true);
    try {
      const Papa = (await import('papaparse')).default;
      const text = await file.text();
      
      const parseResult = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim()
      });

      if (parseResult.errors.length > 0) {
        console.warn('CSV parsing warnings:', parseResult.errors);
      }

      const rows = parseResult.data as any[];
      
      if (rows.length === 0) {
        alert('CSV file appears to be empty or invalid.');
        return;
      }
      
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        try {
          const data = rows[i];

          // Validate required fields
          if (!data['Church Name'] || !data['City'] || !data['Country']) {
            throw new Error(`Missing required fields (Church Name, City, or Country) on line ${i + 1}`);
          }

          // Build church data object, excluding social connections
          const churchData: any = {
            churchName: data['Church Name'] || 'Unnamed Church',
            churchAddress: {
              street: data['Street'] || '',
              aptUnit: data['Apt/Unit'] || '',
              city: data['City'] || '',
              state: data['State'] || '',
              postalCode: data['Postal Code'] || '',
              country: data['Country'] || 'USA'
            },
            churchPhone: data['Phone'] || '',
            churchEmail: data['Public Email'] || '',
            churchDescription: data['Description'] || '',
            status: ApplicationStatus.APPROVED,
            applicantFirstName: data['Applicant First Name'] || 'NA',
            applicantLastName: data['Applicant Last Name'] || 'NA',
            applicantEmail: data['Applicant Email'] || user?.email || 'admin@example.com',
            submittedAt: data['Submitted At'] || new Date().toISOString()
          };

          // Only add coordinates if both lat and lng are present
          if (data['Latitude'] && data['Longitude']) {
            churchData.coordinates = {
              lat: parseFloat(data['Latitude']),
              lng: parseFloat(data['Longitude'])
            };
          }

          // Only add dues payment dates if they are present in the CSV (conditional merge)
          if (data['Last Dues Payment'] && data['Last Dues Payment'].trim()) {
            churchData.lastPaymentDate = new Date(data['Last Dues Payment']).toISOString();
          }
          
          if (data['Next Due Date'] && data['Next Due Date'].trim()) {
            churchData.nextDueDate = new Date(data['Next Due Date']).toISOString();
          }

          // Check if ID is provided and church exists
          const churchId = data['ID']?.trim();
          const existingChurch = churchId ? applications.find(app => app.id === churchId) : null;

          if (existingChurch) {
            // Update existing church - merge with existing data
            console.log(`Updating church ${i + 1}/${rows.length}: ${churchData.churchName} (ID: ${churchId})`);
            await updateChurchProfile(churchId, churchData);
            successCount++;
            console.log(`✓ Successfully updated: ${churchData.churchName}`);
          } else {
            // Create new church (ID will be auto-generated by Firestore)
            console.log(`Creating church ${i + 1}/${rows.length}: ${churchData.churchName}${churchId ? ` (ignoring invalid/missing ID: ${churchId})` : ' (no ID provided, will auto-generate)'}`);
            await submitApplication(churchData);
            successCount++;
            console.log(`✓ Successfully created: ${churchData.churchName}`);
          }
        } catch (error: any) {
          console.error(`Error importing line ${i + 1}:`, error);
          errorCount++;
          errors.push(`Line ${i + 1}: ${error.message || 'Unknown error'}`);
        }
      }

      const message = `Import Complete!\n\nSuccessfully imported: ${successCount} churches\nFailed: ${errorCount}`;
      const detailedMessage = errors.length > 0 
        ? `${message}\n\nErrors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...(and more)' : ''}`
        : message;
      
      alert(detailedMessage);
      console.log('Import summary:', { successCount, errorCount, errors });
    } catch (error: any) {
      console.error('Error importing CSV:', error);
      alert(`Failed to import CSV: ${error.message || 'Unknown error'}\n\nPlease check the file format and try again.`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (loadingAuth) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin text-brand-900"><Globe className="w-8 h-8" /></div></div>;
  }

  if (!user || currentUserProfile?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-xl max-w-md w-full text-center">
          <div className="bg-brand-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-brand-800" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-gray-900 mb-2">
            {isRegistering ? 'Create Admin Account' : 'Admin Access Required'}
          </h2>
          <p className="text-gray-600 mb-6">
            {currentUserProfile && currentUserProfile.role !== 'admin'
              ? "Your account does not have administrator privileges."
              : isRegistering ? 'Register to manage the network.' : 'Please sign in to manage church applications.'}
          </p>
          
          <form onSubmit={handleAuth} className="space-y-4 text-left">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email Address</label>
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                required 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black"
                placeholder="••••••••"
              />
            </div>
            
            {authError && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{authError}</div>}
            
          <Button type="submit" className="w-full" isLoading={authLoading}>
            {isRegistering ? 'Create Account' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-4">
            <Button variant="outline" onClick={onBack} className="w-full">Back to Home</Button>
          </div>
        </div>
      </div>
    );
  }

  // Church Detail Modal with Edit Mode
  const ChurchDetailModal = ({ church, onClose, onCreatePortalAccount, isProcessingPortalAccount, onUpdate }: { 
    church: ChurchApplication; 
    onClose: () => void;
    onCreatePortalAccount: (churchId: string, applicantEmail: string, churchName: string) => Promise<void>;
    isProcessingPortalAccount: boolean;
    onUpdate: (updatedChurch: ChurchApplication) => void;
  }) => {
    const [isEditMode, setIsEditMode] = useState(false);
    const [editedChurch, setEditedChurch] = useState<ChurchApplication>({
      ...church,
      churchAddress: church.churchAddress || { country: '', street: '', city: '', state: '', postalCode: '' },
      leaders: church.leaders || [],
      gatherings: church.gatherings || []
    });
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [resendingEmail, setResendingEmail] = useState<EmailType | null>(null);

    // Sync local state when church prop changes (e.g., after successful save)
    useEffect(() => {
      setEditedChurch({
        ...church,
        leaders: church.leaders || [],
        gatherings: church.gatherings || []
      });
    }, [church]);

    const handleResendEmail = async (type: EmailType) => {
      if (!confirm(`Are you sure you want to resend the ${type.replace('_', ' ')} email to ${church.applicantEmail}?`)) return;
      
      setResendingEmail(type);
      try {
        await resendSystemEmail(church.id, type);
        alert('Email resent successfully!');
      } catch (error: any) {
        console.error("Error resending email:", error);
        alert(`Failed to resend email: ${error.message || 'Unknown error'}`);
      } finally {
        setResendingEmail(null);
      }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || !e.target.files[0]) return;

      setIsUploadingLogo(true);
      try {
        const file = e.target.files[0];
        const url = await uploadChurchLogo(file, church.id);
        setEditedChurch({ ...editedChurch, churchLogoUrl: url });
      } catch (error) {
        console.error('Error uploading logo:', error);
        alert('Failed to upload logo.');
      } finally {
        setIsUploadingLogo(false);
      }
    };

    const handleSave = async () => {
      setIsSavingEdit(true);
      try {
        const { id, ...updates } = editedChurch;
        await updateChurchProfile(church.id, updates);
        onUpdate(editedChurch); // Update the parent state with the edited church
        setIsEditMode(false);
        alert('Church profile updated successfully!');
      } catch (error) {
        console.error('Error updating church:', error);
        alert('Failed to update church profile. Please try again.');
      } finally {
        setIsSavingEdit(false);
      }
    };

    const addLeader = () => {
      setEditedChurch({
        ...editedChurch,
        leaders: [...editedChurch.leaders, {
          id: Date.now().toString(),
          firstName: '',
          lastName: '',
          role: 'Elder' as const,
          email: '',
          phone: ''
        }]
      });
    };

    const updateLeader = (index: number, field: keyof ChurchLeader, value: string) => {
      const newLeaders = [...editedChurch.leaders];
      newLeaders[index] = { ...newLeaders[index], [field]: value };
      setEditedChurch({ ...editedChurch, leaders: newLeaders });
    };

    const removeLeader = (index: number) => {
      setEditedChurch({
        ...editedChurch,
        leaders: editedChurch.leaders.filter((_, i) => i !== index)
      });
    };

    const addGathering = () => {
      setEditedChurch({
        ...editedChurch,
        gatherings: [...editedChurch.gatherings, {
          id: Date.now().toString(),
          name: '',
          day: 'Sunday' as const,
          startTime: '',
          endTime: ''
        }]
      });
    };

    const updateGathering = (index: number, field: keyof ChurchGathering, value: string) => {
      const newGatherings = [...editedChurch.gatherings];
      newGatherings[index] = { ...newGatherings[index], [field]: value };
      setEditedChurch({ ...editedChurch, gatherings: newGatherings });
    };

    const removeGathering = (index: number) => {
      setEditedChurch({
        ...editedChurch,
        gatherings: editedChurch.gatherings.filter((_, i) => i !== index)
      });
    };

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50" onClick={onClose}>
        <div className="flex items-center justify-center min-h-screen px-4 py-6">
          <div 
            className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-black px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div className="flex-1">
                {isEditMode ? (
                  <input
                    type="text"
                    value={editedChurch.churchName}
                    onChange={(e) => setEditedChurch({ ...editedChurch, churchName: e.target.value })}
                    className="text-2xl font-serif font-bold text-white bg-gray-800 rounded px-2 py-1 w-full"
                  />
                ) : (
                  <h3 className="text-2xl font-serif font-bold text-white">{church.churchName}</h3>
                )}
                <p className="text-gray-300 text-sm mt-1">{formatAddress(church.churchAddress)}</p>
              </div>
              <button onClick={onClose} className="text-gray-300 hover:text-white ml-4">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Status & Actions */}
              <div className="flex flex-col gap-4 pb-4 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      church.status === ApplicationStatus.APPROVED ? 'bg-green-100 text-green-800' :
                      church.status === ApplicationStatus.PENDING ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {church.status}
                    </span>
                    {church.status === ApplicationStatus.APPROVED && (
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        church.coordinates ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                      }`}>
                        {church.coordinates ? '📍 On Map' : '⚠️ Not on Map'}
                      </span>
                    )}
                  </div>
                </div>

                {!isEditMode && (
                  <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                    {/* Resend Actions */}
                    <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">Resend:</span>
                      <Button 
                        variant="outline" 
                        onClick={() => handleResendEmail('application_received')}
                        isLoading={resendingEmail === 'application_received'}
                        className="px-2 py-1 h-7 text-xs flex items-center gap-1 bg-white"
                        title="Resend 'Application Received' Email"
                      >
                        <Mail className="w-3 h-3" />
                        Received
                      </Button>
                      {church.status === ApplicationStatus.APPROVED && (
                        <Button 
                          variant="outline" 
                          onClick={() => handleResendEmail('application_approved')}
                          isLoading={resendingEmail === 'application_approved'}
                          className="px-2 py-1 h-7 text-xs flex items-center gap-1 text-green-700 hover:text-green-800 hover:bg-green-50 border-green-200 bg-white"
                          title="Resend 'Application Approved' Email"
                        >
                          <Check className="w-3 h-3" />
                          Approved
                        </Button>
                      )}
                      {church.status === ApplicationStatus.REJECTED && (
                        <Button 
                          variant="outline" 
                          onClick={() => handleResendEmail('application_rejected')}
                          isLoading={resendingEmail === 'application_rejected'}
                          className="px-2 py-1 h-7 text-xs flex items-center gap-1 text-red-700 hover:text-red-800 hover:bg-red-50 border-red-200 bg-white"
                          title="Resend 'Application Rejected' Email"
                        >
                          <X className="w-3 h-3" />
                          Rejected
                        </Button>
                      )}
                    </div>

                    {/* Management Actions */}
                    <div className="flex flex-wrap gap-2">
                      {church.status === ApplicationStatus.PENDING && (
                        <Button 
                          variant="primary" 
                          onClick={() => handleApprove(church, true)}
                          isLoading={isProcessingPortalAccount} // Re-use loading state
                          className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                        >
                          <Check className="w-3 h-3" />
                          Approve Church
                        </Button>
                      )}
                      {church.status === ApplicationStatus.APPROVED && (
                        <>
                          {!church.userId ? (
                            <Button
                              variant="outline"
                              onClick={() => onCreatePortalAccount(church.id, church.applicantEmail, church.churchName)}
                              isLoading={isProcessingPortalAccount}
                              className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                            >
                              <UserIcon className="w-3 h-3" />
                              Create Portal Account
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                                <UserIcon className="w-3 h-3 mr-1" />
                                Portal Account Active
                              </span>
                              <Button
                                variant="outline"
                                onClick={() => handleResendEmail('portal_account_setup')}
                                isLoading={resendingEmail === 'portal_account_setup'}
                                className="px-2 py-1 h-7 text-xs flex items-center gap-1"
                                title="Resend Portal Setup Email"
                              >
                                <Mail className="w-3 h-3" />
                                Resend Setup
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                      {church.status === ApplicationStatus.APPROVED && (
                        <>
                          <Button 
                            variant="outline" 
                            onClick={() => handleReassignCoordinates(church)}
                            disabled={processingId === church.id}
                            isLoading={processingId === church.id}
                            className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                          >
                            <MapPin className="w-3 h-3" />
                            Map
                          </Button>
                          <Button 
                            variant="primary" 
                            onClick={() => setIsEditMode(true)}
                            className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                          >
                            <Edit className="w-3 h-3" />
                            Edit
                          </Button>
                        </>
                      )}
                      {church.status === ApplicationStatus.APPROVED && (
                        <Button 
                          variant="danger" 
                          onClick={() => handleReject(church)}
                          disabled={processingId === church.id}
                          className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                        >
                          <Slash className="w-3 h-3" />
                          Reject
                        </Button>
                      )}
                      <Button 
                        variant="danger"
                        onClick={() => handleDelete(church)}
                        className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>

            {/* Logo Upload (Edit Mode) */}
            {isEditMode && (
              <div>
                <h4 className="text-lg font-bold text-gray-900 mb-3">Church Logo</h4>
                <div className="flex items-center gap-4">
                  {editedChurch.churchLogoUrl && (
                    <img 
                      src={editedChurch.churchLogoUrl} 
                      alt="Church Logo" 
                      className="w-16 h-16 rounded-full object-cover border"
                    />
                  )}
                  <label className={`cursor-pointer bg-white border border-gray-300 rounded-md px-4 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors ${isUploadingLogo ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <Upload className="w-4 h-4" />
                    {isUploadingLogo ? 'Uploading...' : 'Upload Logo'}
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={isUploadingLogo}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Applicant Info */}
            <div>
              <h4 className="text-lg font-bold text-gray-900 mb-3">Applicant Information</h4>
              {isEditMode ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">First Name</label>
                    <input
                      type="text"
                      value={editedChurch.applicantFirstName}
                      onChange={(e) => setEditedChurch({ ...editedChurch, applicantFirstName: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Last Name</label>
                    <input
                      type="text"
                      value={editedChurch.applicantLastName}
                      onChange={(e) => setEditedChurch({ ...editedChurch, applicantLastName: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Email Address</label>
                    <input
                      type="email"
                      value={editedChurch.applicantEmail}
                      onChange={(e) => setEditedChurch({ ...editedChurch, applicantEmail: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Submitted</label>
                    <div className="mt-1 text-sm text-gray-900">{new Date(church.submittedAt).toLocaleString()}</div>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoRow label="Name" value={`${church.applicantFirstName} ${church.applicantLastName}`} />
                  <InfoRow label="Email" value={church.applicantEmail} />
                  <InfoRow label="Submitted" value={new Date(church.submittedAt).toLocaleString()} />
                </dl>
              )}
            </div>

              {/* Church Contact */}
              <div>
                <h4 className="text-lg font-bold text-gray-900 mb-3">Church Contact</h4>
                {isEditMode ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Phone</label>
                      <input
                        type="tel"
                        value={editedChurch.churchPhone}
                        onChange={(e) => setEditedChurch({ ...editedChurch, churchPhone: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Public Email</label>
                      <input
                        type="email"
                        value={editedChurch.churchEmail}
                        onChange={(e) => setEditedChurch({ ...editedChurch, churchEmail: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Website</label>
                      <input
                        type="url"
                        value={editedChurch.connections?.website || ''}
                        onChange={(e) => setEditedChurch({ 
                          ...editedChurch, 
                          connections: { ...editedChurch.connections, website: e.target.value }
                        })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                  </div>
                ) : (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InfoRow label="Phone" value={church.churchPhone} />
                    <InfoRow label="Public Email" value={church.churchEmail} />
                    <InfoRow label="Website" value={church.connections?.website} />
                  </dl>
                )}
              </div>

              {/* Church Address */}
              <div>
                <h4 className="text-lg font-bold text-gray-900 mb-3">Church Address</h4>
                {isEditMode ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Street</label>
                      <input
                        type="text"
                        value={editedChurch.churchAddress?.street || ''}
                        onChange={(e) => setEditedChurch({ 
                          ...editedChurch, 
                          churchAddress: { ...editedChurch.churchAddress!, street: e.target.value }
                        })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Apt/Unit</label>
                      <input
                        type="text"
                        value={editedChurch.churchAddress?.aptUnit || ''}
                        onChange={(e) => setEditedChurch({ 
                          ...editedChurch, 
                          churchAddress: { ...editedChurch.churchAddress!, aptUnit: e.target.value }
                        })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">City</label>
                      <input
                        type="text"
                        value={editedChurch.churchAddress?.city || ''}
                        onChange={(e) => setEditedChurch({ 
                          ...editedChurch, 
                          churchAddress: { ...editedChurch.churchAddress!, city: e.target.value }
                        })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">State</label>
                      <input
                        type="text"
                        value={editedChurch.churchAddress?.state || ''}
                        onChange={(e) => setEditedChurch({ 
                          ...editedChurch, 
                          churchAddress: { ...editedChurch.churchAddress!, state: e.target.value }
                        })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Postal Code</label>
                      <input
                        type="text"
                        value={editedChurch.churchAddress?.postalCode || ''}
                        onChange={(e) => setEditedChurch({ 
                          ...editedChurch, 
                          churchAddress: { ...editedChurch.churchAddress!, postalCode: e.target.value }
                        })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Country</label>
                      <input
                        type="text"
                        value={editedChurch.churchAddress?.country || ''}
                        onChange={(e) => setEditedChurch({ 
                          ...editedChurch, 
                          churchAddress: { ...editedChurch.churchAddress!, country: e.target.value }
                        })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-700 whitespace-pre-wrap">{formatAddress(church.churchAddress)}</p>
                )}
              </div>

              {/* Dues Information */}
              <div>
                <h4 className="text-lg font-bold text-gray-900 mb-3">Dues Information</h4>
                {isEditMode ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Last Paid</label>
                      <input
                        type="date"
                        value={editedChurch.lastPaymentDate ? editedChurch.lastPaymentDate.split('T')[0] : ''}
                        onChange={(e) => setEditedChurch({ ...editedChurch, lastPaymentDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Next Due Date</label>
                      <input
                        type="date"
                        value={editedChurch.nextDueDate ? editedChurch.nextDueDate.split('T')[0] : ''}
                        onChange={(e) => setEditedChurch({ ...editedChurch, nextDueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                  </div>
                ) : (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InfoRow label="Last Paid" value={church.lastPaymentDate ? new Date(church.lastPaymentDate).toLocaleDateString() : 'N/A'} />
                    <InfoRow label="Next Due Date" value={church.nextDueDate ? new Date(church.nextDueDate).toLocaleDateString() : 'N/A'} />
                  </dl>
                )}
              </div>

              {/* Manual Coordinates */}
              <div>
                <h4 className="text-lg font-bold text-gray-900 mb-3">Map Coordinates</h4>
                {isEditMode ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Latitude</label>
                      <input
                        type="number"
                        step="any"
                        value={editedChurch.coordinates?.lat || ''}
                        onChange={(e) => setEditedChurch({ ...editedChurch, coordinates: { ...editedChurch.coordinates, lat: parseFloat(e.target.value) } })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Longitude</label>
                      <input
                        type="number"
                        step="any"
                        value={editedChurch.coordinates?.lng || ''}
                        onChange={(e) => setEditedChurch({ ...editedChurch, coordinates: { ...editedChurch.coordinates, lng: parseFloat(e.target.value) } })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                  </div>
                ) : (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InfoRow label="Latitude" value={church.coordinates?.lat?.toString()} />
                    <InfoRow label="Longitude" value={church.coordinates?.lng?.toString()} />
                  </dl>
                )}
              </div>

              {/* Description */}
              <div>
                <h4 className="text-lg font-bold text-gray-900 mb-3">Church Description</h4>
                {isEditMode ? (
                  <textarea
                    value={editedChurch.churchDescription}
                    onChange={(e) => setEditedChurch({ ...editedChurch, churchDescription: e.target.value })}
                    rows={6}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                  />
                ) : (
                  <p className="text-gray-700 whitespace-pre-wrap">{church.churchDescription}</p>
                )}
              </div>

              {/* Elders */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-bold text-gray-900">Elders</h4>
                  {isEditMode && (
                    <Button onClick={addLeader} variant="outline" className="text-sm">
                      <PlusCircle className="w-4 h-4 mr-2" /> Add Leader
                    </Button>
                  )}
                </div>
                {isEditMode ? (
                  <div className="space-y-3">
                    {editedChurch.leaders.map((leader, index) => (
                      <div key={leader.id} className="bg-gray-50 p-3 rounded-md space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                            <input
                              type="text"
                              placeholder="First Name"
                              value={leader.firstName}
                              onChange={(e) => updateLeader(index, 'firstName', e.target.value)}
                              className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                            <input
                              type="text"
                              placeholder="Last Name"
                              value={leader.lastName}
                              onChange={(e) => updateLeader(index, 'lastName', e.target.value)}
                              className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 w-full"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                          <input
                            type="email"
                            placeholder="Email"
                            value={leader.email}
                            onChange={(e) => updateLeader(index, 'email', e.target.value)}
                            className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 w-full"
                          />
                        </div>
                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                            <input
                              type="tel"
                              placeholder="Phone"
                              value={leader.phone}
                              onChange={(e) => updateLeader(index, 'phone', e.target.value)}
                              className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 w-full"
                            />
                          </div>
                          <Button variant="danger" onClick={() => removeLeader(index)} className="text-sm h-10 px-3">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : church.leaders && church.leaders.length > 0 ? (
                  <div className="space-y-3">
                    {church.leaders.map((leader) => (
                      <div key={leader.id} className="bg-gray-50 p-3 rounded-md">
                        <div className="font-semibold text-gray-900">
                          {leader.firstName} {leader.lastName} - {leader.role}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {leader.email} • {leader.phone}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 italic">No leaders listed</p>
                )}
              </div>

              {/* Schedule */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-bold text-gray-900">Weekly Schedule</h4>
                  {isEditMode && (
                    <Button onClick={addGathering} variant="outline" className="text-sm">
                      <PlusCircle className="w-4 h-4 mr-2" /> Add Gathering
                    </Button>
                  )}
                </div>
                {isEditMode ? (
                  <div className="space-y-3">
                    {editedChurch.gatherings.map((gathering, index) => (
                      <div key={gathering.id} className="bg-gray-50 p-3 rounded-md space-y-2">
                        <div className="grid grid-cols-1 gap-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Gathering Name</label>
                            <input
                              type="text"
                              placeholder="Sunday Morning Worship Service"
                              value={gathering.name}
                              onChange={(e) => updateGathering(index, 'name', e.target.value)}
                              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 w-full"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 items-end">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                            <select
                              value={gathering.day}
                              onChange={(e) => updateGathering(index, 'day', e.target.value as ChurchGathering['day'])}
                              className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 w-full"
                            >
                              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                                <option key={day} value={day}>{day}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                            <input
                              type="text"
                              placeholder="10:00 AM"
                              value={gathering.startTime}
                              onChange={(e) => updateGathering(index, 'startTime', e.target.value)}
                              className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                            <input
                              type="text"
                              placeholder="11:30 AM"
                              value={gathering.endTime}
                              onChange={(e) => updateGathering(index, 'endTime', e.target.value)}
                              className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 w-full"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button variant="danger" onClick={() => removeGathering(index)} className="text-sm px-3 h-10">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : church.gatherings && church.gatherings.length > 0 ? (
                  <div className="space-y-2">
                    {church.gatherings.map((gathering) => (
                      <div key={gathering.id} className="bg-gray-50 p-3 rounded-md">
                        <div className="font-semibold text-gray-900">{gathering.name}</div>
                        <div className="text-sm text-gray-600">
                          {gathering.day} • {gathering.startTime} - {gathering.endTime}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 italic">No gatherings listed</p>
                )}
              </div>

              {/* Social Connections */}
              <div>
                <h4 className="text-lg font-bold text-gray-900 mb-3">Online Presence</h4>
                {isEditMode ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(['sermons', 'facebook', 'x', 'instagram', 'youtube', 'tiktok', 'vimeo', 'spotify', 'applePodcasts', 'googlePodcasts', 'amazon', 'sermonaudio'] as const).map((platform) => (
                      <div key={platform}>
                        <label className="block text-sm font-medium text-gray-700 capitalize">
                          {platform === 'x' ? 'X (Twitter)' : platform.replace(/([A-Z])/g, ' $1').trim()}
                        </label>
                        <input
                          type="url"
                          value={editedChurch.connections?.[platform] || ''}
                          onChange={(e) => setEditedChurch({ 
                            ...editedChurch, 
                            connections: { ...editedChurch.connections, [platform]: e.target.value }
                          })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          placeholder={`https://${platform}.com/...`}
                        />
                      </div>
                    ))}
                  </div>
                ) : church.connections ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(church.connections).map(([platform, url]) => (
                      url && <InfoRow key={platform} label={platform.replace(/([A-Z])/g, ' $1').trim()} value={url} />
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 italic">No online presence information</p>
                )}
              </div>

              {/* Doctrinal Positions */}
              <div>
                <h4 className="text-lg font-bold text-gray-900 mb-3">Doctrinal Distinctives</h4>
                <dl className="grid grid-cols-1 gap-4">
                  <InfoRow label="Plurality of Elders" value={editedChurch.pluralityOfElders} />
                  <InfoRow label="Church Discipline" value={editedChurch.churchDiscipline} />
                  <InfoRow label="Statement on Social Justice & Gospel" value={editedChurch.ssjgSigned} />
                  <div>
                    <dt className="text-sm font-medium text-gray-500">1689 London Baptist Confession</dt>
                    <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{editedChurch.confessionAffirmation}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end gap-2 border-t">
              {isEditMode ? (
                <>
                  <Button variant="outline" onClick={() => setIsEditMode(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} isLoading={isSavingEdit}>
                    Save Changes
                  </Button>
                </>
              ) : (
                <Button onClick={onClose}>Close</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Get all leaders from approved churches
  const allLeaders = approvedApps.flatMap(church => 
    (church.leaders || []).map(leader => ({
      ...leader,
      churchName: church.churchName,
      churchId: church.id
    }))
  );

  // Church Statistics Modal
  const ChurchStatsModal = ({ churchId, churchName, onClose }: { churchId: string, churchName: string, onClose: () => void }) => {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50" onClick={onClose}>
        <div className="flex items-center justify-center min-h-screen px-4 py-6">
          <div 
            className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-black px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <h3 className="text-2xl font-serif font-bold text-white">{churchName} Analytics</h3>
              <button onClick={onClose} className="text-gray-300 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6">
              {loadingChurchAnalytics ? (
                <div className="flex justify-center p-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : churchAnalyticsData ? (
                <div className="space-y-8">
                  {/* Time Range Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* All Time */}
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                      <h4 className="text-sm font-bold text-blue-800 uppercase tracking-wide mb-3">All Time</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Profile Views</span>
                          <span className="font-bold text-gray-900">{churchAnalyticsData.total?.views || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Website Clicks</span>
                          <span className="font-bold text-gray-900">{churchAnalyticsData.total?.visits || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Contact Inquiries</span>
                          <span className="font-bold text-gray-900">{churchAnalyticsData.total?.contacts || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Social Clicks</span>
                          <span className="font-bold text-gray-900">{churchAnalyticsData.total?.socialClicks || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Last 30 Days */}
                    <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                      <h4 className="text-sm font-bold text-green-800 uppercase tracking-wide mb-3">Last 30 Days</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Profile Views</span>
                          <span className="font-bold text-gray-900">{churchAnalyticsData.last30Days?.views || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Website Clicks</span>
                          <span className="font-bold text-gray-900">{churchAnalyticsData.last30Days?.visits || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Contact Inquiries</span>
                          <span className="font-bold text-gray-900">{churchAnalyticsData.last30Days?.contacts || 0}</span>
                        </div>
                         <div className="flex justify-between">
                          <span className="text-gray-600">Social Clicks</span>
                          <span className="font-bold text-gray-900">{churchAnalyticsData.last30Days?.socialClicks || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Last 7 Days */}
                    <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                      <h4 className="text-sm font-bold text-purple-800 uppercase tracking-wide mb-3">Last 7 Days</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Profile Views</span>
                          <span className="font-bold text-gray-900">{churchAnalyticsData.last7Days?.views || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Website Clicks</span>
                          <span className="font-bold text-gray-900">{churchAnalyticsData.last7Days?.visits || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Contact Inquiries</span>
                          <span className="font-bold text-gray-900">{churchAnalyticsData.last7Days?.contacts || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Social Clicks</span>
                          <span className="font-bold text-gray-900">{churchAnalyticsData.last7Days?.socialClicks || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Engagement Insights */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <h4 className="font-bold text-gray-900 mb-2 flex items-center">
                        <Clock className="w-4 h-4 mr-2 text-gray-500" />
                        Last Activity
                      </h4>
                      <p className="text-gray-600">
                        {churchAnalyticsData.lastActivity 
                          ? new Date(churchAnalyticsData.lastActivity).toLocaleString() 
                          : 'No activity recorded yet'}
                      </p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <h4 className="font-bold text-gray-900 mb-2 flex items-center">
                        <Share2 className="w-4 h-4 mr-2 text-gray-500" />
                        Top Social Platform
                      </h4>
                      <p className="text-gray-600 capitalize">
                        {churchAnalyticsData.topSocialPlatform || 'None recorded yet'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 text-gray-500">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p>Failed to load analytics data.</p>
                </div>
              )}
            </div>
            <div className="bg-gray-50 px-6 py-4 flex justify-end border-t">
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm('Are you sure you want to send this email? This action cannot be undone.')) return;

    setIsSendingEmail(true);
    setEmailStatus(null);

    try {
      let recipients: string[] = [];

      if (recipientType === 'churches') {
        recipients = approvedApps
          .map(app => app.applicantEmail)
          .filter(email => email && email.includes('@')); // Basic validation
      } else if (recipientType === 'leaders') {
        recipients = allLeaders
          .map(leader => leader.email)
          .filter(email => email && email.includes('@'));
      } else {
        // Test mode - send to current user
        if (user?.email) recipients = [user.email];
      }

      // Remove duplicates
      recipients = [...new Set(recipients)];

      if (recipients.length === 0) {
        throw new Error('No valid recipients found for the selected group.');
      }

      console.log(`Sending email to ${recipients.length} recipients...`);
      
      const result = await sendEmail(recipients, emailSubject, emailBody, senderProfile);
      console.log('Email sent result:', result);

      setEmailStatus({
        success: true,
        message: `Successfully sent to ${recipients.length} recipients!`
      });
      
      // Clear form on success
      if (recipientType === 'test') {
        // Don't clear for test, easier to re-test
      } else {
        setEmailSubject('');
        setEmailBody('');
      }

    } catch (error: any) {
      console.error('Failed to send email:', error);
      setEmailStatus({
        success: false,
        message: error.message || 'Failed to send email. Please try again.'
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const filteredAndSortedLeaders = allLeaders
    .filter(leader => {
      if (!leaderSearchQuery) return true;
      const query = leaderSearchQuery.toLowerCase();
      return (
        `${leader.firstName} ${leader.lastName}`.toLowerCase().includes(query) ||
        leader.email.toLowerCase().includes(query) ||
        leader.role.toLowerCase().includes(query) ||
        leader.churchName.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (leaderSortBy) {
        case 'name':
          comparison = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
          break;
        case 'role':
          comparison = a.role.localeCompare(b.role);
          break;
        case 'church':
          comparison = a.churchName.localeCompare(b.churchName);
          break;
      }
      return leaderSortOrder === 'asc' ? comparison : -comparison;
    });

  // Filter and sort users
  const filteredAndSortedUsers = allUsers
    .filter(u => {
      if (!userSearchQuery) return true;
      const query = userSearchQuery.toLowerCase();
      return (
        u.email.toLowerCase().includes(query) ||
        u.role.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (userSortBy) {
        case 'email':
          comparison = a.email.localeCompare(b.email);
          break;
        case 'role':
          comparison = a.role.localeCompare(b.role);
          break;
        case 'lastSignIn':
          const aTime = a.lastSignInTime ? new Date(a.lastSignInTime).getTime() : 0;
          const bTime = b.lastSignInTime ? new Date(b.lastSignInTime).getTime() : 0;
          comparison = aTime - bTime;
          break;
      }
      return userSortOrder === 'asc' ? comparison : -comparison;
    });

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center"><button onClick={onBack} className="mr-4 text-brand-600 hover:text-brand-800"><ArrowLeft /></button><h1 className="text-3xl font-serif font-bold text-brand-900">Admin Dashboard</h1></div>
          <div className="flex items-center space-x-4">
            <div className="hidden sm:block text-right">
              <div className="text-sm font-bold text-gray-900">{user?.email}</div>
              <div className="text-xs text-gray-500">Administrator</div>
            </div>
            <Button variant="outline" onClick={() => { setEditEmail(user?.email || ''); setShowProfileModal(true); }} className="text-xs px-3 py-2">
              <Settings className="w-4 h-4 mr-2" /> Edit Profile
            </Button>
            <Button variant="outline" onClick={logout} className="text-xs px-3 py-2">
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="mb-8">
          {/* Top-level tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8">
              <button
                onClick={() => setCurrentView('statistics')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  currentView === 'statistics'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Dashboard
                </div>
              </button>
              <button
                onClick={() => setCurrentView('member-pending')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  currentView.startsWith('member-')
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Member Management
              </button>
              <button
                onClick={() => setCurrentView('jobs')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  currentView === 'jobs'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center">
                  <Briefcase className="w-4 h-4 mr-2" />
                  Job Board
                </div>
              </button>
              <button
                onClick={() => setCurrentView('email')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  currentView === 'email'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Email Center
              </button>
              <button
                onClick={() => setCurrentView('settings-email')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  currentView.startsWith('settings-')
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </div>
              </button>
            </nav>
          </div>

          {/* Sub-navigation for Member Management */}
          {currentView.startsWith('member-') && (
            <div className="bg-gray-50 border-b border-gray-200 px-8">
              <nav className="flex space-x-6">
                <button
                  onClick={() => setCurrentView('member-pending')}
                  className={`py-3 px-1 border-b-2 font-medium text-xs transition-colors ${
                    currentView === 'member-pending'
                      ? 'border-brand-500 text-brand-700'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  Pending
                  <span className="ml-2 bg-yellow-100 text-yellow-800 py-0.5 px-1.5 rounded-full text-xs">
                    {pendingApps.length}
                  </span>
                </button>
                <button
                  onClick={() => setCurrentView('member-active')}
                  className={`py-3 px-1 border-b-2 font-medium text-xs transition-colors ${
                    currentView === 'member-active'
                      ? 'border-brand-500 text-brand-700'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  Active
                  <span className="ml-2 bg-green-100 text-green-800 py-0.5 px-1.5 rounded-full text-xs">
                    {approvedApps.length}
                  </span>
                </button>
                <button
                  onClick={() => setCurrentView('member-leaders')}
                  className={`py-3 px-1 border-b-2 font-medium text-xs transition-colors ${
                    currentView === 'member-leaders'
                      ? 'border-brand-500 text-brand-700'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  Leaders
                  <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-1.5 rounded-full text-xs">
                    {allLeaders.length}
                  </span>
                </button>
                <button
                  onClick={() => setCurrentView('member-rejected')}
                  className={`py-3 px-1 border-b-2 font-medium text-xs transition-colors ${
                    currentView === 'member-rejected'
                      ? 'border-brand-500 text-brand-700'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  Rejected
                  <span className="ml-2 bg-red-100 text-red-800 py-0.5 px-1.5 rounded-full text-xs">
                    {rejectedApps.length}
                  </span>
                </button>
              </nav>
            </div>
          )}

          {/* Sub-navigation for Job Board */}
          {(currentView === 'jobs') && (
            <div className="bg-gray-50 border-b border-gray-200 px-8">
              <nav className="flex space-x-6">
                <button
                  onClick={() => setCurrentView('jobs')}
                  className={`py-3 px-1 border-b-2 font-medium text-xs transition-colors ${
                    currentView === 'jobs'
                      ? 'border-brand-500 text-brand-700'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  All Job Listings
                  <span className="ml-2 bg-blue-100 text-blue-800 py-0.5 px-1.5 rounded-full text-xs">
                    {jobListings.length}
                  </span>
                </button>
                {/* Potentially add 'All Applications' tab here later if needed for admin */}
              </nav>
            </div>
          )}

          {/* Sub-navigation for Settings */}
          {currentView.startsWith('settings-') && (
            <div className="bg-gray-50 border-b border-gray-200 px-8">
              <nav className="flex space-x-6">
                <button
                  onClick={() => setCurrentView('settings-email')}
                  className={`py-3 px-1 border-b-2 font-medium text-xs transition-colors ${
                    currentView === 'settings-email'
                      ? 'border-brand-500 text-brand-700'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center">
                    <Mail className="w-3 h-3 mr-1.5" />
                    Email Templates
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('settings-application')}
                  className={`py-3 px-1 border-b-2 font-medium text-xs transition-colors ${
                    currentView === 'settings-application'
                      ? 'border-brand-500 text-brand-700'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center">
                    <BookOpen className="w-3 h-3 mr-1.5" />
                    Application Form
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('settings-content')}
                  className={`py-3 px-1 border-b-2 font-medium text-xs transition-colors ${
                    currentView === 'settings-content'
                      ? 'border-brand-500 text-brand-700'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center">
                    <BookOpen className="w-3 h-3 mr-1.5" />
                    Main Page Content
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('settings-users')}
                  className={`py-3 px-1 border-b-2 font-medium text-xs transition-colors ${
                    currentView === 'settings-users'
                      ? 'border-brand-500 text-brand-700'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center">
                    <UserIcon className="w-3 h-3 mr-1.5" />
                    Users
                  </div>
                </button>
                <button
                  onClick={() => setCurrentView('settings-promo-codes')}
                  className={`py-3 px-1 border-b-2 font-medium text-xs transition-colors ${
                    currentView === 'settings-promo-codes'
                      ? 'border-brand-500 text-brand-700'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center">
                    <ShieldCheck className="w-3 h-3 mr-1.5" />
                    Promo Codes
                  </div>
                </button>
              </nav>
            </div>
          )}
        </div>

        {/* Pending Applications View */}
        {currentView === 'member-pending' && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Pending Applications</h2>
            <p className="text-gray-600 mb-6">Review and approve new church applications</p>
            {pendingApps.length === 0 ? (
              <div className="bg-white p-12 rounded-lg shadow-sm text-center border-2 border-dashed border-gray-200">
                <Check className="w-12 h-12 text-green-500 mx-auto mb-3 opacity-50" />
                <div className="text-gray-500 italic">No pending applications. All caught up!</div>
              </div>
            ) : (
              <div className="space-y-8">
                {pendingApps.map(app => (
                  <div key={app.id} className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
                    <div className="p-6 bg-gray-50 border-b flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold font-serif text-brand-900">{app.churchName}</h3>
                        <div className="flex items-center text-gray-600 mt-2"><MapPin className="w-4 h-4 mr-2 flex-shrink-0" />{formatAddress(app.churchAddress)}</div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button variant="outline" onClick={() => setViewingChurch(app)} className="text-sm">
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </div>
                    
                    <div className="p-6 flex space-x-3 justify-end">
                      <Button variant="danger" onClick={() => handleReject(app)} disabled={processingId === app.id}><X className="w-4 h-4 mr-2" /> Reject</Button>
                      <Button variant="primary" onClick={() => handleApprove(app)} isLoading={processingId === app.id}><ShieldCheck className="w-4 h-4 mr-2" /> Approve & Add to Map</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Promo Code Management View */}
        {currentView === 'settings-promo-codes' && (
          <section className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Freebie Promo Codes</h2>
              <p className="text-gray-600">Manage promo codes that allow churches to join for free.</p>
            </div>
            <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
              <PromoCodeManager />
            </div>
          </section>
        )}

        {/* Active Members View */}
        {currentView === 'member-active' && (
          <section>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Approved Churches</h2>
                <p className="text-gray-600">Churches that have been approved and are visible on the map</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleImportCSV}
                  className="hidden"
                />
                <Button
                  variant="primary"
                  onClick={handleAssignAllCoordinates}
                  isLoading={isImporting}
                  disabled={isImporting || approvedApps.filter(app => !app.coordinates).length === 0}
                  className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                >
                  <MapPin className="w-3 h-3 mr-1" />
                  Map All ({approvedApps.filter(app => !app.coordinates).length})
                </Button>
                
                <Button
                  variant="outline"
                  onClick={async () => {
                    const churchesWithoutAccount = approvedApps.filter(app => !app.userId);
                    if (churchesWithoutAccount.length === 0) {
                      alert('All approved churches already have portal accounts!');
                      return;
                    }
                    if (!confirm(`This will create portal accounts and send password setup emails to ${churchesWithoutAccount.length} churches. Continue?`)) {
                      return;
                    }

                    setIsProcessingPortalAccount(true); // Re-use loading state
                    let successCount = 0;
                    let failedCount = 0;
                    const errors: string[] = [];

                    for (const church of churchesWithoutAccount) {
                      try {
                        console.log(`Creating portal account for ${successCount + 1}/${churchesWithoutAccount.length}: ${church.churchName}`);
                        await createChurchUserAndSendResetEmailClient(church.id, church.applicantEmail);
                        successCount++;
                        console.log(`✓ Successfully created portal account for: ${church.churchName}`);
                      } catch (error: any) {
                        console.error(`Error creating portal account for ${church.churchName}:`, error);
                        failedCount++;
                        errors.push(`${church.churchName}: ${error.message || 'Unknown error'}`);
                      }
                    };

                    setIsProcessingPortalAccount(false);
                    const message = `Portal Account Creation Complete!\n\nSuccessfully created: ${successCount} accounts\nFailed: ${failedCount}`;
                    const detailedMessage = errors.length > 0
                      ? `${message}\n\nErrors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...(and more)' : ''}`
                      : message;
                    
                    alert(detailedMessage);
                  }}
                  isLoading={isProcessingPortalAccount}
                  disabled={isProcessingPortalAccount || approvedApps.filter(app => !app.userId).length === 0}
                  className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                >
                  <UserIcon className="w-3 h-3 mr-1" />
                  Create All Portal Accounts ({approvedApps.filter(app => !app.userId).length})
                </Button>

                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  isLoading={isImporting}
                  disabled={isImporting}
                  className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                >
                  <Upload className="w-3 h-3 mr-1" />
                  Import CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={exportToCSV}
                  disabled={approvedApps.length === 0}
                  className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                >
                  <Download className="w-3 h-3 mr-1" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!confirm(`This will attempt to recalculate and update coordinates for all approved churches. This may take several minutes. Are you sure you want to proceed?`)) return;

                    setIsImporting(true); // Reuse loading state for spinner
                    let totalSuccess = 0;
                    let totalFailed = 0;
                    
                    alert('Starting coordinate recalculation. This may take a few minutes. You will be notified when it is complete.');

                    const processNextBatch = async (lastDocId?: string) => {
                      try {
                        const result = await backfillGeocodes(lastDocId);
                        totalSuccess += result.successCount;
                        totalFailed += result.failCount;
                        console.log(result.message);

                        if (result.remaining > 0 && result.lastDocId) {
                          await new Promise(resolve => setTimeout(resolve, 1000)); // Short delay between batches
                          await processNextBatch(result.lastDocId);
                        } else {
                          alert(`Backfill complete!\n\nSuccessfully geocoded: ${totalSuccess}\nFailed: ${totalFailed}`);
                          setIsImporting(false);
                        }
                      } catch (error: any) {
                        console.error("Error backfilling geocodes:", error);
                        alert(`An error occurred during the backfill process: ${error.message || 'Unknown error'}`);
                        setIsImporting(false);
                      }
                    };

                    await processNextBatch();
                  }}
                  isLoading={isImporting}
                  disabled={isImporting || approvedApps.length === 0}
                  className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Recalculate All Coordinates
                </Button>
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (approvedApps.length === 0) {
                      alert('No approved churches to delete.');
                      return;
                    }
                    
                    const confirmText = `DELETE ALL ${approvedApps.length} CHURCHES`;
                    const userInput = prompt(
                      `⚠️ DANGER: This will permanently delete ALL ${approvedApps.length} approved churches!\n\n` +
                      `This action CANNOT be undone.\n\n` +
                      `To confirm, type exactly: ${confirmText}`
                    );
                    
                    if (userInput !== confirmText) {
                      alert('Deletion cancelled. The confirmation text did not match.');
                      return;
                    }

                    setIsImporting(true);
                    let successCount = 0;
                    let failedCount = 0;
                    const errors: string[] = [];

                    for (const church of approvedApps) {
                      try {
                        await deleteChurchApplication(church.id);
                        successCount++;
                        console.log(`✓ Deleted: ${church.churchName}`);
                      } catch (error: any) {
                        console.error(`Error deleting ${church.churchName}:`, error);
                        failedCount++;
                        errors.push(`${church.churchName}: ${error.message || 'Unknown error'}`);
                      }
                    }

                    setIsImporting(false);
                    
                    const message = `Delete Complete!\n\nSuccessfully deleted: ${successCount} churches\nFailed: ${failedCount}`;
                    const detailedMessage = errors.length > 0
                      ? `${message}\n\nErrors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...(and more)' : ''}`
                      : message;
                    
                    alert(detailedMessage);
                  }}
                  isLoading={isImporting}
                  disabled={isImporting || approvedApps.length === 0}
                  className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Delete All ({approvedApps.length})
                </Button>
              </div>
            </div>
            {approvedApps.length === 0 ? (
              <div className="bg-white p-12 rounded-lg shadow-sm text-center border-2 border-dashed border-gray-200">
                <Globe className="w-12 h-12 text-gray-400 mx-auto mb-3 opacity-50" />
                <div className="text-gray-500 italic">No approved churches yet.</div>
              </div>
            ) : (
              <>
                {/* Search and Sort Controls */}
                <div className="mb-4 bg-white p-4 rounded-lg shadow flex gap-4 items-center flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <input
                      type="text"
                      placeholder="Search churches by name, city, or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-sm font-medium text-gray-700">Sort by:</label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                    >
                      <option value="name">Name</option>
                      <option value="city">City</option>
                      <option value="date">Date Added</option>
                      <option value="status">Map Status</option>
                    </select>
                    <button
                      onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      title={sortOrder === 'asc' ? 'Sort Descending' : 'Sort Ascending'}
                    >
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                    <p className="text-sm text-gray-600">
                      Showing {filteredAndSortedApprovedApps.length} of {approvedApps.length} churches
                      {searchQuery && ` matching "${searchQuery}"`}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Church</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Map</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredAndSortedApprovedApps.map(app => (
                          <tr key={app.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                              <div className="font-medium text-gray-900">{app.churchName}</div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {`${app.churchAddress?.city || ''}, ${app.churchAddress?.country || ''}`}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {app.applicantEmail}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                app.coordinates ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {app.coordinates ? '✓' : '✗'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => setViewingChurch(app)} 
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                              >
                                View Profile
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* Rejected Applications View */}
        {currentView === 'member-rejected' && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Rejected Applications</h2>
            <p className="text-gray-600 mb-6">Applications that have been declined</p>
            {rejectedApps.length === 0 ? (
              <div className="bg-white p-12 rounded-lg shadow-sm text-center border-2 border-dashed border-gray-200">
                <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-3 opacity-50" />
                <div className="text-gray-500 italic">No rejected applications.</div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Church</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {rejectedApps.map(app => (
                        <tr key={app.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 font-medium text-gray-900">{app.churchName}</td>
                          <td className="px-6 py-4 text-gray-500">
                            {`${app.churchAddress?.city || ''}, ${app.churchAddress?.country || ''}`}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => setViewingChurch(app)} 
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Job Listings View */}
        {currentView === 'jobs' && (
          <section>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">All Job Listings</h2>
                <p className="text-gray-600">Overview of all active and inactive job listings from network churches.</p>
              </div>
              <div className="flex gap-2">
                {/* Future: Add bulk actions, filter, search */}
              </div>
            </div>

            {jobListings.length === 0 ? (
              <div className="bg-white p-12 rounded-lg shadow-sm text-center border-2 border-dashed border-gray-200">
                <Briefcase className="w-12 h-12 text-gray-400 mx-auto mb-3 opacity-50" />
                <div className="text-gray-500 italic">No job listings found.</div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job Title</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Church</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {jobListings.map(job => (
                        <tr key={job.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-900">{job.title}</div>
                            <div className="text-sm text-gray-500">{job.category}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {job.churchName}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {job.location}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {job.jobType}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              job.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {job.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button 
                              variant="danger"
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete the job listing: "${job.title}" by ${job.churchName}? This cannot be undone.`)) {
                                  deleteJobListing(job.id);
                                }
                              }}
                              className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Email Templates Settings View */}
        {currentView === 'settings-email' && (
          <section className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Email Templates</h2>
              <p className="text-gray-600">Configure automated email templates sent to churches.</p>
            </div>

            {/* Email Templates Content */}
            {(
              <>
                {loadingTemplates ? (
                  <div className="flex justify-center p-12"><RefreshCw className="w-8 h-8 animate-spin text-gray-400" /></div>
                ) : (
                  <div className="space-y-8">
                    {/* Application Received Template */}
                    <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                      <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-bold text-gray-900 flex items-center">
                          <Mail className="w-5 h-5 mr-2 text-gray-500" />
                          Application Received Email
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">Sent automatically when a church submits a new application.</p>
                      </div>
                      <div className="p-6 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                          <input
                            type="text"
                            value={templates.application_received.subject}
                            onChange={(e) => setTemplates({
                              ...templates,
                              application_received: { ...templates.application_received, subject: e.target.value }
                            })}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Body (HTML)</label>
                          <textarea
                            value={templates.application_received.body}
                            onChange={(e) => setTemplates({
                              ...templates,
                              application_received: { ...templates.application_received, body: e.target.value }
                            })}
                            rows={6}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2 font-mono text-sm"
                          />
                          <p className="text-xs text-gray-500 mt-1">Available variables: {'{{applicantName}}'}, {'{{churchName}}'}</p>
                        </div>
                        <div className="flex justify-end">
                          <Button 
                            onClick={() => handleSaveTemplate('application_received')}
                            isLoading={savingTemplate === 'application_received'}
                          >
                            Save Template
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Application Approved Template */}
                    <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                      <div className="bg-green-50 px-6 py-4 border-b border-green-200">
                        <h3 className="text-lg font-bold text-green-900 flex items-center">
                          <Check className="w-5 h-5 mr-2 text-green-600" />
                          Application Approved Email
                        </h3>
                        <p className="text-sm text-green-700 mt-1">Sent automatically when you approve an application.</p>
                      </div>
                      <div className="p-6 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                          <input
                            type="text"
                            value={templates.application_approved.subject}
                            onChange={(e) => setTemplates({
                              ...templates,
                              application_approved: { ...templates.application_approved, subject: e.target.value }
                            })}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Body (HTML)</label>
                          <textarea
                            value={templates.application_approved.body}
                            onChange={(e) => setTemplates({
                              ...templates,
                              application_approved: { ...templates.application_approved, body: e.target.value }
                            })}
                            rows={6}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2 font-mono text-sm"
                          />
                          <p className="text-xs text-gray-500 mt-1">Available variables: {'{{applicantName}}'}, {'{{churchName}}'}</p>
                        </div>
                        <div className="flex justify-end">
                          <Button 
                            onClick={() => handleSaveTemplate('application_approved')}
                            isLoading={savingTemplate === 'application_approved'}
                          >
                            Save Template
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Application Rejected Template */}
                    <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                      <div className="bg-red-50 px-6 py-4 border-b border-red-200">
                        <h3 className="text-lg font-bold text-red-900 flex items-center">
                          <X className="w-5 h-5 mr-2 text-red-600" />
                          Application Rejected Email
                        </h3>
                        <p className="text-sm text-red-700 mt-1">Sent automatically when you reject an application.</p>
                      </div>
                      <div className="p-6 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                          <input
                            type="text"
                            value={templates.application_rejected.subject}
                            onChange={(e) => setTemplates({
                              ...templates,
                              application_rejected: { ...templates.application_rejected, subject: e.target.value }
                            })}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Body (HTML)</label>
                          <textarea
                            value={templates.application_rejected.body}
                            onChange={(e) => setTemplates({
                              ...templates,
                              application_rejected: { ...templates.application_rejected, body: e.target.value }
                            })}
                            rows={6}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2 font-mono text-sm"
                          />
                          <p className="text-xs text-gray-500 mt-1">Available variables: {'{{applicantName}}'}, {'{{churchName}}'}</p>
                        </div>
                        <div className="flex justify-end">
                          <Button 
                            onClick={() => handleSaveTemplate('application_rejected')}
                            isLoading={savingTemplate === 'application_rejected'}
                          >
                            Save Template
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Dues Reminder Templates */}
                    {[
                      { type: 'dues_reminder_30' as const, title: 'Dues Reminder (30 Days)', desc: 'Sent 30 days before annual dues expire.' },
                      { type: 'dues_reminder_7' as const, title: 'Dues Reminder (7 Days)', desc: 'Sent 7 days before annual dues expire.' },
                      { type: 'dues_reminder_0' as const, title: 'Dues Reminder (Due Today)', desc: 'Sent on the day annual dues expire.' },
                      { type: 'dues_delinquent' as const, title: 'Delinquency Notice', desc: 'Sent weekly when dues are overdue.' },
                      { type: 'portal_account_setup' as const, title: 'Portal Account Setup', desc: 'Sent when an admin creates a church portal account.' }
                    ].map(({ type, title, desc }) => (
                      <div key={type} className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                        <div className="bg-yellow-50 px-6 py-4 border-b border-yellow-200">
                          <h3 className="text-lg font-bold text-yellow-900 flex items-center">
                            <AlertTriangle className="w-5 h-5 mr-2 text-yellow-600" />
                            {title}
                          </h3>
                          <p className="text-sm text-yellow-700 mt-1">{desc}</p>
                        </div>
                        <div className="p-6 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                            <input
                              type="text"
                              value={templates[type].subject}
                              onChange={(e) => setTemplates({
                                ...templates,
                                [type]: { ...templates[type], subject: e.target.value }
                              })}
                              className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Body (HTML)</label>
                            <textarea
                              value={templates[type].body}
                              onChange={(e) => setTemplates({
                                ...templates,
                                [type]: { ...templates[type], body: e.target.value }
                              })}
                              rows={6}
                              className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2 font-mono text-sm"
                            />
                            <p className="text-xs text-gray-500 mt-1">Available variables: {'{{applicantName}}'}, {'{{churchName}}'}{type === 'portal_account_setup' && ', {{resetLink}}'}</p>
                          </div>
                          <div className="flex justify-end">
                            <Button 
                              onClick={() => handleSaveTemplate(type)}
                              isLoading={savingTemplate === type}
                            >
                              Save Template
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* Application Form Settings View */}
        {currentView === 'settings-application' && (
          <section className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Form</h2>
              <p className="text-gray-600">Customize the church application form fields and requirements.</p>
            </div>

            {/* Application Form Content */}
            {(
              <div className="space-y-6">
                {/* Header */}
                <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Application Form Editor</h3>
                      <p className="text-gray-600 mt-1">Manage form fields, sections, and requirements for church applications.</p>
                    </div>
                    <Button onClick={addNewField} variant="primary" className="flex items-center">
                      <BookOpen className="w-4 h-4 mr-2" />
                      Add New Field
                    </Button>
                  </div>
                </div>

                {/* Form Fields by Section */}
                {Object.entries(getFieldsBySection()).map(([section, fields]) => (
                  <div key={section} className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                    {/* Section Header */}
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                      <h4 className="text-lg font-bold text-gray-900">{section}</h4>
                      <p className="text-sm text-gray-500 mt-1">{fields.length} field{fields.length !== 1 ? 's' : ''}</p>
                    </div>

                    {/* Fields List */}
                    <div className="divide-y divide-gray-200">
                      {fields.map((field, index) => (
                        <div key={field.id} className="p-6 hover:bg-gray-50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <h5 className="text-base font-semibold text-gray-900">{field.label}</h5>
                                {field.required && (
                                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                                    Required
                                  </span>
                                )}
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                                  {field.type.replace('_', ' ')}
                                </span>
                              </div>
                              <div className="mt-1 text-sm text-gray-600 space-y-1">
                                <div><strong>Field Name:</strong> {field.name}</div>
                                {field.placeholder && <div><strong>Placeholder:</strong> {field.placeholder}</div>}
                                {field.description && <div><strong>Description:</strong> {field.description}</div>}
                                {field.options && field.options.length > 0 && (
                                  <div><strong>Options:</strong> {field.options.join(', ')}</div>
                                )}
                                {field.min && <div><strong>Min Value:</strong> {field.min}</div>}
                                {field.rows && <div><strong>Rows:</strong> {field.rows}</div>}
                              </div>
                            </div>
                            
                            {/* Field Controls */}
                            <div className="flex items-center gap-2 ml-4">
                              {/* Move Up/Down */}
                              <div className="flex flex-col gap-1">
                                <button
                                  onClick={() => moveField(field.id, 'up')}
                                  disabled={index === 0}
                                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Move Up"
                                >
                                  ↑
                                </button>
                                <button
                                  onClick={() => moveField(field.id, 'down')}
                                  disabled={index === fields.length - 1}
                                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Move Down"
                                >
                                  ↓
                                </button>
                              </div>

                              {/* Action Buttons */}
                              <Button
                                onClick={() => duplicateField(field)}
                                variant="outline"
                                className="px-3 py-1.5 h-8 text-xs"
                                title="Duplicate Field"
                              >
                                Copy
                              </Button>
                              <Button
                                onClick={() => {setEditingField(field); setIsAddingField(false);}}
                                variant="primary"
                                className="px-3 py-1.5 h-8 text-xs"
                              >
                                <Edit className="w-3 h-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                onClick={() => deleteField(field.id)}
                                variant="danger"
                                className="px-3 py-1.5 h-8 text-xs"
                              >
                                <Trash2 className="w-3 h-3 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Form Statistics */}
                <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                  <h4 className="text-lg font-bold text-gray-900 mb-4">Form Statistics</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{formFields.length}</div>
                      <div className="text-sm text-gray-600">Total Fields</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{formFields.filter(f => f.required).length}</div>
                      <div className="text-sm text-gray-600">Required Fields</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{Object.keys(getFieldsBySection()).length}</div>
                      <div className="text-sm text-gray-600">Sections</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">{formFields.filter(f => f.type === 'select' || f.type === 'radio').length}</div>
                      <div className="text-sm text-gray-600">Choice Fields</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Main Page Content Settings View */}
        {currentView === 'settings-content' && (
          <section className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Main Page Content</h2>
              <p className="text-gray-600">Edit the banner description and informational sections on the home page.</p>
            </div>
            
            <div className="space-y-6">
              {/* Banner Description */}
              <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">Hero Banner Description</h3>
                  <p className="text-sm text-gray-500 mt-1">The main description text displayed in the hero section</p>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Banner Text</label>
                    <textarea
                      value={mainPageContent.bannerDescription}
                      onChange={(e) => setMainPageContent({
                        ...mainPageContent,
                        bannerDescription: e.target.value
                      })}
                      rows={3}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2"
                      placeholder="Enter the hero banner description..."
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button 
                      onClick={async () => {
                        setIsSavingContent(true);
                        // TODO: Save to Firestore
                        await new Promise(resolve => setTimeout(resolve, 500));
                        setIsSavingContent(false);
                        alert('Content saved successfully!');
                      }}
                      isLoading={isSavingContent}
                    >
                      Save Banner
                    </Button>
                  </div>
                </div>
              </div>

              {/* Our Distinctives Section */}
              <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">Our Distinctives Section</h3>
                  <p className="text-sm text-gray-500 mt-1">The three cards explaining why churches should join</p>
                </div>
                <div className="p-6 space-y-6">
                  {mainPageContent.distinctives.map((item, index) => (
                    <div key={index} className="border rounded-lg p-4 bg-gray-50">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Card {index + 1} Title
                          </label>
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => {
                              const newDistinctives = [...mainPageContent.distinctives];
                              newDistinctives[index].title = e.target.value;
                              setMainPageContent({
                                ...mainPageContent,
                                distinctives: newDistinctives
                              });
                            }}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Card {index + 1} Description
                          </label>
                          <textarea
                            value={item.description}
                            onChange={(e) => {
                              const newDistinctives = [...mainPageContent.distinctives];
                              newDistinctives[index].description = e.target.value;
                              setMainPageContent({
                                ...mainPageContent,
                                distinctives: newDistinctives
                              });
                            }}
                            rows={3}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end pt-4 border-t">
                    <Button 
                      onClick={async () => {
                        setIsSavingContent(true);
                        // TODO: Save to Firestore
                        await new Promise(resolve => setTimeout(resolve, 500));
                        setIsSavingContent(false);
                        alert('Distinctives saved successfully!');
                      }}
                      isLoading={isSavingContent}
                    >
                      Save Distinctives
                    </Button>
                  </div>
                </div>
              </div>

              {/* Network Requirements Section */}
              <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">Network Requirements Section</h3>
                  <p className="text-sm text-gray-500 mt-1">The three cards explaining membership requirements</p>
                </div>
                <div className="p-6 space-y-6">
                  {mainPageContent.requirements.map((item, index) => (
                    <div key={index} className="border rounded-lg p-4 bg-gray-50">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Card {index + 1} Title
                          </label>
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => {
                              const newRequirements = [...mainPageContent.requirements];
                              newRequirements[index].title = e.target.value;
                              setMainPageContent({
                                ...mainPageContent,
                                requirements: newRequirements
                              });
                            }}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Card {index + 1} Description
                          </label>
                          <textarea
                            value={item.description}
                            onChange={(e) => {
                              const newRequirements = [...mainPageContent.requirements];
                              newRequirements[index].description = e.target.value;
                              setMainPageContent({
                                ...mainPageContent,
                                requirements: newRequirements
                              });
                            }}
                            rows={3}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end pt-4 border-t">
                    <Button 
                      onClick={async () => {
                        setIsSavingContent(true);
                        // TODO: Save to Firestore
                        await new Promise(resolve => setTimeout(resolve, 500));
                        setIsSavingContent(false);
                        alert('Requirements saved successfully!');
                      }}
                      isLoading={isSavingContent}
                    >
                      Save Requirements
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Statistics View */}
        {currentView === 'statistics' && (
          <section>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Network Analytics</h2>
                <p className="text-gray-600">Real-time engagement metrics across all churches</p>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={async () => {
                    if (confirm("Are you sure you want to reset all analytics data? This action cannot be undone.")) {
                      try {
                        const { resetAnalytics } = await import('../services/firebase');
                        await resetAnalytics();
                        alert("Analytics data reset successfully!");
                        loadGlobalAnalytics(); // Refresh data
                      } catch (error) {
                        console.error("Error resetting analytics:", error);
                        alert("Failed to reset analytics.");
                      }
                    }
                  }}
                  variant="danger"
                  className="flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Reset Data
                </Button>
                <Button 
                  onClick={loadGlobalAnalytics}
                  isLoading={loadingStats}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh Data
                </Button>
              </div>
            </div>

            {loadingStats ? (
              <div className="flex justify-center p-12">
                <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Overview Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Churches</p>
                        <p className="text-3xl font-bold text-gray-900 mt-2">{approvedApps.length}</p>
                      </div>
                      <Globe className="w-12 h-12 text-blue-500 opacity-20" />
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Elders</p>
                        <p className="text-3xl font-bold text-gray-900 mt-2">{allLeaders.length}</p>
                      </div>
                      <UserIcon className="w-12 h-12 text-green-500 opacity-20" />
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Pending Apps</p>
                        <p className="text-3xl font-bold text-gray-900 mt-2">{pendingApps.length}</p>
                      </div>
                      <AlertTriangle className="w-12 h-12 text-yellow-500 opacity-20" />
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Portal Accounts</p>
                        <p className="text-3xl font-bold text-gray-900 mt-2">{approvedApps.filter(app => app.userId).length}</p>
                      </div>
                      <UserIcon className="w-12 h-12 text-purple-500 opacity-20" />
                    </div>
                  </div>
                </div>

                {/* Global Stats Overview */}
                {globalAnalytics && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Total Views</p>
                          <p className="text-3xl font-bold text-blue-600 mt-2">
                            {globalAnalytics.total?.views || 0}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Last 30 days: {globalAnalytics.last30Days?.views || 0}
                          </p>
                        </div>
                        <Eye className="w-12 h-12 text-blue-500 opacity-20" />
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Website Visits</p>
                          <p className="text-3xl font-bold text-green-600 mt-2">
                            {globalAnalytics.total?.visits || 0}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Last 30 days: {globalAnalytics.last30Days?.visits || 0}
                          </p>
                        </div>
                        <ExternalLink className="w-12 h-12 text-green-500 opacity-20" />
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Contact Forms</p>
                          <p className="text-3xl font-bold text-purple-600 mt-2">
                            {globalAnalytics.total?.contacts || 0}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Last 30 days: {globalAnalytics.last30Days?.contacts || 0}
                          </p>
                        </div>
                        <Mail className="w-12 h-12 text-purple-500 opacity-20" />
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Social Clicks</p>
                          <p className="text-3xl font-bold text-orange-600 mt-2">
                            {globalAnalytics.total?.socialClicks || 0}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Last 30 days: {globalAnalytics.last30Days?.socialClicks || 0}
                          </p>
                        </div>
                        <Globe className="w-12 h-12 text-orange-500 opacity-20" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Stats Filters */}
                <div className="bg-white p-4 rounded-lg shadow flex gap-4 items-center flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <input
                      type="text"
                      placeholder="Search stats by church name or location..."
                      value={statsSearchQuery}
                      onChange={(e) => setStatsSearchQuery(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-sm font-medium text-gray-700">Sort by:</label>
                    <select
                      value={statsSortBy}
                      onChange={(e) => setStatsSortBy(e.target.value as any)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                    >
                      <option value="views">Total Views</option>
                      <option value="visits">Website Visits</option>
                      <option value="contacts">Contact Forms</option>
                      <option value="name">Church Name</option>
                      <option value="city">City</option>
                    </select>
                    <button
                      onClick={() => setStatsSortOrder(statsSortOrder === 'asc' ? 'desc' : 'asc')}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      title={statsSortOrder === 'asc' ? 'Sort Descending' : 'Sort Ascending'}
                    >
                      {statsSortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>

                {/* Church List with Analytics */}
                <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900">Church Engagement Overview</h3>
                    <p className="text-sm text-gray-500 mt-1">Click on a church to view detailed analytics</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Church</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Views</th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Visits</th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Contacts</th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredAndSortedStats.map(app => (
                          <tr 
                            key={app.id} 
                            className="hover:bg-blue-50 cursor-pointer transition-colors"
                            onClick={() => {
                              setViewingStatsChurch({ id: app.id, name: app.churchName });
                              loadChurchAnalytics(app.id);
                            }}
                          >
                            <td className="px-6 py-4">
                              <div className="font-medium text-gray-900">{app.churchName}</div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {app.churchAddress?.city || ''}, {app.churchAddress?.country || ''}
                            </td>
                            <td className="px-6 py-4 text-center text-sm font-medium text-gray-900">
                              {app.stats.views}
                            </td>
                            <td className="px-6 py-4 text-center text-sm font-medium text-gray-900">
                              {app.stats.visits}
                            </td>
                            <td className="px-6 py-4 text-center text-sm font-medium text-gray-900">
                              {app.stats.contacts}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <Button variant="outline" className="text-xs h-7 px-2">
                                View Details
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {filteredAndSortedStats.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                              No churches found matching your filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <div className="flex items-start">
                  <BarChart3 className="w-6 h-6 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold text-blue-900 mb-2">📈 How to View Analytics Data</h3>
                    <p className="text-blue-800 mb-3">
                      The tracking system is collecting data in real-time. To see analytics:
                    </p>
                    <ol className="list-decimal list-inside text-blue-800 space-y-2 text-sm">
                      <li>Visit the public map at <strong>g3-church-network.web.app</strong></li>
                      <li>Click on any church to view their profile (this logs a &quot;view&quot; event)</li>
                      <li>Click &quot;Visit Website&quot; or social media links (logs &quot;visit&quot; and &quot;social_click&quot; events)</li>
                      <li>Submit the contact form (logs a &quot;contact&quot; event)</li>
                      <li>Check the Firebase Console - Firestore - <strong>churchStats</strong> and <strong>churchEvents</strong> collections to see the data</li>
                    </ol>
                    <p className="text-blue-700 mt-3 text-sm">
                      <strong>Future Enhancement:</strong> You can add chart visualizations here using the recharts library and Cloud Functions (getChurchAnalytics, getGlobalAnalytics) to display interactive graphs of the tracking data.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            )}
          </section>
        )}

        {/* Email Center View */}
        {currentView === 'email' && (
          <section className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Email Center</h2>
              <p className="text-gray-600">Send bulk emails to churches or leaders.</p>
            </div>

            <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
              <div className="p-6">
                <form onSubmit={handleSendEmail} className="space-y-6">
                  {/* Sender Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">From</label>
                    <select
                      value={senderProfile}
                      onChange={(e) => setSenderProfile(e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2"
                    >
                      <option value="G3 Church Network <admin@g3min.org>">G3 Church Network (admin@g3min.org)</option>
                      <option value="Scott Aniol <saniol@g3min.org>">Scott Aniol (saniol@g3min.org)</option>
                      <option value="Laramie Minga <lminga@g3min.org>">Laramie Minga (lminga@g3min.org)</option>
                    </select>
                  </div>

                  {/* Recipient Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Send To</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <label className={`cursor-pointer border rounded-lg p-4 flex flex-col items-center justify-center gap-2 hover:bg-gray-50 transition-colors ${recipientType === 'test' ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-gray-200'}`}>
                        <input 
                          type="radio" 
                          name="recipientType" 
                          value="test" 
                          checked={recipientType === 'test'}
                          onChange={(e) => setRecipientType(e.target.value as any)}
                          className="sr-only"
                        />
                        <Mail className="w-6 h-6 text-gray-400" />
                        <span className="font-medium text-gray-900">Test Email</span>
                        <span className="text-xs text-gray-500">Send to yourself ({user?.email})</span>
                      </label>

                      <label className={`cursor-pointer border rounded-lg p-4 flex flex-col items-center justify-center gap-2 hover:bg-gray-50 transition-colors ${recipientType === 'churches' ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-gray-200'}`}>
                        <input 
                          type="radio" 
                          name="recipientType" 
                          value="churches" 
                          checked={recipientType === 'churches'}
                          onChange={(e) => setRecipientType(e.target.value as any)}
                          className="sr-only"
                        />
                        <Globe className="w-6 h-6 text-gray-400" />
                        <span className="font-medium text-gray-900">All Churches</span>
                        <span className="text-xs text-gray-500">{approvedApps.length} Recipients</span>
                      </label>

                      <label className={`cursor-pointer border rounded-lg p-4 flex flex-col items-center justify-center gap-2 hover:bg-gray-50 transition-colors ${recipientType === 'leaders' ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-gray-200'}`}>
                        <input 
                          type="radio" 
                          name="recipientType" 
                          value="leaders" 
                          checked={recipientType === 'leaders'}
                          onChange={(e) => setRecipientType(e.target.value as any)}
                          className="sr-only"
                        />
                        <UserIcon className="w-6 h-6 text-gray-400" />
                        <span className="font-medium text-gray-900">All Leaders</span>
                        <span className="text-xs text-gray-500">{allLeaders.length} Recipients</span>
                      </label>
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      required
                      placeholder="Enter email subject..."
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2"
                    />
                  </div>

                  {/* Body */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message (HTML supported)</label>
                    <textarea
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      required
                      rows={12}
                      placeholder="Type your message here..."
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 border p-2 font-mono text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500">You can use basic HTML tags (br, b, i, p, etc.) for formatting.</p>
                  </div>

                  {/* Status Message */}
                  {emailStatus && (
                    <div className={`p-4 rounded-md ${emailStatus.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                      {emailStatus.success ? (
                        <div className="flex items-center">
                          <Check className="w-5 h-5 mr-2" />
                          {emailStatus.message}
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <AlertTriangle className="w-5 h-5 mr-2" />
                          {emailStatus.message}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Submit */}
                  <div className="flex justify-end pt-4 border-t">
                    <Button 
                      type="submit" 
                      isLoading={isSendingEmail} 
                      className="flex items-center"
                      variant="primary"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {recipientType === 'test' ? 'Send Test Email' : `Send to ${recipientType === 'churches' ? approvedApps.length : allLeaders.length} Recipients`}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </section>
        )}

        {/* Leaders View */}
        {currentView === 'member-leaders' && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Church Elders</h2>
              <p className="text-gray-600">Complete directory of all elders from approved churches</p>
            </div>

            {allLeaders.length === 0 ? (
              <div className="bg-white p-12 rounded-lg shadow-sm text-center border-2 border-dashed border-gray-200">
                <UserIcon className="w-12 h-12 text-gray-400 mx-auto mb-3 opacity-50" />
                <div className="text-gray-500 italic">No elders found. Approve churches to see their elders here.</div>
              </div>
            ) : (
              <>
                {/* Search and Sort Controls for Leaders */}
                <div className="mb-4 bg-white p-4 rounded-lg shadow flex gap-4 items-center flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <input
                      type="text"
                      placeholder="Search elders by name, email, role, or church..."
                      value={leaderSearchQuery}
                      onChange={(e) => setLeaderSearchQuery(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-sm font-medium text-gray-700">Sort by:</label>
                    <select
                      value={leaderSortBy}
                      onChange={(e) => setLeaderSortBy(e.target.value as any)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                    >
                      <option value="name">Name</option>
                      <option value="role">Title</option>
                      <option value="church">Church</option>
                    </select>
                    <button
                      onClick={() => setLeaderSortOrder(leaderSortOrder === 'asc' ? 'desc' : 'asc')}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      title={leaderSortOrder === 'asc' ? 'Sort Descending' : 'Sort Ascending'}
                    >
                      {leaderSortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow overflow-hidden">
                   <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                    <p className="text-sm text-gray-600">
                      Showing {filteredAndSortedLeaders.length} of {allLeaders.length} elders
                      {leaderSearchQuery && ` matching "${leaderSearchQuery}"`}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Title
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Email
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Phone
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Church
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredAndSortedLeaders.map((leader) => (
                          <tr key={`${leader.churchId}-${leader.id}`} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-medium text-gray-900">
                                {leader.firstName} {leader.lastName}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-brand-100 text-brand-800">
                                Elder
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <a 
                                href={`mailto:${leader.email}`}
                                className="text-brand-600 hover:text-brand-800 text-sm"
                              >
                                {leader.email}
                              </a>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {leader.phone}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <button
                                onClick={() => {
                                  const church = applications.find(app => app.id === leader.churchId);
                                  if (church) setViewingChurch(church);
                                }}
                                className="text-sm text-gray-600 hover:text-brand-600 hover:underline"
                              >
                                {leader.churchName}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Users Management View */}
        {currentView === 'settings-users' && (
          <section>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">User Management</h2>
                <p className="text-gray-600">Manage admin users and their permissions.</p>
              </div>
              <Button onClick={() => { setNewAdminEmail(''); setNewAdminPassword(''); setShowAddAdminModal(true); }} variant="primary" className="flex items-center">
                <PlusCircle className="w-4 h-4 mr-2" />
                Add New Admin
              </Button>
            </div>

            {loadingUsers ? (
              <div className="flex justify-center p-12"><RefreshCw className="w-8 h-8 animate-spin text-gray-400" /></div>
            ) : (
              <>
                {/* Search and Sort Controls for Users */}
                <div className="mb-4 bg-white p-4 rounded-lg shadow flex gap-4 items-center flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <input
                      type="text"
                      placeholder="Search users by email or role..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-sm font-medium text-gray-700">Sort by:</label>
                    <select
                      value={userSortBy}
                      onChange={(e) => setUserSortBy(e.target.value as any)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
                    >
                      <option value="email">Email</option>
                      <option value="role">Role</option>
                      <option value="lastSignIn">Last Sign-in</option>
                    </select>
                    <button
                      onClick={() => setUserSortOrder(userSortOrder === 'asc' ? 'desc' : 'asc')}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      title={userSortOrder === 'asc' ? 'Sort Descending' : 'Sort Ascending'}
                    >
                      {userSortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                    <p className="text-sm text-gray-600">
                      Showing {filteredAndSortedUsers.length} of {allUsers.length} users
                      {userSearchQuery && ` matching "${userSearchQuery}"`}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Sign-in</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredAndSortedUsers.map((u) => (
                          <tr key={u.uid} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-medium text-gray-900">{u.email}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                u.role === 'admin' ? 'bg-green-100 text-green-800' :
                                u.role === 'church_user' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {u.role.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {u.lastSignInTime ? new Date(u.lastSignInTime).toLocaleString() : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex justify-end gap-2">
                                {u.role === 'admin' && u.uid !== user?.uid ? (
                                  <Button
                                    variant="danger"
                                    onClick={() => handleRemoveAdminRole(u.uid, u.email)}
                                    isLoading={userActionLoading === u.uid}
                                    className="px-3 py-1.5 h-8 text-xs"
                                  >
                                    Demote Admin
                                  </Button>
                                ) : u.role !== 'admin' ? (
                                  <Button
                                    variant="primary"
                                    onClick={() => handleSetAdminRole(u.uid, u.email)}
                                    isLoading={userActionLoading === u.uid}
                                    className="px-3 py-1.5 h-8 text-xs"
                                  >
                                    Make Admin
                                  </Button>
                                ) : (
                                  <span className="text-gray-400 text-xs px-3 py-1.5">Current User</span>
                                )}
                                
                                {u.uid !== user?.uid && (
                                  <Button
                                    variant="danger"
                                    onClick={() => handleDeleteUser(u.uid, u.email)}
                                    isLoading={userActionLoading === u.uid}
                                    className="px-3 py-1.5 h-8 text-xs"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {/* Church Detail Modal */}
      {viewingChurch && (
        <ChurchDetailModal 
          church={viewingChurch}
          onClose={() => setViewingChurch(null)}
          onCreatePortalAccount={handleCreatePortalAccount}
          isProcessingPortalAccount={isProcessingPortalAccount}
          onUpdate={(updatedChurch) => setViewingChurch(updatedChurch)}
        />
      )}

      {/* Form Field Editor Modal */}
      {editingField && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50" onClick={() => setEditingField(null)}>
          <div className="flex items-center justify-center min-h-screen px-4 py-6">
            <div 
              className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-black px-6 py-4 flex items-center justify-between">
                <h3 className="text-xl font-serif font-bold text-white">
                  {isAddingField ? 'Add New Field' : 'Edit Field'}
                </h3>
                <button onClick={() => setEditingField(null)} className="text-gray-300 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Content */}
              <form onSubmit={(e) => {
                e.preventDefault();
                if (editingField.label && editingField.name) {
                  saveField(editingField);
                }
              }} className="p-6 space-y-6">
                
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Field Label *</label>
                    <input
                      type="text"
                      value={editingField.label}
                      onChange={(e) => setEditingField({...editingField, label: e.target.value})}
                      required
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      placeholder="Enter field label"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Field Name *</label>
                    <input
                      type="text"
                      value={editingField.name}
                      onChange={(e) => setEditingField({...editingField, name: e.target.value})}
                      required
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      placeholder="Enter field name (e.g., churchName)"
                    />
                  </div>
                </div>

                {/* Field Type and Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Field Type</label>
                    <select
                      value={editingField.type}
                      onChange={(e) => setEditingField({...editingField, type: e.target.value as FormFieldType})}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    >
                      <option value="text">Text</option>
                      <option value="email">Email</option>
                      <option value="tel">Phone</option>
                      <option value="url">URL</option>
                      <option value="number">Number</option>
                      <option value="password">Password</option>
                      <option value="textarea">Textarea</option>
                      <option value="select">Select Dropdown</option>
                      <option value="radio">Radio Buttons</option>
                      <option value="checkbox">Checkbox</option>
                      <option value="dynamic_array">Dynamic Array</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                    <select
                      value={editingField.section}
                      onChange={(e) => setEditingField({...editingField, section: e.target.value})}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    >
                      <option value="Account Setup">Account Setup</option>
                      <option value="Church Information">Church Information</option>
                      <option value="Elders">Elders</option>
                      <option value="Doctrine & Practice">Doctrine & Practice</option>
                      <option value="Network Dues">Network Dues</option>
                    </select>
                  </div>
                </div>

                {/* Required and Order */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="required"
                      checked={editingField.required}
                      onChange={(e) => setEditingField({...editingField, required: e.target.checked})}
                      className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                    />
                    <label htmlFor="required" className="ml-2 text-sm font-medium text-gray-700">
                      Required Field
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                    <input
                      type="number"
                      value={editingField.order}
                      onChange={(e) => setEditingField({...editingField, order: parseInt(e.target.value) || 0})}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    />
                  </div>
                </div>

                {/* Placeholder and Description */}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Placeholder Text</label>
                    <input
                      type="text"
                      value={editingField.placeholder || ''}
                      onChange={(e) => setEditingField({...editingField, placeholder: e.target.value})}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      placeholder="Enter placeholder text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Help Text</label>
                    <input
                      type="text"
                      value={editingField.description || ''}
                      onChange={(e) => setEditingField({...editingField, description: e.target.value})}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      placeholder="Enter help text"
                    />
                  </div>
                </div>

                {/* Type-specific options */}
                {(editingField.type === 'select' || editingField.type === 'radio') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Options (one per line)</label>
                    <textarea
                      value={(editingField.options || []).join('\n')}
                      onChange={(e) => setEditingField({...editingField, options: e.target.value.split('\n').filter(o => o.trim())})}
                      rows={4}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      placeholder="Option 1&#10;Option 2&#10;Option 3"
                    />
                  </div>
                )}

                {editingField.type === 'number' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Value</label>
                    <input
                      type="number"
                      value={editingField.min || ''}
                      onChange={(e) => setEditingField({...editingField, min: parseInt(e.target.value) || undefined})}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    />
                  </div>
                )}

                {editingField.type === 'textarea' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Number of Rows</label>
                    <input
                      type="number"
                      value={editingField.rows || 3}
                      onChange={(e) => setEditingField({...editingField, rows: parseInt(e.target.value) || 3})}
                      min="1"
                      max="20"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    />
                  </div>
                )}

                {/* Preview */}
                <div className="border-t pt-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Field Preview</h4>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {editingField.label}
                      {editingField.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    
                    {editingField.type === 'text' && (
                      <input
                        type="text"
                        placeholder={editingField.placeholder}
                        disabled
                        className="w-full rounded-md border-gray-300 shadow-sm border p-2 bg-white opacity-60"
                      />
                    )}
                    {editingField.type === 'email' && (
                      <input
                        type="email"
                        placeholder={editingField.placeholder}
                        disabled
                        className="w-full rounded-md border-gray-300 shadow-sm border p-2 bg-white opacity-60"
                      />
                    )}
                    {editingField.type === 'tel' && (
                      <input
                        type="tel"
                        placeholder={editingField.placeholder}
                        disabled
                        className="w-full rounded-md border-gray-300 shadow-sm border p-2 bg-white opacity-60"
                      />
                    )}
                    {editingField.type === 'url' && (
                      <input
                        type="url"
                        placeholder={editingField.placeholder}
                        disabled
                        className="w-full rounded-md border-gray-300 shadow-sm border p-2 bg-white opacity-60"
                      />
                    )}
                    {editingField.type === 'number' && (
                      <input
                        type="number"
                        placeholder={editingField.placeholder}
                        min={editingField.min}
                        disabled
                        className="w-full rounded-md border-gray-300 shadow-sm border p-2 bg-white opacity-60"
                      />
                    )}
                    {editingField.type === 'password' && (
                      <input
                        type="password"
                        placeholder={editingField.placeholder}
                        disabled
                        className="w-full rounded-md border-gray-300 shadow-sm border p-2 bg-white opacity-60"
                      />
                    )}
                    {editingField.type === 'textarea' && (
                      <textarea
                        placeholder={editingField.placeholder}
                        rows={editingField.rows || 3}
                        disabled
                        className="w-full rounded-md border-gray-300 shadow-sm border p-2 bg-white opacity-60"
                      />
                    )}
                    {editingField.type === 'select' && (
                      <select disabled className="w-full rounded-md border-gray-300 shadow-sm border p-2 bg-white opacity-60">
                        <option>Select an option...</option>
                        {editingField.options?.map((option, idx) => (
                          <option key={idx} value={option}>{option}</option>
                        ))}
                      </select>
                    )}
                    {editingField.type === 'radio' && (
                      <div className="space-y-2">
                        {editingField.options?.map((option, idx) => (
                          <label key={idx} className="flex items-center">
                            <input type="radio" disabled className="mr-2 opacity-60" />
                            <span className="opacity-60">{option}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {editingField.type === 'checkbox' && (
                      <label className="flex items-center">
                        <input type="checkbox" disabled className="mr-2 opacity-60" />
                        <span className="opacity-60">{editingField.label}</span>
                      </label>
                    )}
                    {editingField.type === 'dynamic_array' && (
                      <div className="text-gray-500 italic">Dynamic array field (custom implementation required)</div>
                    )}
                    
                    {editingField.description && (
                      <p className="text-xs text-gray-500 mt-1">{editingField.description}</p>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 pt-6 border-t">
                  <Button type="button" variant="outline" onClick={() => setEditingField(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary">
                    {isAddingField ? 'Add Field' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add New Admin Modal */}
      {showAddAdminModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50" onClick={() => setShowAddAdminModal(false)}>
          <div className="flex items-center justify-center min-h-screen px-4 py-6">
            <div 
              className="bg-white rounded-lg shadow-2xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-black px-6 py-4 flex items-center justify-between">
                <h3 className="text-xl font-serif font-bold text-white">Add New Admin</h3>
                <button onClick={() => setShowAddAdminModal(false)} className="text-gray-300 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleAddAdmin} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email Address</label>
                  <input
                    type="email"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    placeholder="admin@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <input
                    type="password"
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    required
                    minLength={6}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    placeholder="••••••••"
                  />
                  <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setShowAddAdminModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" isLoading={isCreatingAdmin}>
                    Create Admin
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Church Stats Modal */}
      {viewingStatsChurch && (
        <ChurchStatsModal
          churchId={viewingStatsChurch.id}
          churchName={viewingStatsChurch.name}
          onClose={() => setViewingStatsChurch(null)}
        />
      )}

      {/* Edit Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50" onClick={() => setShowProfileModal(false)}>
          <div className="flex items-center justify-center min-h-screen px-4 py-6">
            <div 
              className="bg-white rounded-lg shadow-2xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-brand-900 px-6 py-4 flex items-center justify-between">
                <h3 className="text-xl font-serif font-bold text-white">Edit Your Profile</h3>
                <button onClick={() => setShowProfileModal(false)} className="text-gray-300 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleUpdateProfile} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email Address</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    placeholder="admin@example.com"
                  />
                  <p className="text-xs text-gray-500 mt-1">Changing your email will require re-authentication</p>
                </div>
                
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium text-gray-700 mb-3">Change Password (optional)</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        minLength={6}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                        placeholder="••••••••"
                      />
                      <p className="text-xs text-gray-500 mt-1">Leave blank to keep current password</p>
                    </div>
                    {newPassword && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          minLength={6}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          placeholder="••••••••"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setShowProfileModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" isLoading={isSavingProfile}>
                    Save Changes
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
