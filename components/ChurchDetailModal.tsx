import React, { useEffect, useState } from 'react';
import { ChurchApplication } from '../types';
import { X, MapPin, Phone, Mail, Globe, Users, Clock, Share2, ExternalLink, Send, Facebook, Instagram, Youtube, Twitter, PlayCircle, Church } from 'lucide-react'; // Added Church import
import { trackChurchView, trackChurchVisit, trackSocialClick } from '../services/firebase';
import { ContactChurchModal } from './ContactChurchModal';

const DEFAULT_CHURCH_LOGO_SVG_DATA_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLWNodXJjaCI+PHBhdGggZD0iTTE4IDdWMjJoLTR2NSIvPjxwYXRoIGQ9Ik04IDdWMjJIMHY1Ii8+PHBhdGggZD0iTTEyIDIydi04Ii8+PHBhdGggZD0iTTggMjJ2LTRINHh2NCIvPjxwYXRoIGQ9Ik0xOCAyMnYtNGg0djQiLz48cGF0aCBkPSJNIDQgMTRoMTZWN0g0eiIvPjwvc3ZnPg==';

interface ChurchDetailModalProps {
  church: ChurchApplication | null;
  onClose: () => void;
  onJobClick: (jobId: string) => void;
}

export const ChurchDetailModal: React.FC<ChurchDetailModalProps> = ({ church, onClose, onJobClick }) => {
  const [showContactModal, setShowContactModal] = useState(false);
  const viewTrackedRef = React.useRef<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  // Track view when modal opens
  useEffect(() => {
    if (church && viewTrackedRef.current !== church.id) {
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
      viewTrackedRef.current = church.id;
      trackChurchView(church.id).catch((error) => {
        console.error('Error tracking view:', error);
      });
    } else if (!church) {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [church]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 300); // Match duration of the animation
  };

  const handleVisitWebsite = () => {
    if (church?.connections?.website) {
      // Track website visit
      trackChurchVisit(church.id).catch((error) => {
        console.error('Error tracking website visit:', error);
      });
      
      // Open website in new tab
      const url = church.connections.website.match(/^https?:\/\//) 
        ? church.connections.website 
        : `http://${church.connections.website}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSocialClick = (platform: string, url: string) => {
    // Track social media click
    trackSocialClick(church!.id, platform).catch((error) => {
      console.error('Error tracking social click:', error);
    });
    
    // Open link
    const fullUrl = url.match(/^https?:\/\//) ? url : `http://${url}`;
    window.open(fullUrl, '_blank', 'noopener,noreferrer');
  };

  if (!church) return null;

  const address = church.churchAddress; // Access directly as it's already optional in ChurchApplication
  const { street, city, state, postalCode, country } = address || {}; // Use destructuring with default empty object
  const fullAddress = `${street || ''}, ${city || ''}, ${state || ''} ${postalCode || ''}, ${country || ''}`.replace(/,(\s*,){1,}/g, ',').replace(/^,|,$/g, '').trim(); // Clean up extra commas
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

  const hasConnections = church.connections && (
    church.connections.sermons ||
    church.connections.facebook ||
    church.connections.x ||
    church.connections.instagram ||
    church.connections.youtube
  );

  return (
    <div className={`fixed inset-0 z-50 overflow-y-auto transition-opacity duration-500 ease-in-out ${!isClosing ? 'opacity-100' : 'opacity-0'}`} onClick={handleClose}>
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" aria-hidden="true" />

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div 
          className={`inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all duration-500 ease-in-out sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full ${!isClosing ? 'sm:scale-100 sm:translate-y-0' : 'sm:scale-95 sm:-translate-y-10'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-black px-6 py-4 flex items-start justify-between">
            <div className="flex-1 flex items-center gap-4">
              {church.churchLogoUrl ? (
                <img 
                  src={church.churchLogoUrl} 
                  alt={church.churchName} 
                  className="w-16 h-16 rounded-full object-cover border-2 border-white bg-white"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 border-2 border-white">
                  <Church className="w-8 h-8" />
                </div>
              )}
              <div>
                <h3 className="text-2xl font-serif font-bold text-white">{church.churchName}</h3>
                <p className="text-gray-300 text-sm mt-1 flex items-center">
                  <MapPin className="w-4 h-4 mr-1" />
                  {city || 'N/A'}, {country || 'N/A'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="ml-4 text-gray-300 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Job Listings */}
            {church.jobListings && church.jobListings.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 flex items-center">
                  <span className="mr-2 text-yellow-500">✨</span> Job Openings
                </h4>
                <div className="space-y-3">
                  {church.jobListings.map(job => (
                    <div 
                      key={job.id} 
                      className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 cursor-pointer hover:border-yellow-400 transition-all flex justify-between items-center"
                      onClick={() => onJobClick(job.id)}
                    >
                      <div>
                        <p className="text-base font-semibold text-yellow-800">{job.title}</p>
                        <p className="text-sm text-yellow-700">{job.jobType} • {job.location}</p>
                      </div>
                      <ExternalLink className="w-5 h-5 text-yellow-600" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Description */}
            {church.churchDescription && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">About</h4>
                <p className="text-gray-700 leading-relaxed">{church.churchDescription}</p>
              </div>
            )}

            {/* Contact Information */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Contact Information</h4>
              <div className="space-y-3">
                <div className="flex items-start">
                  <MapPin className="w-5 h-5 text-gray-400 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Address</p>
                    <a 
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {fullAddress}
                    </a>
                  </div>
                </div>

                <div className="flex items-start">
                  <Phone className="w-5 h-5 text-gray-400 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Phone</p>
                    {church.churchPhone ? (
                      <a href={`tel:${church.churchPhone}`} className="text-sm text-blue-600 hover:text-blue-800">
                        {church.churchPhone}
                      </a>
                    ) : (
                      <p className="text-sm text-gray-700">N/A</p>
                    )}
                  </div>
                </div>

                {church.churchEmail && (
                  <div className="flex items-start">
                    <Mail className="w-5 h-5 text-gray-400 mr-3 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Email</p>
                      <a href={`mailto:${church.churchEmail}`} className="text-sm text-blue-600 hover:text-blue-800">
                        {church.churchEmail}
                      </a>
                    </div>
                  </div>
                )}

                {church.connections?.website && (
                  <div className="flex items-start">
                    <Globe className="w-5 h-5 text-gray-400 mr-3 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Website</p>
                      <a 
                        href={church.connections.website.match(/^https?:\/\//) ? church.connections.website : `http://${church.connections.website}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Visit Website
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Service Times */}
            {church.gatherings && church.gatherings.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 flex items-center">
                  <Clock className="w-4 h-4 mr-2" />
                  Service Times
                </h4>
                <div className="space-y-2">
                  {church.gatherings.map((gathering) => (
                    <div key={gathering.id} className="bg-gray-50 p-3 rounded-md">
                      <p className="text-sm font-semibold text-gray-900">{gathering.name}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {gathering.day} • {gathering.startTime} - {gathering.endTime}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Elders */}
            {church.leaders && church.leaders.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 flex items-center">
                  <Users className="w-4 h-4 mr-2" />
                  Church Elders
                </h4>
                <div className="space-y-2">
                  {church.leaders.map((leader) => (
                  <div key={leader.id} className="bg-gray-50 p-3 rounded-md flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {leader.firstName} {leader.lastName}
                      </p>
                      <p className="text-xs text-gray-600">Elder</p>
                    </div>
                  </div>
                  ))}
                </div>
              </div>
            )}

            {/* Online Connections */}
            {hasConnections && church.connections && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 flex items-center">
                  <Share2 className="w-4 h-4 mr-2" />
                  Connect Online
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {church.connections.sermons && (
                    <button
                      onClick={() => handleSocialClick('sermons', church.connections!.sermons!)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all group w-full text-left"
                    >
                      <div className="p-2 bg-blue-100 rounded-full text-blue-600 group-hover:bg-blue-200 transition-colors">
                        <PlayCircle className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-gray-700 group-hover:text-blue-700">Sermons</span>
                    </button>
                  )}
                  {church.connections.facebook && (
                    <button
                      onClick={() => handleSocialClick('facebook', church.connections!.facebook!)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all group w-full text-left"
                    >
                      <div className="p-2 bg-blue-100 rounded-full text-blue-600 group-hover:bg-blue-200 transition-colors">
                        <Facebook className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-gray-700 group-hover:text-blue-700">Facebook</span>
                    </button>
                  )}
                  {church.connections.x && (
                    <button
                      onClick={() => handleSocialClick('twitter', church.connections!.x!)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all group w-full text-left"
                    >
                      <div className="p-2 bg-blue-100 rounded-full text-blue-600 group-hover:bg-blue-200 transition-colors">
                        <Twitter className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-gray-700 group-hover:text-blue-700">X (Twitter)</span>
                    </button>
                  )}
                  {church.connections.instagram && (
                    <button
                      onClick={() => handleSocialClick('instagram', church.connections!.instagram!)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all group w-full text-left"
                    >
                      <div className="p-2 bg-blue-100 rounded-full text-blue-600 group-hover:bg-blue-200 transition-colors">
                        <Instagram className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-gray-700 group-hover:text-blue-700">Instagram</span>
                    </button>
                  )}
                  {church.connections.youtube && (
                    <button
                      onClick={() => handleSocialClick('youtube', church.connections!.youtube!)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all group w-full text-left"
                    >
                      <div className="p-2 bg-blue-100 rounded-full text-blue-600 group-hover:bg-blue-200 transition-colors">
                        <Youtube className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-gray-700 group-hover:text-blue-700">YouTube</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
            <div className="flex gap-3">
              {church.connections?.website && (
                <button
                  onClick={handleVisitWebsite}
                  className="px-4 py-2 bg-[#ba9150] text-white rounded-md hover:bg-[#a37e47] transition-colors flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Visit Website
                </button>
              )}
              {church.churchEmail && (
                <button
                  onClick={() => setShowContactModal(true)}
                  className="px-4 py-2 bg-[#ba9150] text-white rounded-md hover:bg-[#a37e47] transition-colors flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Contact Us
                </button>
              )}
            </div>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Contact Modal */}
      {showContactModal && (
        <ContactChurchModal
          churchId={church.id}
          churchName={church.churchName}
          onClose={() => setShowContactModal(false)}
        />
      )}
    </div>
  );
};
