import React, { useState, useEffect } from 'react';
import { ChurchApplication, ChurchLeader, ChurchGathering, ApplicationStatus, ChurchStatistics } from '../types';
import { Button } from './Button';
import { ArrowLeft, LogOut, Plus, Trash2, CheckCircle, Clock, XCircle, Save, Upload, CreditCard, AlertTriangle, BarChart3, Eye, ExternalLink, Mail, Briefcase, Gift } from 'lucide-react';
import { logout, getChurchByUserId, updateChurchProfile, uploadChurchLogo, createStripeBillingPortalSession, getChurchAnalytics, ensureUserProfile, syncSubscriptionStatus, createStripeCheckoutSession } from '../services/firebase';
import { JobManagement } from './JobManagement';
import { NetworkBenefits } from './NetworkBenefits';
import { AccountSettings } from './AccountSettings';

interface ChurchDashboardProps {
  userId: string;
  onBack: () => void;
  onLogout: () => void;
}

export const ChurchDashboard: React.FC<ChurchDashboardProps> = ({ userId, onBack, onLogout }) => {
  const [church, setChurch] = useState<ChurchApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'leadership' | 'schedule' | 'connections' | 'dues' | 'statistics' | 'jobs' | 'benefits' | 'account'>('benefits');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [statistics, setStatistics] = useState<ChurchStatistics | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState<number>(500);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentFrequency, setPaymentFrequency] = useState<'yearly' | 'one_time'>('yearly');

  // Editable state
  const [editedChurch, setEditedChurch] = useState<ChurchApplication | null>(null);

  // Check if church is approved
  const isApproved = church?.status === ApplicationStatus.APPROVED;

  useEffect(() => {
    const unsubscribe = getChurchByUserId(userId, (churchData) => {
      setChurch(churchData);
      setEditedChurch(churchData);
      setLoading(false);

      // Ensure user profile exists (self-repair)
      if (churchData && churchData.id) {
        ensureUserProfile(userId, churchData.applicantEmail, churchData.id);
      }
    });

    return () => unsubscribe();
  }, [userId]);

  // Redirect to 'info' tab if church is not approved and trying to access restricted tabs
  useEffect(() => {
    if (church && church.status !== ApplicationStatus.APPROVED) {
      const restrictedTabs = ['benefits', 'jobs', 'statistics'];
      if (restrictedTabs.includes(activeTab)) {
        setActiveTab('info');
      }
    }
  }, [church, activeTab]);

  // Sync subscription status with Stripe when church data loads, if applicable
  useEffect(() => {
    if (church && church.paymentFrequency === 'yearly' && church.stripeSubscriptionId) {
      console.log(`Attempting to sync Stripe subscription status for church ${church.id}...`);
      syncSubscriptionStatus(church.id)
        .then((result: any) => {
          console.log('Stripe sync result:', result.message);
          // If the sync resulted in a change (e.g., paymentFrequency changed),
          // the onSnapshot listener in getChurchByUserId will automatically
          // update the church state, so no manual state update is needed here.
        })
        .catch(error => {
          console.error('Error syncing Stripe subscription status:', error);
        });
    }
  }, [church?.id, church?.paymentFrequency, church?.stripeSubscriptionId]); // Re-run if these key fields change

  // Fetch analytics when church is loaded
  useEffect(() => {
    if (!church) return;

    const fetchAnalytics = async () => {
      setLoadingStats(true);
      try {
        const stats = await getChurchAnalytics(church.id);
        setStatistics(stats as ChurchStatistics);
      } catch (error) {
        console.error("Error fetching church analytics:", error);
        setStatistics(null);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchAnalytics();
  }, [church]);

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !editedChurch || !church) return;

    setUploadingLogo(true);
    try {
      const file = e.target.files[0];
      const url = await uploadChurchLogo(file, church.id);
      setEditedChurch({ ...editedChurch, churchLogoUrl: url });
    } catch (error) {
      console.error('Error uploading logo:', error);
      alert('Failed to upload logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!editedChurch || !church) return;

    setSaving(true);
    try {
      const { id, userId: uid, submittedAt, status, coordinates, applicantPassword, ...updateData } = editedChurch;
      await updateChurchProfile(church.id, updateData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving church profile:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddLeader = () => {
    if (!editedChurch) return;
    const newLeader: ChurchLeader = {
      id: `leader_${Date.now()}`,
      firstName: '',
      lastName: '',
      role: 'Elder',
      email: '',
      phone: ''
    };
    setEditedChurch({
      ...editedChurch,
      leaders: [...(editedChurch.leaders || []), newLeader]
    });
  };

  const handleRemoveLeader = (id: string) => {
    if (!editedChurch) return;
    setEditedChurch({
      ...editedChurch,
      leaders: editedChurch.leaders.filter(l => l.id !== id)
    });
  };

  const handleLeaderChange = (id: string, field: keyof ChurchLeader, value: string) => {
    if (!editedChurch) return;
    setEditedChurch({
      ...editedChurch,
      leaders: editedChurch.leaders.map(l =>
        l.id === id ? { ...l, [field]: value } : l
      )
    });
  };

  const handleAddGathering = () => {
    if (!editedChurch) return;
    const newGathering: ChurchGathering = {
      id: `gathering_${Date.now()}`,
      name: '',
      day: 'Sunday',
      startTime: '10:00 AM',
      endTime: '11:00 AM'
    };
    setEditedChurch({
      ...editedChurch,
      gatherings: [...(editedChurch.gatherings || []), newGathering]
    });
  };

  const handleRemoveGathering = (id: string) => {
    if (!editedChurch) return;
    setEditedChurch({
      ...editedChurch,
      gatherings: editedChurch.gatherings.filter(g => g.id !== id)
    });
  };

  const handleGatheringChange = (id: string, field: keyof ChurchGathering, value: string) => {
    if (!editedChurch) return;
    setEditedChurch({
      ...editedChurch,
      gatherings: editedChurch.gatherings.map(g =>
        g.id === id ? { ...g, [field]: value } : g
      )
    });
  };

  const handleUpdatePaymentMethod = async () => {
    if (!church || !church.stripeCustomerId) {
      alert('No payment method found. Please contact support.');
      return;
    }

    try {
      const { url } = await createStripeBillingPortalSession(
        church.stripeCustomerId,
        window.location.href
      );
      window.location.href = url;
    } catch (error) {
      console.error('Error opening billing portal:', error);
      alert('Failed to open payment portal. Please try again or contact support.');
    }
  };

  const handlePayDues = async () => {
    if (!church) return;

    // Validate amount
    if (paymentAmount < 500) {
      alert('Minimum payment amount is $500');
      return;
    }

    setProcessingPayment(true);
    try {
      const { url } = await createStripeCheckoutSession(church.id, paymentAmount);
      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Failed to initiate payment. Please try again or contact support.');
      setProcessingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin text-gray-900">Loading...</div>
      </div>
    );
  }

  if (!church || !editedChurch) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-xl max-w-md w-full text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-4">No Church Profile Found</h2>
          <p className="text-gray-600 mb-6">
            We couldn't find a church profile associated with your account.
          </p>
          <Button onClick={handleLogout}>Sign Out</Button>
        </div>
      </div>
    );
  }

  const getStatusBadge = () => {
    if (church.status === 'DELINQUENT' as ApplicationStatus) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800">
          <AlertTriangle className="w-4 h-4 mr-1" />
          Delinquent
        </span>
      );
    }

    switch (church.status) {
      case ApplicationStatus.APPROVED:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800">
            <CheckCircle className="w-4 h-4 mr-1" />
            Approved
          </span>
        );
      case 'PROVISIONAL_APPROVED' as ApplicationStatus:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-orange-100 text-orange-800">
            <Clock className="w-4 h-4 mr-1" />
            Payment Required
          </span>
        );
      case ApplicationStatus.PENDING:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-800">
            <Clock className="w-4 h-4 mr-1" />
            Pending Review
          </span>
        );
      case ApplicationStatus.REJECTED:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800">
            <XCircle className="w-4 h-4 mr-1" />
            Not Approved
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button onClick={onBack} className="mr-4 text-gray-600 hover:text-gray-900">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-serif font-bold text-gray-900">{church.churchName}</h1>
                <p className="text-sm text-gray-500">{church.applicantEmail}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {getStatusBadge()}
              <Button variant="outline" onClick={handleLogout} className="text-sm">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Provisional Approval Payment Setup Overlay */}
      {church.status === 'PROVISIONAL_APPROVED' as ApplicationStatus && (
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="bg-white rounded-lg shadow-xl overflow-hidden border-2 border-orange-200">
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-6 text-white">
              <h2 className="text-3xl font-serif font-bold">🎉 Congratulations!</h2>
              <p className="mt-2 text-orange-100">Your application has been provisionally approved</p>
            </div>

            <div className="p-8">
              <div className="mb-8">
                <h3 className="text-2xl font-serif font-bold text-gray-900 mb-4">Complete Your Membership</h3>
                <p className="text-gray-700 mb-4">
                  Welcome to the G3 Church Network! To activate your full membership and gain access to all network benefits, please complete your annual dues payment below.
                </p>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                  <h4 className="font-semibold text-blue-900 mb-3">What You'll Get:</h4>
                  <ul className="space-y-2 text-sm text-blue-800">
                    <li className="flex items-start">
                      <CheckCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-blue-600" />
                      <span>Listed on our interactive network map</span>
                    </li>
                    <li className="flex items-start">
                      <CheckCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-blue-600" />
                      <span>Ability to post job openings on our Job Board</span>
                    </li>
                    <li className="flex items-start">
                      <CheckCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-blue-600" />
                      <span>Access to member resources and exclusive discounts</span>
                    </li>
                    <li className="flex items-start">
                      <CheckCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-blue-600" />
                      <span>Connection with like-minded Reformed Baptist churches worldwide</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-white border border-gray-300 rounded-lg p-6">
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                    <CreditCard className="w-5 h-5 mr-2" />
                    Payment Information
                  </h4>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Annual Contribution Amount (USD) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                        <input
                          type="number"
                          min="500"
                          step="50"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(Math.max(500, parseInt(e.target.value) || 500))}
                          className="w-full pl-8 pr-4 py-3 rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 border text-lg font-semibold"
                          placeholder="500"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Minimum annual contribution: $500</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Payment Frequency *
                      </label>
                      <div className="space-y-3">
                        <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors border-gray-300">
                          <input
                            type="radio"
                            name="paymentFrequency"
                            value="yearly"
                            checked={paymentFrequency === 'yearly'}
                            onChange={() => setPaymentFrequency('yearly')}
                            className="mt-1 text-orange-600 focus:ring-orange-500"
                          />
                          <div className="ml-3">
                            <div className="font-semibold text-gray-900">Recurring (Auto-Renew)</div>
                            <div className="text-sm text-gray-600">Automatically renews each year</div>
                          </div>
                        </label>
                        <label className="flex items-start p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors border-gray-300">
                          <input
                            type="radio"
                            name="paymentFrequency"
                            value="one_time"
                            checked={paymentFrequency === 'one_time'}
                            onChange={() => setPaymentFrequency('one_time')}
                            className="mt-1 text-orange-600 focus:ring-orange-500"
                          />
                          <div className="ml-3">
                            <div className="font-semibold text-gray-900">One-Time Payment</div>
                            <div className="text-sm text-gray-600">Manual renewal required each year</div>
                          </div>
                        </label>
                      </div>
                    </div>

                    <Button
                      onClick={handlePayDues}
                      isLoading={processingPayment}
                      className="w-full bg-orange-600 hover:bg-orange-700 text-white py-4 text-lg font-semibold"
                    >
                      <CreditCard className="w-5 h-5 mr-2" />
                      Complete Payment - ${paymentAmount}/year
                    </Button>

                    <p className="text-xs text-gray-500 text-center">
                      Secure payment powered by Stripe. You'll be redirected to complete your payment.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t text-center">
                <p className="text-sm text-gray-600">
                  Questions about payment? Contact us at{' '}
                  <a href="mailto:admin@g3min.org" className="text-orange-600 hover:text-orange-700 font-medium">
                    admin@g3min.org
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content - Only show if not provisional */}
      {church.status !== 'PROVISIONAL_APPROVED' as ApplicationStatus && (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            {/* Tabs */}
            <div className="border-b border-gray-200 overflow-x-auto">
              <nav className="flex -mb-px">
                {[
                  { id: 'benefits', label: 'Network Benefits' },
                  { id: 'info', label: 'Church Info' },
                  { id: 'jobs', label: 'Job Listings' },
                  { id: 'statistics', label: 'Statistics' },
                  { id: 'dues', label: 'Network Dues' },
                  { id: 'leadership', label: 'Elders' },
                  { id: 'schedule', label: 'Schedule' },
                  { id: 'connections', label: 'Connections' },
                  { id: 'account', label: 'Account' }
                ].filter(tab => {
                  // Hide benefits, jobs, and statistics tabs if church is not approved
                  if (!isApproved && ['benefits', 'jobs', 'statistics'].includes(tab.id)) {
                    return false;
                  }
                  return true;
                }).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as 'info' | 'leadership' | 'schedule' | 'connections' | 'dues' | 'statistics' | 'jobs' | 'benefits' | 'account')}
                    className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
                      ? 'border-black text-black'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                  >
                    {tab.id === 'benefits' ? (
                      <span className="flex items-center gap-2">
                        <Gift className="w-4 h-4" /> Network Benefits
                      </span>
                    ) : tab.label === 'Job Listings' ? (
                      <span className="flex items-center gap-2">
                        <Briefcase className="w-4 h-4" /> Job Listings
                      </span>
                    ) : (
                      tab.label
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'info' && (
                <div className="space-y-6">
                  {/* Applicant Information Section */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Primary Contact Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                        <input
                          type="text"
                          value={editedChurch.applicantFirstName}
                          onChange={(e) => setEditedChurch({ ...editedChurch, applicantFirstName: e.target.value })}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                        <input
                          type="text"
                          value={editedChurch.applicantLastName}
                          onChange={(e) => setEditedChurch({ ...editedChurch, applicantLastName: e.target.value })}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                        <input
                          type="email"
                          value={editedChurch.applicantEmail}
                          onChange={(e) => setEditedChurch({ ...editedChurch, applicantEmail: e.target.value })}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                        />
                        <p className="text-xs text-gray-500 mt-1">This is your login email and primary contact.</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Church Logo</label>
                    <div className="flex items-center gap-4">
                      {editedChurch.churchLogoUrl && (
                        <img
                          src={editedChurch.churchLogoUrl}
                          alt="Church Logo"
                          className="w-16 h-16 rounded-full object-cover border"
                        />
                      )}
                      <label className={`cursor-pointer bg-white border border-gray-300 rounded-md px-4 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors ${uploadingLogo ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <Upload className="w-4 h-4" />
                        {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          disabled={uploadingLogo}
                        />
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Recommended: Square image, PNG or JPG.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Church Name</label>
                    <input
                      type="text"
                      value={editedChurch.churchName}
                      onChange={(e) => setEditedChurch({ ...editedChurch, churchName: e.target.value })}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <textarea
                      rows={4}
                      value={editedChurch.churchDescription}
                      onChange={(e) => setEditedChurch({ ...editedChurch, churchDescription: e.target.value })}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                      <input
                        type="tel"
                        value={editedChurch.churchPhone}
                        onChange={(e) => setEditedChurch({ ...editedChurch, churchPhone: e.target.value })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                      <input
                        type="email"
                        value={editedChurch.churchEmail}
                        onChange={(e) => setEditedChurch({ ...editedChurch, churchEmail: e.target.value })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Street Address</label>
                    <input
                      type="text"
                      value={editedChurch.churchAddress.street}
                      onChange={(e) => setEditedChurch({
                        ...editedChurch,
                        churchAddress: { ...editedChurch.churchAddress, street: e.target.value }
                      })}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                      <input
                        type="text"
                        value={editedChurch.churchAddress.city}
                        onChange={(e) => setEditedChurch({
                          ...editedChurch,
                          churchAddress: { ...editedChurch.churchAddress, city: e.target.value }
                        })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                      <input
                        type="text"
                        value={editedChurch.churchAddress.state}
                        onChange={(e) => setEditedChurch({
                          ...editedChurch,
                          churchAddress: { ...editedChurch.churchAddress, state: e.target.value }
                        })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                      <input
                        type="text"
                        value={editedChurch.churchAddress.country}
                        onChange={(e) => setEditedChurch({
                          ...editedChurch,
                          churchAddress: { ...editedChurch.churchAddress, country: e.target.value }
                        })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'account' && (
                <AccountSettings />
              )}

              {activeTab === 'benefits' && isApproved && (
                <NetworkBenefits onChangeTab={setActiveTab} />
              )}

              {activeTab === 'jobs' && isApproved && church && (
                <JobManagement
                  churchId={church.id}
                  churchName={church.churchName}
                  churchLogoUrl={church.churchLogoUrl}
                />
              )}

              {activeTab === 'dues' && (
                <div className="space-y-6">
                  <div className="bg-white p-6 border rounded-lg shadow-sm">
                    <h3 className="text-lg font-serif font-bold text-gray-900 mb-4 flex items-center">
                      <CreditCard className="w-5 h-5 mr-2 text-gray-700" />
                      Membership Dues Status
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <span className="text-sm font-medium text-gray-500 block">Payment Plan</span>
                          <div className="text-lg font-medium">
                            ${church.paymentAmount || 500} / {church.paymentFrequency === 'one_time' ? 'Year' : 'Year (Auto-Renew)'}
                          </div>
                        </div>

                        <div>
                          <span className="text-sm font-medium text-gray-500 block">Current Status</span>
                          <div className="mt-1">
                            {church.status === 'DELINQUENT' as ApplicationStatus ? (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-red-100 text-red-800">
                                Delinquent - Payment Required
                              </span>
                            ) : church.status === ApplicationStatus.APPROVED ? (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-800">
                                Active / In Good Standing
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-gray-100 text-gray-800">
                                {church.status}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <span className="text-sm font-medium text-gray-500 block">Last Payment Date</span>
                          <div className="text-lg">
                            {church.lastPaymentDate ? new Date(church.lastPaymentDate).toLocaleDateString() : 'N/A'}
                          </div>
                        </div>

                        <div>
                          <span className="text-sm font-medium text-gray-500 block">Next Due Date</span>
                          <div className={`text-lg font-bold ${new Date(church.nextDueDate || '') < new Date() ? 'text-red-600' : 'text-gray-900'
                            }`}>
                            {church.nextDueDate ? new Date(church.nextDueDate).toLocaleDateString() : 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-8 pt-6 border-t">
                      {/* Show "Pay Dues" form if no payment method set up yet */}
                      {(!church.stripeCustomerId || !church.stripeSubscriptionId) ? (
                        <div className="space-y-4">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm text-blue-900 font-medium mb-2">
                              Set Up Your Annual Dues Payment
                            </p>
                            <p className="text-xs text-blue-700">
                              Minimum $500/year. You can contribute more if you'd like to support the network.
                            </p>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-4 items-end">
                            <div className="flex-1">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Annual Amount (USD)
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                <input
                                  type="number"
                                  min="500"
                                  step="50"
                                  value={paymentAmount}
                                  onChange={(e) => setPaymentAmount(Math.max(500, parseInt(e.target.value) || 500))}
                                  className="w-full pl-8 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                                />
                              </div>
                              <p className="text-xs text-gray-500 mt-1">Minimum: $500</p>
                            </div>
                            <Button
                              onClick={handlePayDues}
                              isLoading={processingPayment}
                              className="bg-green-600 hover:bg-green-700 whitespace-nowrap"
                            >
                              <CreditCard className="w-4 h-4 mr-2" />
                              Pay Dues (${paymentAmount}/year)
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* Show existing buttons for churches with payment methods */
                        <div className="flex flex-col sm:flex-row gap-4 justify-end">
                          {/* Show Pay button if Delinquent or (One-Time and Due Soon) */}
                          {(church.status === 'DELINQUENT' as ApplicationStatus ||
                            (church.paymentFrequency === 'one_time' && church.nextDueDate && new Date(church.nextDueDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))) && (
                              <Button
                                onClick={handlePayDues}
                                isLoading={processingPayment}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Pay Dues Now
                              </Button>
                            )}

                          <Button variant="outline" onClick={handleUpdatePaymentMethod}>
                            Update Payment Method
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-4 text-right">
                        Contact admin@g3min.org for billing inquiries.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'leadership' && (
                <div className="space-y-6">
                  {editedChurch.leaders?.map((leader, index) => (
                    <div key={leader.id} className="border border-gray-200 rounded-lg p-4 relative">
                      <button
                        onClick={() => handleRemoveLeader(leader.id)}
                        className="absolute top-4 right-4 text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                          <input
                            type="text"
                            value={leader.firstName}
                            onChange={(e) => handleLeaderChange(leader.id, 'firstName', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                          <input
                            type="text"
                            value={leader.lastName}
                            onChange={(e) => handleLeaderChange(leader.id, 'lastName', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          />
                        </div>
                      </div>


                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                          <input
                            type="email"
                            value={leader.email}
                            onChange={(e) => handleLeaderChange(leader.id, 'email', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                          <input
                            type="tel"
                            value={leader.phone}
                            onChange={(e) => handleLeaderChange(leader.id, 'phone', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button onClick={handleAddLeader} variant="outline" className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Leader
                  </Button>
                </div>
              )}

              {activeTab === 'schedule' && (
                <div className="space-y-6">
                  {editedChurch.gatherings?.map((gathering) => (
                    <div key={gathering.id} className="border border-gray-200 rounded-lg p-4 relative">
                      <button
                        onClick={() => handleRemoveGathering(gathering.id)}
                        className="absolute top-4 right-4 text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gathering Name</label>
                        <input
                          type="text"
                          value={gathering.name}
                          onChange={(e) => handleGatheringChange(gathering.id, 'name', e.target.value)}
                          placeholder="Sunday Morning Worship Service"
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                          <select
                            value={gathering.day}
                            onChange={(e) => handleGatheringChange(gathering.id, 'day', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
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
                            value={gathering.startTime}
                            onChange={(e) => handleGatheringChange(gathering.id, 'startTime', e.target.value)}
                            placeholder="10:00 AM"
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                          <input
                            type="text"
                            value={gathering.endTime}
                            onChange={(e) => handleGatheringChange(gathering.id, 'endTime', e.target.value)}
                            placeholder="11:30 AM"
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button onClick={handleAddGathering} variant="outline" className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Gathering
                  </Button>
                </div>
              )}

              {activeTab === 'statistics' && isApproved && (
                <div className="space-y-6">
                  <div className="bg-white p-6 border rounded-lg shadow-sm">
                    <h3 className="text-lg font-serif font-bold text-gray-900 mb-4 flex items-center">
                      <BarChart3 className="w-5 h-5 mr-2 text-gray-700" />
                      Profile Engagement Statistics
                    </h3>

                    <p className="text-sm text-gray-600 mb-6">
                      Track how visitors interact with your church profile on the G3 Network map.
                    </p>

                    {loadingStats ? (
                      <div className="text-center py-12 bg-gray-50 rounded-lg">
                        <div className="animate-spin text-gray-900">Loading statistics...</div>
                      </div>
                    ) : statistics ? (
                      <>
                        {/* All-Time Stats */}
                        <div className="mb-8">
                          <h4 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">All-Time Totals</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="bg-blue-50 p-6 rounded-lg border border-blue-100">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-blue-900">Profile Views</span>
                                <Eye className="w-5 h-5 text-blue-600" />
                              </div>
                              <div className="text-3xl font-bold text-blue-900">{statistics.total?.views || 0}</div>
                              <p className="text-xs text-blue-700 mt-1">Times your profile was opened</p>
                            </div>

                            <div className="bg-green-50 p-6 rounded-lg border border-green-100">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-green-900">Website Visits</span>
                                <ExternalLink className="w-5 h-5 text-green-600" />
                              </div>
                              <div className="text-3xl font-bold text-green-900">{statistics.total?.visits || 0}</div>
                              <p className="text-xs text-green-700 mt-1">Times visitors clicked "Visit Website"</p>
                            </div>

                            <div className="bg-purple-50 p-6 rounded-lg border border-purple-100">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-purple-900">Contact Requests</span>
                                <Mail className="w-5 h-5 text-purple-600" />
                              </div>
                              <div className="text-3xl font-bold text-purple-900">{statistics.total?.contacts || 0}</div>
                              <p className="text-xs text-purple-700 mt-1">Messages sent via contact form</p>
                            </div>

                            <div className="bg-orange-50 p-6 rounded-lg border border-orange-100">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-orange-900">Social Clicks</span>
                                <ExternalLink className="w-5 h-5 text-orange-600" />
                              </div>
                              <div className="text-3xl font-bold text-orange-900">{statistics.total?.socialClicks || 0}</div>
                              <p className="text-xs text-orange-700 mt-1">Social media link clicks</p>
                            </div>
                          </div>
                        </div>

                        {/* Recent Performance */}
                        <div className="mb-8">
                          <h4 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Recent Performance</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Last 30 Days */}
                            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                              <h5 className="text-sm font-bold text-gray-900 mb-4">Last 30 Days</h5>
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600 flex items-center">
                                    <Eye className="w-4 h-4 mr-2 text-blue-500" />
                                    Profile Views
                                  </span>
                                  <span className="text-lg font-bold text-gray-900">{statistics.last30Days?.views || 0}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600 flex items-center">
                                    <ExternalLink className="w-4 h-4 mr-2 text-green-500" />
                                    Website Visits
                                  </span>
                                  <span className="text-lg font-bold text-gray-900">{statistics.last30Days?.visits || 0}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600 flex items-center">
                                    <Mail className="w-4 h-4 mr-2 text-purple-500" />
                                    Contact Requests
                                  </span>
                                  <span className="text-lg font-bold text-gray-900">{statistics.last30Days?.contacts || 0}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600 flex items-center">
                                    <ExternalLink className="w-4 h-4 mr-2 text-orange-500" />
                                    Social Clicks
                                  </span>
                                  <span className="text-lg font-bold text-gray-900">{statistics.last30Days?.socialClicks || 0}</span>
                                </div>
                              </div>
                            </div>

                            {/* Last 7 Days */}
                            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                              <h5 className="text-sm font-bold text-gray-900 mb-4">Last 7 Days</h5>
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600 flex items-center">
                                    <Eye className="w-4 h-4 mr-2 text-blue-500" />
                                    Profile Views
                                  </span>
                                  <span className="text-lg font-bold text-gray-900">{statistics.last7Days?.views || 0}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600 flex items-center">
                                    <ExternalLink className="w-4 h-4 mr-2 text-green-500" />
                                    Website Visits
                                  </span>
                                  <span className="text-lg font-bold text-gray-900">{statistics.last7Days?.visits || 0}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600 flex items-center">
                                    <Mail className="w-4 h-4 mr-2 text-purple-500" />
                                    Contact Requests
                                  </span>
                                  <span className="text-lg font-bold text-gray-900">{statistics.last7Days?.contacts || 0}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600 flex items-center">
                                    <ExternalLink className="w-4 h-4 mr-2 text-orange-500" />
                                    Social Clicks
                                  </span>
                                  <span className="text-lg font-bold text-gray-900">{statistics.last7Days?.socialClicks || 0}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Social Media Breakdown */}
                        {statistics.socialBreakdown && Object.keys(statistics.socialBreakdown).length > 0 && (
                          <div className="mb-8">
                            <h4 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Social Media Engagement</h4>
                            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                {Object.entries(statistics.socialBreakdown).map(([platform, count]) => (
                                  <div key={platform} className="text-center">
                                    <div className="text-2xl font-bold text-gray-900">{count}</div>
                                    <div className="text-xs text-gray-600 capitalize mt-1">{platform}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Last Activity */}
                        {statistics.lastActivity && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-center">
                              <Clock className="w-5 h-5 text-blue-600 mr-3 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-blue-900">Most Recent Activity</p>
                                <p className="text-xs text-blue-700 mt-1">
                                  {new Date(statistics.lastActivity).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-12 bg-gray-50 rounded-lg">
                        <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600">No statistics available yet</p>
                        <p className="text-sm text-gray-500 mt-1">Statistics will appear once visitors interact with your profile</p>
                      </div>
                    )}

                    {statistics && statistics.lastUpdated && (
                      <div className="mt-6 pt-6 border-t">
                        <p className="text-xs text-gray-500 text-right">
                          Last updated: {new Date(statistics.lastUpdated).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'connections' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                    <input
                      type="url"
                      value={editedChurch.connections?.website || ''}
                      onChange={(e) => setEditedChurch({
                        ...editedChurch,
                        connections: { ...editedChurch.connections, website: e.target.value }
                      })}
                      placeholder="https://yourchurch.com"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Facebook</label>
                      <input
                        type="text"
                        value={editedChurch.connections?.facebook || ''}
                        onChange={(e) => setEditedChurch({
                          ...editedChurch,
                          connections: { ...editedChurch.connections, facebook: e.target.value }
                        })}
                        placeholder="Facebook URL"
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">X (Twitter)</label>
                      <input
                        type="text"
                        value={editedChurch.connections?.x || ''}
                        onChange={(e) => setEditedChurch({
                          ...editedChurch,
                          connections: { ...editedChurch.connections, x: e.target.value }
                        })}
                        placeholder="X URL"
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
                      <input
                        type="text"
                        value={editedChurch.connections?.instagram || ''}
                        onChange={(e) => setEditedChurch({
                          ...editedChurch,
                          connections: { ...editedChurch.connections, instagram: e.target.value }
                        })}
                        placeholder="Instagram URL"
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">YouTube</label>
                      <input
                        type="text"
                        value={editedChurch.connections?.youtube || ''}
                        onChange={(e) => setEditedChurch({
                          ...editedChurch,
                          connections: { ...editedChurch.connections, youtube: e.target.value }
                        })}
                        placeholder="YouTube URL"
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Spotify</label>
                      <input
                        type="text"
                        value={editedChurch.connections?.spotify || ''}
                        onChange={(e) => setEditedChurch({
                          ...editedChurch,
                          connections: { ...editedChurch.connections, spotify: e.target.value }
                        })}
                        placeholder="Spotify URL"
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Apple Podcasts</label>
                      <input
                        type="text"
                        value={editedChurch.connections?.applePodcasts || ''}
                        onChange={(e) => setEditedChurch({
                          ...editedChurch,
                          connections: { ...editedChurch.connections, applePodcasts: e.target.value }
                        })}
                        placeholder="Apple Podcasts URL"
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Save Button */}
            <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t">
              {saveSuccess && (
                <div className="text-green-600 text-sm flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Changes saved successfully!
                </div>
              )}
              <div className="flex-1"></div>
              <Button onClick={handleSave} isLoading={saving} className="flex items-center">
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
};

