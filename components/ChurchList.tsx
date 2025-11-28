import React, { useState, useMemo } from 'react';
import { ChurchApplication } from '../types';
import { MapPin, Globe, ChevronDown, ChevronUp } from 'lucide-react';

interface ChurchListProps {
  churches: ChurchApplication[];
  onSelectChurch: (church: ChurchApplication) => void;
  selectedChurch: ChurchApplication | null;
}

type SortOption = 'name' | 'country' | 'city' | 'recent';

export const ChurchList: React.FC<ChurchListProps> = ({ 
  churches, 
  onSelectChurch, 
  selectedChurch 
}) => {
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const sortedChurches = [...churches].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'name':
        comparison = a.churchName.localeCompare(b.churchName);
        break;
      case 'country':
        comparison = (a.churchAddress?.country || '').localeCompare(b.churchAddress?.country || '');
        break;
      case 'city':
        comparison = (a.churchAddress?.city || '').localeCompare(b.churchAddress?.city || '');
        break;
      case 'recent':
        comparison = new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
        break;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const handleSortChange = (newSortBy: SortOption) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  // Generate church initials for avatar
  const getChurchInitials = (name: string): string => {
    const words = name.trim().split(/\s+/);
    if (words.length === 1) {
      return words[0].substring(0, 2).toUpperCase();
    }
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Church Cards List */}
      <div className="flex-1 overflow-y-auto">
        {sortedChurches.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            No churches found
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {sortedChurches.map((church) => (
              <div
                key={church.id}
                onClick={() => onSelectChurch(church)}
                className={`p-5 cursor-pointer transition-all hover:bg-gray-50 ${
                  selectedChurch?.id === church.id ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Church Avatar */}
                  {church.churchLogoUrl ? (
                    <img 
                      src={church.churchLogoUrl} 
                      alt={church.churchName} 
                      className="flex-shrink-0 w-12 h-12 rounded-full object-cover border border-gray-200"
                    />
                  ) : (
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#7d7d7d] flex items-center justify-center">
                      <span className="text-white font-bold text-base">
                        {getChurchInitials(church.churchName)}
                      </span>
                    </div>
                  )}

                  {/* Church Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-semibold text-gray-900 mb-1">
                      {church.churchName}
                    </h4>
                    
                    <div className="flex items-center text-sm text-gray-600 mb-2">
                      <span className="truncate">
                        {(church.churchAddress?.city || 'N/A')}, {(church.churchAddress?.state ? `${church.churchAddress.state}, ` : '') || ''}{(church.churchAddress?.country || 'N/A')}
                      </span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-4">
                      {church.churchWebsite && (
                        <a
                          href={church.churchWebsite}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                        >
                          <Globe className="w-4 h-4" />
                          <span>Website</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
