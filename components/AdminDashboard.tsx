import React, { useState, useEffect, useRef } from 'react';
import { ChurchApplication, ApplicationStatus, ChurchLeader, ChurchGathering, EmailTemplate, EmailType } from '../types';
import { Button } from './Button';
import { Check, X, MapPin, Globe, ExternalLink, ArrowLeft, LogOut, Lock, User as UserIcon, BookOpen, ShieldCheck, Trash2, Eye, AlertTriangle, Edit, Download, Upload, Settings, RefreshCw, Ban, Slash } from 'lucide-react';
import { auth, loginWithEmail, registerWithEmail, logout, subscribeToAllApplications, updateApplicationStatus, User, onAuthStateChanged, deleteChurchApplication, updateChurchProfile, submitApplication, updateChurchCoordinates, uploadChurchLogo, sendEmail, saveEmailTemplate, getEmailTemplate, resendSystemEmail, approveApplication, createChurchUserAndSendResetEmailClient, backfillGeocodes, regeocodeAddress } from '../services/firebase';
import { Mail, Send } from 'lucide-react';

interface AdminDashboardProps {
  onBack: () => void;
}

const InfoRow: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div>
    <dt className="text-sm font-medium text-gray-500">{label}</dt>
    <dd className="mt-1 text-sm text-gray-900">{value || 'N/A'}</dd>
  </div>
);

type AdminView = 'pending' | 'approved' | 'rejected' | 'leaders' | 'email' | 'settings';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [applications, setApplications] = useState<ChurchApplication[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [viewingChurch, setViewingChurch] = useState<ChurchApplication | null>(null);
  const [deletingChurch, setDeletingChurch] = useState<ChurchApplication | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [currentView, setCurrentView] = useState<AdminView>('pending');
  const [isProcessingPortalAccount, setIsProcessingPortalAccount] = useState(false); // Moved state up
  
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
          'dues_reminder_30', 'dues_reminder_7', 'dues_reminder_0', 'dues_delinquent'
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

  // Auth Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
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

  // Filter and sort approved churches
  const filteredAndSortedApprovedApps = approvedApps
    .filter(app => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      const address = app.churchAddress || {};
      return (
        app.churchName.toLowerCase().includes(query) ||
        (address.city && address.city.toLowerCase().includes(query)) ||
        (address.state && address.state.toLowerCase().includes(query)) ||
        (address.country && address.country.toLowerCase().includes(query)) ||
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
          comparison = (aAddress.city || '').localeCompare(bAddress.city || '');
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
      'Website',
      'Description',
      'Leaders (JSON)',
      'Gatherings (JSON)',
      'Facebook',
      'X/Twitter',
      'Instagram',
      'YouTube',
      'Spotify',
      'Apple Podcasts',
      'Plurality of Elders',
      'Church Discipline',
      'SSJG Signed',
      'Confession Affirmation',
      'Latitude',
      'Longitude',
      'Status',
      'Submitted At'
    ];

    const rows = approvedApps.map(app => {
      const address = app.churchAddress || {};
      const connections = app.connections || {};
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
        connections.website || '',
        app.churchDescription?.replace(/"/g, '""') || '', // Escape quotes
        JSON.stringify(app.leaders || []),
        JSON.stringify(app.gatherings || []),
        connections.facebook || '',
        connections.x || '',
        connections.instagram || '',
        connections.youtube || '',
        connections.spotify || '',
        connections.applePodcasts || '',
        app.pluralityOfElders || '',
        app.churchDiscipline || '',
        app.ssjgSigned || '',
        app.confessionAffirmation?.replace(/"/g, '""') || '', // Escape quotes
        app.coordinates?.lat || '',
        app.coordinates?.lng || '',
        app.status || '',
        app.submittedAt || ''
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

    if (!confirm(`This will import churches from the CSV file as approved churches. Continue?`)) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setIsImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        alert('CSV file appears to be empty or invalid.');
        return;
      }

      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
      
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          // Parse CSV line (handle quoted fields with commas)
          const values: string[] = [];
          let currentValue = '';
          let insideQuotes = false;
          
          for (let char of lines[i]) {
            if (char === '"') {
              insideQuotes = !insideQuotes;
            } else if (char === ',' && !insideQuotes) {
              values.push(currentValue.trim());
              currentValue = '';
            } else {
              currentValue += char;
            }
          }
          values.push(currentValue.trim());

          const data: any = {};
          headers.forEach((header, index) => {
            data[header] = values[index]?.replace(/^"|"$/g, '') || '';
          });

          // Validate required fields
          if (!data['Church Name'] || !data['City'] || !data['Country']) {
            throw new Error(`Missing required fields (Church Name, City, or Country) on line ${i + 1}`);
          }

          // Parse leaders and gatherings from JSON
          let leaders: ChurchLeader[] = [];
          let gatherings: ChurchGathering[] = [];
          
          try {
            if (data['Leaders (JSON)'] && data['Leaders (JSON)'].trim()) {
              leaders = JSON.parse(data['Leaders (JSON)']);
            }
          } catch (e) {
            console.warn(`Failed to parse leaders on line ${i + 1}:`, e);
          }
          
          try {
            if (data['Gatherings (JSON)'] && data['Gatherings (JSON)'].trim()) {
              gatherings = JSON.parse(data['Gatherings (JSON)']);
            }
          } catch (e) {
            console.warn(`Failed to parse gatherings on line ${i + 1}:`, e);
          }

          // Build church data object, excluding undefined coordinates
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
            leaders: leaders,
            gatherings: gatherings,
            connections: {
              website: data['Website'] || '',
              facebook: data['Facebook'] || '',
              x: data['X/Twitter'] || '',
              instagram: data['Instagram'] || '',
              youtube: data['YouTube'] || '',
              spotify: data['Spotify'] || '',
              applePodcasts: data['Apple Podcasts'] || ''
            },
            pluralityOfElders: (data['Plurality of Elders'] || '') as any,
            churchDiscipline: (data['Church Discipline'] || '') as any,
            ssjgSigned: (data['SSJG Signed'] || '') as any,
            confessionAffirmation: data['Confession Affirmation'] || '',
            status: ApplicationStatus.APPROVED,
            applicantFirstName: data['Applicant First Name'] || 'CSV',
            applicantLastName: data['Applicant Last Name'] || 'Import',
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

          // Check if ID is provided and church exists
          const churchId = data['ID']?.trim();
          const existingChurch = churchId ? applications.find(app => app.id === churchId) : null;

          if (existingChurch) {
            // Update existing church
            console.log(`Updating church ${i}/${lines.length - 1}: ${churchData.churchName} (ID: ${churchId})`);
            await updateChurchProfile(churchId, churchData);
            successCount++;
            console.log(`✓ Successfully updated: ${churchData.churchName}`);
          } else {
            // Create new church
            console.log(`Creating church ${i}/${lines.length - 1}: ${churchData.churchName}`);
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

  if (!user) {
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
            {isRegistering ? 'Register to manage the network.' : 'Please sign in to manage church applications.'}
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

          <div className="mt-4 pt-4 border-t">
            <button 
              onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }} 
              className="text-sm text-brand-700 hover:text-brand-900 font-medium"
            >
              {isRegistering ? 'Already have an account? Sign In' : 'Need to create an account?'}
            </button>
          </div>

          <div className="mt-4">
            <Button variant="outline" onClick={onBack} className="w-full">Back to Home</Button>
          </div>
        </div>
      </div>
    );
  }

  // Church Detail Modal with Edit Mode
  const ChurchDetailModal = ({ church, onClose, onCreatePortalAccount, isProcessingPortalAccount }: { 
    church: ChurchApplication; 
    onClose: () => void;
    onCreatePortalAccount: (churchId: string, applicantEmail: string, churchName: string) => Promise<void>;
    isProcessingPortalAccount: boolean;
  }) => {
    const [isEditMode, setIsEditMode] = useState(false);
    const [editedChurch, setEditedChurch] = useState<ChurchApplication>(church);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [resendingEmail, setResendingEmail] = useState<EmailType | null>(null);

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
                      {church.status === ApplicationStatus.APPROVED && !church.userId && (
                        <Button
                          variant="outline"
                          onClick={handleCreatePortalAccount}
                          isLoading={isProcessingPortalAccount}
                          className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                        >
                          <UserIcon className="w-3 h-3" />
                          Create Portal Account
                        </Button>
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
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow label="Name" value={`${church.applicantFirstName} ${church.applicantLastName}`} />
                <InfoRow label="Email" value={church.applicantEmail} />
                <InfoRow label="Submitted" value={new Date(church.submittedAt).toLocaleString()} />
              </dl>
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
                          churchAddress: { ...editedChurch.churchAddress, street: e.target.value }
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
                          churchAddress: { ...editedChurch.churchAddress, aptUnit: e.target.value }
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
                          churchAddress: { ...editedChurch.churchAddress, city: e.target.value }
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
                          churchAddress: { ...editedChurch.churchAddress, state: e.target.value }
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
                          churchAddress: { ...editedChurch.churchAddress, postalCode: e.target.value }
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
                          churchAddress: { ...editedChurch.churchAddress, country: e.target.value }
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

              {/* Leadership */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-bold text-gray-900">Leadership</h4>
                  {isEditMode && (
                    <Button onClick={addLeader} variant="outline" className="text-sm">
                      + Add Leader
                    </Button>
                  )}
                </div>
                {isEditMode ? (
                  <div className="space-y-3">
                    {editedChurch.leaders.map((leader, index) => (
                      <div key={leader.id} className="bg-gray-50 p-3 rounded-md space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="First Name"
                            value={leader.firstName}
                            onChange={(e) => updateLeader(index, 'firstName', e.target.value)}
                            className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          />
                          <input
                            type="text"
                            placeholder="Last Name"
                            value={leader.lastName}
                            onChange={(e) => updateLeader(index, 'lastName', e.target.value)}
                            className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={leader.role}
                            onChange={(e) => updateLeader(index, 'role', e.target.value)}
                            className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          >
                            <option value="Elder">Elder</option>
                            <option value="Pastor">Pastor</option>
                            <option value="Deacon">Deacon</option>
                            <option value="Other">Other</option>
                          </select>
                          <input
                            type="email"
                            placeholder="Email"
                            value={leader.email}
                            onChange={(e) => updateLeader(index, 'email', e.target.value)}
                            className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          />
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="tel"
                            placeholder="Phone"
                            value={leader.phone}
                            onChange={(e) => updateLeader(index, 'phone', e.target.value)}
                            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          />
                          <Button variant="danger" onClick={() => removeLeader(index)} className="text-sm">
                            <X className="w-4 h-4" />
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
                      + Add Gathering
                    </Button>
                  )}
                </div>
                {isEditMode ? (
                  <div className="space-y-3">
                    {editedChurch.gatherings.map((gathering, index) => (
                      <div key={gathering.id} className="bg-gray-50 p-3 rounded-md space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Gathering Name"
                            value={gathering.name}
                            onChange={(e) => updateGathering(index, 'name', e.target.value)}
                            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          />
                          <Button variant="danger" onClick={() => removeGathering(index)} className="text-sm">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            value={gathering.day}
                            onChange={(e) => updateGathering(index, 'day', e.target.value)}
                            className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          >
                            <option value="Sunday">Sunday</option>
                            <option value="Monday">Monday</option>
                            <option value="Tuesday">Tuesday</option>
                            <option value="Wednesday">Wednesday</option>
                            <option value="Thursday">Thursday</option>
                            <option value="Friday">Friday</option>
                            <option value="Saturday">Saturday</option>
                          </select>
                          <input
                            type="text"
                            placeholder="Start Time"
                            value={gathering.startTime}
                            onChange={(e) => updateGathering(index, 'startTime', e.target.value)}
                            className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          />
                          <input
                            type="text"
                            placeholder="End Time"
                            value={gathering.endTime}
                            onChange={(e) => updateGathering(index, 'endTime', e.target.value)}
                            className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          />
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
                    {(['facebook', 'x', 'instagram', 'youtube', 'spotify', 'applePodcasts'] as const).map((platform) => (
                      <div key={platform}>
                        <label className="block text-sm font-medium text-gray-700 capitalize">
                          {platform === 'x' ? 'X (Twitter)' : platform === 'applePodcasts' ? 'Apple Podcasts' : platform}
                        </label>
                        <input
                          type="url"
                          value={editedChurch.connections?.[platform] || ''}
                          onChange={(e) => setEditedChurch({ 
                            ...editedChurch, 
                            connections: { ...editedChurch.connections, [platform]: e.target.value }
                          })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          placeholder="https://..."
                        />
                      </div>
                    ))}
                  </div>
                ) : church.connections ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {church.connections.facebook && <InfoRow label="Facebook" value={church.connections.facebook} />}
                    {church.connections.x && <InfoRow label="X (Twitter)" value={church.connections.x} />}
                    {church.connections.instagram && <InfoRow label="Instagram" value={church.connections.instagram} />}
                    {church.connections.youtube && <InfoRow label="YouTube" value={church.connections.youtube} />}
                    {church.connections.spotify && <InfoRow label="Spotify" value={church.connections.spotify} />}
                    {church.connections.applePodcasts && <InfoRow label="Apple Podcasts" value={church.connections.applePodcasts} />}
                  </div>
                ) : (
                  <p className="text-gray-500 italic">No online presence information</p>
                )}
              </div>

              {/* Doctrinal Positions */}
              <div>
                <h4 className="text-lg font-bold text-gray-900 mb-3">Doctrinal Distinctives</h4>
                <dl className="grid grid-cols-1 gap-4">
                  <InfoRow label="Plurality of Elders" value={church.pluralityOfElders} />
                  <InfoRow label="Church Discipline" value={church.churchDiscipline} />
                  <InfoRow label="Statement on Social Justice & Gospel" value={church.ssjgSigned} />
                  <div>
                    <dt className="text-sm font-medium text-gray-500">1689 London Baptist Confession</dt>
                    <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{church.confessionAffirmation}</dd>
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
    church.leaders.map(leader => ({
      ...leader,
      churchName: church.churchName,
      churchId: church.id
    }))
  );

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

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center"><button onClick={onBack} className="mr-4 text-brand-600 hover:text-brand-800"><ArrowLeft /></button><h1 className="text-3xl font-serif font-bold text-brand-900">Admin Dashboard</h1></div>
          <div className="flex items-center space-x-4"><div className="hidden sm:block text-right"><div className="text-sm font-bold text-gray-900">{user.email}</div><div className="text-xs text-gray-500">Administrator</div></div><Button variant="outline" onClick={logout} className="text-xs px-3 py-2"><LogOut className="w-4 h-4 mr-2" /> Sign Out</Button></div>
        </div>

        {/* Navigation Menu */}
        <div className="mb-8 border-b border-gray-200">
          <nav className="flex space-x-8">
            <button
              onClick={() => setCurrentView('pending')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                currentView === 'pending'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Pending
              <span className="ml-2 bg-yellow-100 text-yellow-800 py-1 px-2 rounded-full text-xs">
                {pendingApps.length}
              </span>
            </button>
            <button
              onClick={() => setCurrentView('approved')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                currentView === 'approved'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Approved
              <span className="ml-2 bg-green-100 text-green-800 py-1 px-2 rounded-full text-xs">
                {approvedApps.length}
              </span>
            </button>
            <button
              onClick={() => setCurrentView('leaders')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                currentView === 'leaders'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Leaders
              <span className="ml-2 bg-gray-100 text-gray-900 py-1 px-2 rounded-full text-xs">
                {allLeaders.length}
              </span>
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
              <span className="ml-2 bg-blue-100 text-blue-800 py-1 px-2 rounded-full text-xs">
                New
              </span>
            </button>
            <button
              onClick={() => setCurrentView('rejected')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                currentView === 'rejected'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Rejected
              <span className="ml-2 bg-red-100 text-red-800 py-1 px-2 rounded-full text-xs">
                {rejectedApps.length}
              </span>
            </button>
            <button
              onClick={() => setCurrentView('settings')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                currentView === 'settings'
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

        {/* Pending Applications View */}
        {currentView === 'pending' && (
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

        {/* Approved Churches View */}
        {currentView === 'approved' && (
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
                    }

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
                  variant="danger"
                  onClick={async () => {
                    const confirmation = confirm(
                      `⚠️ WARNING: This will permanently delete ALL ${approvedApps.length} approved churches!\n\nThis action CANNOT be undone.\n\nType the number ${approvedApps.length} in the next prompt to confirm.`
                    );
                    
                    if (!confirmation) return;
                    
                    const userInput = prompt(`To confirm deletion of ALL ${approvedApps.length} churches, type the number: ${approvedApps.length}`);
                    
                    if (userInput !== String(approvedApps.length)) {
                      alert('Deletion cancelled - confirmation number did not match.');
                      return;
                    }
                    
                    try {
                      setIsImporting(true); // Reuse loading state
                      let deleted = 0;
                      let failed = 0;
                      
                      for (const church of approvedApps) {
                        try {
                          await deleteChurchApplication(church.id);
                          deleted++;
                          console.log(`Deleted: ${church.churchName}`);
                        } catch (error) {
                          console.error(`Failed to delete ${church.churchName}:`, error);
                          failed++;
                        }
                      }
                      
                      alert(`Deletion complete!\n\nDeleted: ${deleted} churches\nFailed: ${failed}`);
                    } catch (error) {
                      console.error('Error during bulk delete:', error);
                      alert('An error occurred during deletion. Some churches may not have been deleted.');
                    } finally {
                      setIsImporting(false);
                    }
                  }}
                  disabled={approvedApps.length === 0 || isImporting}
                  className="px-3 py-1.5 h-8 text-xs flex items-center gap-1.5"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Delete All
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
                              {`${app.churchAddress.city}, ${app.churchAddress.country}`}
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
        {currentView === 'rejected' && (
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
                            {`${app.churchAddress.city}, ${app.churchAddress.country}`}
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

        {/* Settings View */}
        {currentView === 'settings' && (
          <section className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">System Settings</h2>
              <p className="text-gray-600">Configure automated emails and system behaviors.</p>
            </div>

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
                  { type: 'dues_delinquent' as const, title: 'Delinquency Notice', desc: 'Sent weekly when dues are overdue.' }
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
                        <p className="text-xs text-gray-500 mt-1">Available variables: {'{{applicantName}}'}, {'{{churchName}}'}</p>
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
        {currentView === 'leaders' && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Church Leaders</h2>
              <p className="text-gray-600">Complete directory of all leaders from approved churches</p>
            </div>

            {allLeaders.length === 0 ? (
              <div className="bg-white p-12 rounded-lg shadow-sm text-center border-2 border-dashed border-gray-200">
                <UserIcon className="w-12 h-12 text-gray-400 mx-auto mb-3 opacity-50" />
                <div className="text-gray-500 italic">No leaders found. Approve churches to see their leaders here.</div>
              </div>
            ) : (
              <>
                {/* Search and Sort Controls for Leaders */}
                <div className="mb-4 bg-white p-4 rounded-lg shadow flex gap-4 items-center flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <input
                      type="text"
                      placeholder="Search leaders by name, email, role, or church..."
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
                      Showing {filteredAndSortedLeaders.length} of {allLeaders.length} leaders
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
                                {leader.role}
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
      </div>

      {/* Church Detail Modal */}
      {viewingChurch && (
        <ChurchDetailModal 
          church={viewingChurch}
          onClose={() => setViewingChurch(null)}
          onCreatePortalAccount={handleCreatePortalAccount}
          isProcessingPortalAccount={isProcessingPortalAccount}
        />
      )}
    </div>
  );
};
