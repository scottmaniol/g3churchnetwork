import React, { useState, useEffect } from 'react';
import { JobListing } from '../types';
import { MapPin, Briefcase, Calendar, DollarSign, Award, X, Loader2, Mail, Link as LinkIcon, Building2, Church } from 'lucide-react';
import { getJobListing } from '../services/firebase';
import { Button } from './Button';
import ReactMarkdown from 'react-markdown'; // Assuming markdown rendering for descriptions

interface JobDetailProps {
  jobId: string;
  onBack: () => void;
  onApplyClick: (jobId: string) => void;
}

export const JobDetail: React.FC<JobDetailProps> = ({ jobId, onBack, onApplyClick }) => {
  const [job, setJob] = useState<JobListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchJob = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedJob = await getJobListing(jobId);
        if (fetchedJob) {
          setJob(fetchedJob);
        } else {
          setError('Job listing not found.');
        }
      } catch (err) {
        console.error("Error fetching job listing:", err);
        setError('Failed to load job details. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchJob();
  }, [jobId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={onBack}>Go Back</Button>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <p className="text-gray-700 mb-4">No job details available.</p>
          <Button onClick={onBack}>Go Back</Button>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <Button onClick={onBack} variant="outline" className="flex items-center gap-2">
            <X className="w-4 h-4" /> Back to Job Board
          </Button>
        </div>

        <div className="bg-white rounded-lg shadow-xl overflow-hidden">
          {/* Job Header */}
          <div className="bg-[#ba9150] text-white p-8">
            <div className="flex items-center gap-6 mb-4">
              {job.churchLogoUrl ? (
                <img src={job.churchLogoUrl} alt={job.churchName} className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center text-gray-400 border-4 border-white shadow-lg">
                  <Church className="w-10 h-10" />
                </div>
              )}
              <div>
                <h1 className="text-4xl font-extrabold mb-1">{job.title}</h1>
                <p className="text-white/90 text-xl font-medium">{job.churchName}</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-white/90 text-sm">
              <span className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {job.location}</span>
              <span className="flex items-center gap-2"><Briefcase className="w-4 h-4" /> {job.jobType}</span>
              <span className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Posted: {formatDate(job.datePosted)}</span>
              {job.expirationDate && <span className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Expires: {formatDate(job.expirationDate)}</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-8">
            {/* Job Description & Requirements */}
            <div className="md:col-span-2 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">Job Description</h2>
                <div className="prose prose-blue max-w-none text-gray-700">
                  <ReactMarkdown>{job.description}</ReactMarkdown>
                </div>
              </div>

              {job.requirements && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">Requirements</h2>
                  <div className="prose prose-blue max-w-none text-gray-700">
                    <ReactMarkdown>{job.requirements}</ReactMarkdown>
                  </div>
                </div>
              )}
              
              <div className="mt-8 pt-6 border-t border-gray-200">
                <Button onClick={() => onApplyClick(job.id)} className="px-8 py-4 text-lg">Apply for this Job</Button>
              </div>
            </div>

            {/* Job Overview Sidebar */}
            <div className="md:col-span-1 bg-gray-50 rounded-lg p-6 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Job Overview</h2>
              <ul className="space-y-4">
                <li className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-gray-600 flex-shrink-0" />
                  <div>
                    <span className="block text-sm font-medium text-gray-500">Date Posted</span>
                    <span className="block text-gray-900">{formatDate(job.datePosted)}</span>
                  </div>
                </li>
                {job.expirationDate && (
                  <li className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-gray-600 flex-shrink-0" />
                    <div>
                      <span className="block text-sm font-medium text-gray-500">Expiration Date</span>
                      <span className="block text-gray-900">{formatDate(job.expirationDate)}</span>
                    </div>
                  </li>
                )}
                <li className="flex items-center gap-3">
                  <Briefcase className="w-5 h-5 text-gray-600 flex-shrink-0" />
                  <div>
                    <span className="block text-sm font-medium text-gray-500">Job Type</span>
                    <span className="block text-gray-900">{job.jobType}</span>
                  </div>
                </li>
                <li className="flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-gray-600 flex-shrink-0" />
                  <div>
                    <span className="block text-sm font-medium text-gray-500">Category</span>
                    <span className="block text-gray-900">{job.category}</span>
                  </div>
                </li>
                {job.experienceLevel && (
                  <li className="flex items-center gap-3">
                    <Award className="w-5 h-5 text-gray-600 flex-shrink-0" />
                    <div>
                      <span className="block text-sm font-medium text-gray-500">Experience Level</span>
                      <span className="block text-gray-900">{job.experienceLevel}</span>
                    </div>
                  </li>
                )}
                {job.salary && (
                  <li className="flex items-center gap-3">
                    <DollarSign className="w-5 h-5 text-gray-600 flex-shrink-0" />
                    <div>
                      <span className="block text-sm font-medium text-gray-500">Salary</span>
                      <span className="block text-gray-900">{job.salary}</span>
                    </div>
                  </li>
                )}
              </ul>

              {/* Church Contact Info */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 mb-4">{job.churchName}</h3>
                <ul className="space-y-3">
                  {/* Assuming we might fetch church details from the original application, or add to JobListing */}
                  {/* For now, just a placeholder or minimal info */}
                  <li className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-gray-600 flex-shrink-0" />
                    <span className="text-gray-900">{job.location}</span>
                  </li>
                  {/* Add actual church contact info if available, e.g., from church.churchEmail */}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
