import React, { useState, useEffect } from 'react';
import { ChurchApplication, ChurchLeader, ChurchGathering, ApplicationStatus } from '../types';
import { Button } from './Button';
import { ArrowLeft, LogOut, Plus, Trash2, CheckCircle, Clock, XCircle, Save, Upload, CreditCard, AlertTriangle } from 'lucide-react';
import { logout, getChurchByUserId, updateChurchProfile, uploadChurchLogo } from '../services/firebase';

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
  const [activeTab, setActiveTab] = useState<'info' | 'leadership' | 'schedule' | 'connections' | 'dues'>('info');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Editable state
  const [editedChurch, setEditedChurch] = useState<ChurchApplication | null>(null);

  useEffect(() => {
    const unsubscribe = getChurchByUserId(userId, (churchData) => {
      setChurch(churchData);
      setEditedChurch(churchData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

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

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-gray-200 overflow-x-auto">
            <nav className="flex -mb-px">
              {[
                { id: 'info', label: 'Church Info' },
                { id: 'dues', label: 'Network Dues' },
                { id: 'leadership', label: 'Leadership' },
                { id: 'schedule', label: 'Schedule' },
                { id: 'connections', label: 'Connections' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-black text-black'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'info' && (
              <div className="space-y-6">
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
                        <div className={`text-lg font-bold ${
                          new Date(church.nextDueDate || '') < new Date() ? 'text-red-600' : 'text-gray-900'
                        }`}>
                          {church.nextDueDate ? new Date(church.nextDueDate).toLocaleDateString() : 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-8 pt-6 border-t">
                    <div className="flex flex-col sm:flex-row gap-4 justify-end">
                      {/* Show Pay button if Delinquent or (One-Time and Due Soon) */}
                      {(church.status === 'DELINQUENT' as ApplicationStatus || 
                        (church.paymentFrequency === 'one_time' && church.nextDueDate && new Date(church.nextDueDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))) && (
                        <Button className="bg-red-600 hover:bg-red-700">
                          Pay Dues Now
                        </Button>
                      )}
                      
                      <Button variant="outline">
                        Update Payment Method
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-right">
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

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                      <select
                        value={leader.role}
                        onChange={(e) => handleLeaderChange(leader.id, 'role', e.target.value)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                      >
                        <option value="Elder">Elder</option>
                        <option value="Pastor">Pastor</option>
                        <option value="Deacon">Deacon</option>
                        <option value="Other">Other</option>
                      </select>
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
    </div>
  );
};
