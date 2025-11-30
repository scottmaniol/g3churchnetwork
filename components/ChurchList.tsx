import React, { useMemo } from 'react';
import { ChurchApplication } from '../types';
import { Church } from 'lucide-react'; // Import the Church icon

const DEFAULT_CHURCH_LOGO_SVG_DATA_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLWNodXJjaCI+PHBhdGggZD0iTTE4IDdWMjJoLTR2NSIvPjxwYXRoIGQ9Ik04IDdWMjJIMHY1Ii8+PHBhdGggZD0iTTEyIDIydi04Ii8+PHBhdGggZD0iTTggMjJ2LTRINHh2NCIvPjxwYXRoIGQ9Ik0xOCAyMnYtNGg0djQiLz48cGF0aCBkPSJNIDQgMTRoMTZWN0g0eiIvPjwvc3ZnPg==';

interface ChurchListProps {
  churches: ChurchApplication[];
  onSelectChurch: (church: ChurchApplication) => void;
  selectedChurch: ChurchApplication | null;
}

export const ChurchList: React.FC<ChurchListProps> = ({ 
  churches, 
  onSelectChurch, 
  selectedChurch 
}) => {
  const sortedChurches = useMemo(() => {
    return [...churches].sort((a, b) => {
      // Always put Pray's Mill Baptist Church at the top
      const isPraysMillA = a.churchName.toLowerCase().includes("pray's mill");
      const isPraysMillB = b.churchName.toLowerCase().includes("pray's mill");
      
      if (isPraysMillA && !isPraysMillB) return -1;
      if (!isPraysMillA && isPraysMillB) return 1;
      
      return a.churchName.localeCompare(b.churchName);
    });
  }, [churches]);

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
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                      <Church className="w-6 h-6" />
                    </div>
                  )}

                  {/* Church Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-semibold text-gray-900 mb-1">
                      {church.churchName}
                    </h4>
                    
                    <div className="text-sm text-gray-600">
                      <span className="truncate block">
                        {(church.churchAddress?.city || 'N/A')}, {(church.churchAddress?.state ? `${church.churchAddress.state}, ` : '') || ''}{(church.churchAddress?.country || 'N/A')}
                      </span>
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
