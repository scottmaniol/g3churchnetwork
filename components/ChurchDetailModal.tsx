import React from 'react';
import { ChurchApplication } from '../types';
import { X, MapPin, Phone, Mail, Globe, Users, Clock, Share2 } from 'lucide-react';

interface ChurchDetailModalProps {
  church: ChurchApplication | null;
  onClose: () => void;
}

export const ChurchDetailModal: React.FC<ChurchDetailModalProps> = ({ church, onClose }) => {
  if (!church) return null;

  const address = church.churchAddress || {};
  const { street, city, state, postalCode, country } = address;
  const fullAddress = `${street || ''}, ${city || ''}, ${state || ''} ${postalCode || ''}, ${country || ''}`.replace(/,(\s*,){1,}/g, ',').replace(/^,|,$/g, '').trim(); // Clean up extra commas
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" aria-hidden="true" />

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div 
          className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-black px-6 py-4 flex items-start justify-between">
            <div className="flex-1 flex items-center gap-4">
              {church.churchLogoUrl && (
                <img 
                  src={church.churchLogoUrl} 
                  alt={church.churchName} 
                  className="w-16 h-16 rounded-full object-cover border-2 border-white bg-white"
                />
              )}
              <div>
                <h3 className="text-2xl font-serif font-bold text-white">{church.churchName}</h3>
                <p className="text-gray-300 text-sm mt-1 flex items-center">
                  <MapPin className="w-4 h-4 mr-1" />
                  {address.city || 'N/A'}, {address.country || 'N/A'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="ml-4 text-gray-300 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-6 space-y-6 max-h-[70vh] overflow-y-auto">
            
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
                    <p className="text-sm font-medium text-gray-900">Phone ({church.churchPhoneType || 'N/A'})</p>
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
                        href={church.connections.website} 
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

            {/* Leadership */}
            {church.leaders && church.leaders.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 flex items-center">
                  <Users className="w-4 h-4 mr-2" />
                  Church Leadership
                </h4>
                <div className="space-y-2">
                  {church.leaders.map((leader) => (
                    <div key={leader.id} className="bg-gray-50 p-3 rounded-md flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {leader.firstName} {leader.lastName}
                        </p>
                        <p className="text-xs text-gray-600">{leader.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

            {/* Online Connections */}
            {church.connections && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 flex items-center">
                  <Share2 className="w-4 h-4 mr-2" />
                  Connect Online
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {church.connections.facebook && (
                    <a 
                      href={church.connections.facebook} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-gray-50 p-2 rounded-md text-xs text-blue-600 hover:bg-gray-100 transition-colors text-center"
                    >
                      Facebook
                    </a>
                  )}
                  {church.connections.x && (
                    <a 
                      href={church.connections.x} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-gray-50 p-2 rounded-md text-xs text-blue-600 hover:bg-gray-100 transition-colors text-center"
                    >
                      X (Twitter)
                    </a>
                  )}
                  {church.connections.instagram && (
                    <a 
                      href={church.connections.instagram} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-gray-50 p-2 rounded-md text-xs text-blue-600 hover:bg-gray-100 transition-colors text-center"
                    >
                      Instagram
                    </a>
                  )}
                  {church.connections.youtube && (
                    <a 
                      href={church.connections.youtube} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-gray-50 p-2 rounded-md text-xs text-blue-600 hover:bg-gray-100 transition-colors text-center"
                    >
                      YouTube
                    </a>
                  )}
                  {church.connections.spotify && (
                    <a 
                      href={church.connections.spotify} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-gray-50 p-2 rounded-md text-xs text-blue-600 hover:bg-gray-100 transition-colors text-center"
                    >
                      Spotify
                    </a>
                  )}
                  {church.connections.applePodcasts && (
                    <a 
                      href={church.connections.applePodcasts} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-gray-50 p-2 rounded-md text-xs text-blue-600 hover:bg-gray-100 transition-colors text-center"
                    >
                      Apple Podcasts
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
