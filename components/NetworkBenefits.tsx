import React, { useState, useEffect } from 'react';
import { MessageSquare, Tag, Briefcase, Map as MapIcon, BookOpen, ExternalLink, RefreshCw } from 'lucide-react';
import { getNetworkBenefits } from '../services/firebase';
import { NetworkBenefit } from '../types';

interface NetworkBenefitsProps {
  onChangeTab: (tab: 'jobs') => void;
}

export const NetworkBenefits: React.FC<NetworkBenefitsProps> = ({ onChangeTab }) => {
  const [benefits, setBenefits] = useState<NetworkBenefit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBenefits = async () => {
      try {
        const data = await getNetworkBenefits();
        if (data && data.length > 0) {
          setBenefits(data);
        } else {
          // Defaults
          setBenefits([
            {
              id: 'pastors_forum',
              title: 'Pastors Forum',
              description: 'Join the conversation at network.g3min.org. All elders are welcome to join our exclusive community.',
              linkText: 'Join Forum',
              linkUrl: 'https://network.g3min.org/share/jCRwzB7ASXOP137r?utm_source=manual'
            },
            {
              id: 'discounts',
              title: 'Exclusive Discounts',
              description: 'Use code G3CN for 50% off events and free shipping on resources.',
              linkText: 'Copy Code', // Handled specially
              linkUrl: '#'
            },
            {
              id: 'job_portal',
              title: 'Job Portal',
              description: 'Post ministry positions and find qualified candidates through our dedicated job board.',
              linkText: 'Manage Job Listings',
              linkUrl: '#' // Handled via onClick
            },
            {
              id: 'map',
              title: 'Church Network Map',
              description: 'Increase your visibility and help like-minded believers find your church on our global map.',
              linkText: 'View Map',
              linkUrl: '/'
            },
            {
              id: 'resources',
              title: 'G3 Ministries Resources',
              description: 'Access a wealth of theological resources, articles, and media at G3min.org to equip your church.',
              linkText: 'Visit G3min.org',
              linkUrl: 'https://g3min.org'
            }
          ]);
        }
      } catch (error) {
        console.error("Error loading network benefits:", error);
      } finally {
        setLoading(false);
      }
    };

    loadBenefits();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Helper to get benefit by ID (safe fallback)
  const getBenefit = (id: string) => benefits.find(b => b.id === id) || {
    id,
    title: 'Loading...',
    description: 'Loading...',
    linkText: 'Loading...',
    linkUrl: '#'
  };

  const forum = getBenefit('pastors_forum');
  const discounts = getBenefit('discounts');
  const jobs = getBenefit('job_portal');
  const map = getBenefit('map');
  const resources = getBenefit('resources');

  // Helper to highlight "G3CN" in description if present
  const renderDescription = (text: string) => {
    if (text.includes('G3CN')) {
      const parts = text.split('G3CN');
      return (
        <>
          {parts[0]}
          <span className="font-bold text-gray-900">G3CN</span>
          {parts[1]}
        </>
      );
    }
    return text;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 border rounded-lg shadow-sm">
        <h3 className="text-xl font-serif font-bold text-gray-900 mb-6">Network Benefits</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pastors Forum */}
          <div className="p-6 bg-blue-50 rounded-xl border border-blue-100 flex flex-col h-full transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <MessageSquare className="w-6 h-6 text-blue-700" />
              </div>
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">{forum.title}</h4>
            <p className="text-gray-600 mb-6 flex-grow">
              {forum.description}
            </p>
            <a 
              href={forum.linkUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center text-blue-700 font-semibold hover:text-blue-800"
            >
              {forum.linkText} <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </div>

          {/* Discounts & Free Shipping */}
          <div className="p-6 bg-green-50 rounded-xl border border-green-100 flex flex-col h-full transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Tag className="w-6 h-6 text-green-700" />
              </div>
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">{discounts.title}</h4>
            <p className="text-gray-600 mb-6 flex-grow">
              {renderDescription(discounts.description)}
            </p>
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium text-green-800 bg-green-200/50 px-3 py-1 rounded-full w-fit">
                Coupon Code: G3CN
              </div>
            </div>
          </div>

          {/* Job Portal */}
          <div className="p-6 bg-purple-50 rounded-xl border border-purple-100 flex flex-col h-full transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Briefcase className="w-6 h-6 text-purple-700" />
              </div>
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">{jobs.title}</h4>
            <p className="text-gray-600 mb-6 flex-grow">
              {jobs.description}
            </p>
            <button 
              onClick={() => onChangeTab('jobs')}
              className="inline-flex items-center text-purple-700 font-semibold hover:text-purple-800 text-left"
            >
              {jobs.linkText} <ExternalLink className="w-4 h-4 ml-2" />
            </button>
          </div>

          {/* Map */}
          <div className="p-6 bg-orange-50 rounded-xl border border-orange-100 flex flex-col h-full transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-orange-100 rounded-lg">
                <MapIcon className="w-6 h-6 text-orange-700" />
              </div>
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">{map.title}</h4>
            <p className="text-gray-600 mb-6 flex-grow">
              {map.description}
            </p>
            <a 
              href={map.linkUrl} 
              target="_blank" 
              className="inline-flex items-center text-orange-700 font-semibold hover:text-orange-800"
            >
              {map.linkText} <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </div>

          {/* Resources */}
          <div className="p-6 bg-gray-50 rounded-xl border border-gray-200 flex flex-col h-full md:col-span-2 transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-white border border-gray-200 rounded-lg">
                <BookOpen className="w-6 h-6 text-gray-700" />
              </div>
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">{resources.title}</h4>
            <p className="text-gray-600 mb-6">
              {resources.description}
            </p>
            <a 
              href={resources.linkUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center text-gray-900 font-semibold hover:text-black"
            >
              {resources.linkText} <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
