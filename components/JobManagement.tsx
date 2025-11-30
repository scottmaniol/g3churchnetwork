import React, { useState, useEffect } from 'react';
import { JobListing, JobApplication, ChurchApplication } from '../types';
import { Button } from './Button';
import { Plus, Edit, Trash2, X, Briefcase, MapPin, Calendar, Users, Eye, Mail, Link as LinkIcon, Download, Loader2 } from 'lucide-react';
import { createJobListing, getJobListingsByChurch, updateJobListing, deleteJobListing, subscribeToJobApplicationsByChurch, uploadResume } from '../services/firebase';

interface JobManagementProps {
  churchId: string;
  churchName: string;
  churchLogoUrl?: string;
}

export const JobManagement: React.FC<JobManagementProps> = ({ churchId, churchName, churchLogoUrl }) => {
  const [jobListings, setJobListings] = useState<JobListing[]>([]);
  const [jobApplications, setJobApplications] = useState<JobApplication[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [showJobForm, setShowJobForm] = useState(false);
  const [editingJob, setEditingJob] = useState<JobListing | null>(null);
  const [jobFormLoading, setJobFormLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'listings' | 'applications'>('listings');
  const [viewingApplicationsForJobId, setViewingApplicationsForJobId] = useState<string | null>(null);

  // Job form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [jobType, setJobType] = useState<JobListing['jobType']>('Full Time');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [salary, setSalary] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [jobFormError, setJobFormError] = useState<string | null>(null);

  const categories = ["Lead Pastor", "Associate Pastor", "Worship", "Admin", "Missions", "Other"];
  const jobTypesOptions = ['Full Time', 'Part Time', 'Internship', 'Temporary', 'Volunteer'];

  useEffect(() => {
    const fetchJobs = async () => {
      setLoadingJobs(true);
      const jobs = await getJobListingsByChurch(churchId);
      setJobListings(jobs);
      setLoadingJobs(false);
    };
    fetchJobs();
  }, [churchId]);

  useEffect(() => {
    const unsubscribeApplications = subscribeToJobApplicationsByChurch(churchId, (applications) => {
      setJobApplications(applications);
      setLoadingApplications(false);
    });
    return () => unsubscribeApplications();
  }, [churchId]);

  const handleCreateOrUpdateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setJobFormLoading(true);
    setJobFormError(null);

    if (!title || !category || !jobType || !location || !description) {
      setJobFormError('Please fill in all required fields (Title, Category, Job Type, Location, Description).');
      setJobFormLoading(false);
      return;
    }

    const now = new Date().toISOString();
    
    // Base job data (excluding ID, createdAt, updatedAt, status for Omit type in createJobListing)
    const baseJobData: Omit<JobListing, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'datePosted'> = {
      churchId,
      churchName,
      title,
      category,
      jobType,
      location,
      description,
      requirements: requirements || undefined,
      salary: salary || undefined,
      experienceLevel: experienceLevel || undefined,
      ...(expirationDate ? { expirationDate: new Date(expirationDate).toISOString() } : {}),
      ...(churchLogoUrl ? { churchLogoUrl } : {}), // Only include if defined
    };

    try {
      if (editingJob) {
        // For editing, include the original datePosted and update `updatedAt`
        const updatedJob: Partial<JobListing> = {
          ...baseJobData,
          datePosted: editingJob.datePosted, // Keep original datePosted
          updatedAt: now,
        };
        await updateJobListing(editingJob.id, updatedJob);
        alert('Job listing updated successfully!');
      } else {
        // For new job, set datePosted and createdAt/updatedAt
        const newJob: Omit<JobListing, 'id'> = {
          ...baseJobData,
          status: 'active', // New jobs are active by default
          datePosted: now,
          createdAt: now,
          updatedAt: now,
        };
        await createJobListing(newJob); // Use the correct signature for createJobListing
        alert('Job listing created successfully!');
      }
      
      // Refresh listings manually since we removed the subscription
      const jobs = await getJobListingsByChurch(churchId);
      setJobListings(jobs);

      resetJobForm();
      setShowJobForm(false);
    } catch (err: any) {
      console.error("Error saving job listing:", err);
      setJobFormError(`Failed to save job listing: ${err.message || 'Unknown error'}`);
    } finally {
      setJobFormLoading(false);
    }
  };

  const handleEditJob = (job: JobListing) => {
    setEditingJob(job);
    setTitle(job.title);
    setCategory(job.category);
    setJobType(job.jobType);
    setLocation(job.location);
    setDescription(job.description);
    setRequirements(job.requirements || '');
    setSalary(job.salary || '');
    setExperienceLevel(job.experienceLevel || '');
    setExpirationDate(job.expirationDate ? new Date(job.expirationDate).toISOString().split('T')[0] : '');
    setShowJobForm(true);
  };

  const handleDeleteJob = async (jobId: string) => {
    if (confirm('Are you sure you want to delete this job listing? This action cannot be undone.')) {
      try {
        await deleteJobListing(jobId);
        alert('Job listing deleted successfully!');
        
        // Refresh listings manually
        const jobs = await getJobListingsByChurch(churchId);
        setJobListings(jobs);
      } catch (err) {
        console.error("Error deleting job listing:", err);
        alert('Failed to delete job listing. Please try again.');
      }
    }
  };

  const resetJobForm = () => {
    setEditingJob(null);
    setTitle('');
    setCategory('');
    setJobType('Full Time');
    setLocation('');
    setDescription('');
    setRequirements('');
    setSalary('');
    setExperienceLevel('');
    setExpirationDate('');
    setJobFormError(null);
  };

  const getApplicationsForJob = (jobId: string) => {
    return jobApplications.filter(app => app.jobId === jobId);
  };

  const getJobById = (jobId: string) => {
    return jobListings.find(job => job.id === jobId);
  };

  return (
    <div className="bg-gray-50 p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Job Management</h2>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => { setActiveTab('listings'); setViewingApplicationsForJobId(null); }}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'listings'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Your Job Listings
            <span className="ml-2 bg-blue-100 text-blue-800 py-0.5 px-1.5 rounded-full text-xs">
              {jobListings.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('applications')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'applications'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Applications Received
            <span className="ml-2 bg-green-100 text-green-800 py-0.5 px-1.5 rounded-full text-xs">
              {jobApplications.length}
            </span>
          </button>
        </nav>
      </div>

      {activeTab === 'listings' && (
        <section>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold text-gray-900">Manage Your Listings</h3>
            <Button onClick={() => { setShowJobForm(true); resetJobForm(); }} className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> Post New Job
            </Button>
          </div>

          {showJobForm && (
            <div className="bg-white p-6 rounded-lg shadow-md mb-8 border border-blue-200">
              <h4 className="text-lg font-bold text-gray-900 mb-4">{editingJob ? 'Edit Job Listing' : 'Create New Job Listing'}</h4>
              <form onSubmit={handleCreateOrUpdateJob} className="space-y-4">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
                  <input
                    type="text"
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                    <select
                      id="category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      required
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 bg-white"
                    >
                      <option value="">Select Category</option>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="jobType" className="block text-sm font-medium text-gray-700 mb-1">Job Type *</label>
                    <select
                      id="jobType"
                      value={jobType}
                      onChange={(e) => setJobType(e.target.value as JobListing['jobType'])}
                      required
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 bg-white"
                    >
                      {jobTypesOptions.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                  <input
                    type="text"
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    required
                    placeholder="e.g., City, State, Country"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  />
                </div>
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    rows={6}
                    placeholder="Provide a detailed description of the role..."
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  ></textarea>
                </div>
                <div>
                  <label htmlFor="requirements" className="block text-sm font-medium text-gray-700 mb-1">Requirements (optional)</label>
                  <textarea
                    id="requirements"
                    value={requirements}
                    onChange={(e) => setRequirements(e.target.value)}
                    rows={4}
                    placeholder="List required skills, qualifications, etc."
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  ></textarea>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="salary" className="block text-sm font-medium text-gray-700 mb-1">Salary (optional)</label>
                    <input
                      type="text"
                      id="salary"
                      value={salary}
                      onChange={(e) => setSalary(e.target.value)}
                      placeholder="e.g., $50,000 - $60,000 / year"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    />
                  </div>
                  <div>
                    <label htmlFor="experienceLevel" className="block text-sm font-medium text-gray-700 mb-1">Experience Level (optional)</label>
                    <input
                      type="text"
                      id="experienceLevel"
                      value={experienceLevel}
                      onChange={(e) => setExperienceLevel(e.target.value)}
                      placeholder="e.g., Entry Level, Mid Level"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="expirationDate" className="block text-sm font-medium text-gray-700 mb-1">Expiration Date (optional)</label>
                  <input
                    type="date"
                    id="expirationDate"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave blank for no expiration. Job will be hidden after this date.</p>
                </div>
                
                {jobFormError && <p className="text-red-600 text-sm mt-4">{jobFormError}</p>}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <Button type="button" variant="outline" onClick={() => setShowJobForm(false)} disabled={jobFormLoading}>
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={jobFormLoading}>
                    {editingJob ? 'Save Changes' : 'Post Job'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {loadingJobs ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
              <p className="text-gray-500 mt-2">Loading job listings...</p>
            </div>
          ) : jobListings.length === 0 ? (
            <div className="bg-white p-12 rounded-lg shadow-md text-center text-gray-500 border-2 border-dashed border-gray-200">
              <Briefcase className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              No job listings posted yet. Click "Post New Job" to get started!
            </div>
          ) : (
            <div className="space-y-6">
              {jobListings.map(job => (
                <div key={job.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                  <div className="p-6 flex items-start gap-4">
                    {job.churchLogoUrl ? (
                      <img src={job.churchLogoUrl} alt={job.churchName} className="w-16 h-16 rounded-full object-cover border flex-shrink-0" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-semibold flex-shrink-0">
                        LOGO
                      </div>
                    )}
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-gray-900 mb-1">{job.title}</h4>
                      <p className="text-blue-600 font-medium mb-2">{job.churchName}</p>
                      <div className="flex items-center text-gray-600 text-sm mb-2 gap-4">
                        <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {job.location}</span>
                        <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {job.jobType}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> Posted: {new Date(job.datePosted).toLocaleDateString()}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-4">
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">{job.category}</span>
                        {job.experienceLevel && <span className="px-3 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">{job.experienceLevel}</span>}
                        {job.salary && <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">{job.salary}</span>}
                      </div>
                      <p className="text-gray-700 line-clamp-3">{job.description}</p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => handleEditJob(job)} className="flex items-center gap-2">
                          <Edit className="w-4 h-4" /> Edit
                        </Button>
                        <Button variant="danger" onClick={() => handleDeleteJob(job.id)} className="flex items-center gap-2">
                          <Trash2 className="w-4 h-4" /> Delete
                        </Button>
                        <Button variant="secondary" onClick={() => setViewingApplicationsForJobId(job.id)} className="flex items-center gap-2">
                          <Users className="w-4 h-4" /> <span>View Applications ({getApplicationsForJob(job.id).length})</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'applications' && (
        <section>
          {viewingApplicationsForJobId ? (
            <JobApplicationsList 
              job={getJobById(viewingApplicationsForJobId)} 
              applications={getApplicationsForJob(viewingApplicationsForJobId)} 
              onBack={() => setViewingApplicationsForJobId(null)}
            />
          ) : (
            <>
              <h3 className="text-xl font-semibold text-gray-900 mb-6">All Applications Received</h3>
              {loadingApplications ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
                  <p className="text-gray-500 mt-2">Loading applications...</p>
                </div>
              ) : jobApplications.length === 0 ? (
                <div className="bg-white p-12 rounded-lg shadow-md text-center text-gray-500 border-2 border-dashed border-gray-200">
                  <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  No applications received yet.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Group applications by job */}
                  {jobListings.map(job => {
                    const appsForJob = getApplicationsForJob(job.id);
                    if (appsForJob.length === 0) return null;
                    return (
                      <div key={job.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                        <div className="p-4 bg-gray-100 border-b flex justify-between items-center">
                          <h4 className="text-lg font-semibold text-gray-900">{job.title}</h4>
                          <Button variant="secondary" onClick={() => setViewingApplicationsForJobId(job.id)} className="flex items-center gap-2">
                            <Users className="w-4 h-4" /> View All ({appsForJob.length})
                          </Button>
                        </div>
                        <div className="divide-y divide-gray-200">
                          {appsForJob.slice(0, 3).map(app => ( // Show first 3 applications
                            <div key={app.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                              <div>
                                <p className="font-medium text-gray-900">{app.applicantName}</p>
                                <p className="text-sm text-gray-600">{app.applicantEmail}</p>
                              </div>
                              <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={() => setViewingApplicationsForJobId(job.id)}>View</Button>
                            </div>
                          ))}
                          {appsForJob.length > 3 && (
                            <div className="p-4 text-center">
                              <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={() => setViewingApplicationsForJobId(job.id)}>
                                View All {appsForJob.length} Applications
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
};

interface JobApplicationsListProps {
  job: JobListing | undefined;
  applications: JobApplication[];
  onBack: () => void;
}

const JobApplicationsList: React.FC<JobApplicationsListProps> = ({ job, applications, onBack }) => {
  if (!job) {
    return (
      <div className="bg-white p-8 rounded-lg shadow-md text-center">
        <p className="text-red-600 mb-4">Job not found.</p>
        <Button onClick={onBack}>Back to All Applications</Button>
      </div>
    );
  }

  const handleDownloadResume = (url: string, filename: string) => {
    // This will open the URL in a new tab, browser usually handles download for direct links
    window.open(url, '_blank');
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-blue-200">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-gray-900">Applications for "{job.title}"</h3>
        <Button onClick={onBack} variant="outline" className="flex items-center gap-2">
          <X className="w-4 h-4" /> Back to All Applications
        </Button>
      </div>

      {applications.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          No applications received for this job yet.
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map(app => (
            <div key={app.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-lg font-semibold text-gray-900">{app.applicantName}</h4>
                <span className="text-sm text-gray-500">{new Date(app.appliedAt).toLocaleDateString()}</span>
              </div>
              <p className="text-gray-700 mb-3">{app.message}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
                <a href={`mailto:${app.applicantEmail}`} className="flex items-center gap-1 hover:text-blue-600 text-blue-500">
                  <Mail className="w-4 h-4" /> {app.applicantEmail}
                </a>
                <span className="flex items-center gap-1">
                  <LinkIcon className="w-4 h-4" /> {app.applicantPhone}
                </span>
                {app.resumeUrl && (
                  <Button
                    variant="outline"
                    className="px-3 py-1.5 text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800"
                    onClick={() => handleDownloadResume(app.resumeUrl!, `${app.applicantName.replace(/\s/g, '_')}_resume.pdf`)}
                  >
                    <Download className="w-4 h-4" /> Download Resume
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
