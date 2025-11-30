import React, { useState } from 'react';
import { X, Mail, Send } from 'lucide-react';
import { Button } from './Button';
import { ContactFormData } from '../types';
import { sendAdminContactEmail } from '../services/firebase';

interface ContactAdminModalProps {
  onClose: () => void;
}

export const ContactAdminModal: React.FC<ContactAdminModalProps> = ({
  onClose
}) => {
  const [formData, setFormData] = useState<ContactFormData>({
    senderName: '',
    senderEmail: '',
    message: ''
  });
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.senderName.trim() || !formData.senderEmail.trim() || !formData.message.trim()) {
      setStatus({ type: 'error', message: 'Please fill in all fields.' });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.senderEmail)) {
      setStatus({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    setIsSending(true);
    setStatus(null);

    try {
      await sendAdminContactEmail(formData);
      
      setStatus({
        type: 'success',
        message: 'Your message has been sent successfully! We will receive your message and respond directly to your email.'
      });
      
      // Clear form after successful send
      setTimeout(() => {
        setFormData({ senderName: '', senderEmail: '', message: '' });
        onClose();
      }, 2000);
    } catch (error: any) {
      console.error('Error sending contact email:', error);
      setStatus({
        type: 'error',
        message: 'Failed to send your message. Please try again or email admin@g3min.org directly.'
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black bg-opacity-50" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen px-4 py-6">
        <div
          className="bg-white rounded-lg shadow-2xl max-w-lg w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-black px-6 py-4 flex items-center justify-between">
            <div className="flex items-center">
              <Mail className="w-6 h-6 text-white mr-3" />
              <h3 className="text-xl font-serif font-bold text-white">Contact G3 Church Network</h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-300 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-sm text-gray-600">
              Send a message to the G3 Church Network administrators. We will receive your message and respond directly to your email.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.senderName}
                onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                placeholder="John Doe"
                required
                disabled={isSending}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.senderEmail}
                onChange={(e) => setFormData({ ...formData, senderEmail: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                placeholder="john@example.com"
                required
                disabled={isSending}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                rows={6}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                placeholder="Type your message here..."
                required
                disabled={isSending}
              />
            </div>

            {/* Status Message */}
            {status && (
              <div
                className={`p-3 rounded-md ${
                  status.type === 'success'
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                <p className="text-sm">{status.message}</p>
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSending}
                className="flex items-center"
              >
                <Send className="w-4 h-4 mr-2" />
                Send Message
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
