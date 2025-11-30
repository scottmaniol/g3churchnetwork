import React, { useState } from 'react';
import { JobApplication } from '../types';
import { X, Loader2, CheckCircle, Upload } from 'lucide-react';
import { Button } from './Button';
import { submitJobApplication, uploadResume } from '../services/firebase'; // These will be added to firebase.ts

interface JobApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle: string;
  churchId: string;
  onSuccess: () => void;
}

export const JobApplicationModal: React.FC<JobApplicationModalProps> = ({ isOpen, onClose, jobId, jobTitle, churchId, onSuccess }) => {
  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [message, setMessage] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!applicantName || !applicantEmail || !applicantPhone || !message) {
      setError('Please fill in all required fields.');
      setLoading(false);
      return;
    }

    try {
      let resumeUrl: string | undefined;
      if (resumeFile) {
        setUploadingResume(true);
        resumeUrl = await uploadResume(resumeFile, jobId, applicantName);
        setUploadingResume(false);
      }

      const newApplication: Omit<JobApplication, 'id'> = {
        jobId,
        jobTitle,
        churchId,
        applicantName,
        applicantEmail,
        applicantPhone,
        message,
        resumeUrl,
        appliedAt: new Date().toISOString(),
        status: 'new',
      };

      await submitJobApplication(newApplication);
      setSuccess(true);
      setLoading(false);
      onSuccess(); // Notify parent of success
      // Automatically close modal after a short delay
      setTimeout(() => {
        onClose();
        resetForm();
      }, 3000);

    } catch (err: any) {
      console.error("Error submitting job application:", err);
      setError(`Failed to submit application: ${err.message || 'Unknown error'}`);
      setLoading(false);
      setUploadingResume(false);
    }
  };

  const resetForm = () => {
    setApplicantName('');
    setApplicantEmail('');
    setApplicantPhone('');
    setMessage('');
    setResumeFile(null);
    setLoading(false);
    setUploadingResume(false);
    setError(null);
    setSuccess(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen px-4 py-6">
        <div 
          className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-[#ba9150] text-white px-6 py-4 flex items-center justify-between">
            <h3 className="text-xl font-bold font-serif">Apply for "{jobTitle}"</h3>
            <button onClick={() => {onClose(); resetForm();}} className="text-white/80 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6">
            {success ? (
              <div className="text-center py-12">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6" />
                <h4 className="text-2xl font-bold text-gray-900 mb-3">Application Submitted!</h4>
                <p className="text-gray-600">Thank you for your application. We will be in touch shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="applicantName" className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    id="applicantName"
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    required
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="applicantEmail" className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                    <input
                      type="email"
                      id="applicantEmail"
                      value={applicantEmail}
                      onChange={(e) => setApplicantEmail(e.target.value)}
                      required
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    />
                  </div>
                  <div>
                    <label htmlFor="applicantPhone" className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                    <input
                      type="tel"
                      id="applicantPhone"
                      value={applicantPhone}
                      onChange={(e) => setApplicantPhone(e.target.value)}
                      required
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                  ></textarea>
                </div>
                <div>
                  <label htmlFor="resume" className="block text-sm font-medium text-gray-700 mb-1">Upload CV (doc, docx, pdf)</label>
                  <label className="flex items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-md cursor-pointer bg-gray-50 hover:bg-gray-100">
                    <input
                      type="file"
                      id="resume"
                      accept=".doc,.docx,.pdf"
                      onChange={(e) => setResumeFile(e.target.files ? e.target.files[0] : null)}
                      className="hidden"
                      disabled={uploadingResume || loading}
                    />
                    {uploadingResume ? (
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    ) : resumeFile ? (
                      <span className="text-green-600 flex items-center gap-2"><CheckCircle className="w-5 h-5" /> {resumeFile.name}</span>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-gray-500">
                        <Upload className="w-6 h-6 mb-2" />
                        <p className="text-sm">Click to upload or drag and drop</p>
                        <p className="text-xs">DOC, DOCX, PDF (MAX. 5MB)</p>
                      </div>
                    )}
                  </label>
                  {resumeFile && !uploadingResume && (
                    <button type="button" onClick={() => setResumeFile(null)} className="mt-2 text-red-600 hover:underline text-sm">Remove file</button>
                  )}
                </div>
                
                {error && <p className="text-red-600 text-sm">{error}</p>}

                <div className="flex justify-end pt-4 border-t border-gray-100">
                  <Button type="submit" isLoading={loading} disabled={uploadingResume}>
                    {loading ? 'Submitting...' : 'Apply Job'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
