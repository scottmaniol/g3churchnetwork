import React, { useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ChurchApplication, ApplicationStatus } from '../types';
import { ArrowLeft, Search, List, Map as MapIcon, LayoutGrid } from 'lucide-react';
import { ChurchList } from './ChurchList';
import { ChurchDetailModal } from './ChurchDetailModal';

// Set the Mapbox access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

interface WorldMapProps {
  churches: ChurchApplication[];
  onBack: () => void;
  onJoinClick: () => void;
}

type ViewMode = 'map' | 'list' | 'split';

export const WorldMap: React.FC<WorldMapProps> = ({ churches, onBack, onJoinClick }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChurch, setSelectedChurch] = useState<ChurchApplication | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [highlightedChurch, setHighlightedChurch] = useState<ChurchApplication | null>(null);
  
  // Zip Search State
  const [zipCode, setZipCode] = useState('');
  const [radius, setRadius] = useState('50');
  const [zipCoords, setZipCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isGeocodingZip, setIsGeocodingZip] = useState(false);

  const activeChurches = useMemo(() => {
    return churches.filter(
      c => c.status === ApplicationStatus.APPROVED && c.coordinates && typeof c.coordinates.lat === 'number' && typeof c.coordinates.lng === 'number'
    );
  }, [churches]);

  // Helper function to calculate distance
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const filteredChurches = useMemo(() => {
    const filtered = activeChurches.filter(church => {
      // Text search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const address = church.churchAddress || {};
        const matchesSearch = (
          church.churchName.toLowerCase().includes(query) ||
          (address.city && address.city.toLowerCase().includes(query)) ||
          (address.country && address.country.toLowerCase().includes(query)) ||
          (address.state && address.state.toLowerCase().includes(query))
        );
        if (!matchesSearch) return false;
      }

      // Radius filter
      if (zipCoords && radius) {
        const distance = calculateDistance(
          zipCoords.lat,
          zipCoords.lng,
          church.coordinates!.lat,
          church.coordinates!.lng
        );
        return distance <= parseInt(radius);
      }

      return true;
    });
    return filtered;
  }, [activeChurches, searchQuery, zipCoords, radius]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current || !mapboxgl.accessToken) {
      console.error("Mapbox token is not set or map container not found.");
      return;
    }

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-98.5795, 39.8283],
      zoom: 3.5
    });

    map.addControl(new mapboxgl.NavigationControl());
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Markers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Remove old markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add new markers
    for (const church of filteredChurches) {
      const el = document.createElement('div');
      el.className = 'marker';

      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 15,
        className: 'marker-popup'
      }).setHTML(`<h6>${church.churchName}</h6><p>${church.churchAddress.city}, ${church.churchAddress.state}</p>`);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([church.coordinates!.lng, church.coordinates!.lat])
        .setPopup(popup)
        .addTo(mapInstanceRef.current!);

      marker.getElement().addEventListener('mouseenter', () => marker.togglePopup());
      marker.getElement().addEventListener('mouseleave', () => marker.togglePopup());
      
      marker.getElement().addEventListener('click', () => {
        handleSelectChurch(church);
      });

      markersRef.current.push(marker);
    }

  }, [filteredChurches]);

  // Handle FlyTo for Selection
  useEffect(() => {
    if (!mapInstanceRef.current || !highlightedChurch?.coordinates) return;
    mapInstanceRef.current.flyTo({
      center: [highlightedChurch.coordinates.lng, highlightedChurch.coordinates.lat],
      zoom: 12,
      duration: 1500
    });
  }, [highlightedChurch]);

  useEffect(() => {
    if (zipCoords && mapInstanceRef.current) {
      const zoomLevel =
        parseInt(radius) <= 10 ? 10 :
        parseInt(radius) <= 25 ? 9 :
        parseInt(radius) <= 50 ? 8 :
        7;
      mapInstanceRef.current.flyTo({
        center: [zipCoords.lng, zipCoords.lat],
        zoom: zoomLevel,
        duration: 1500
      });
    }
  }, [zipCoords, radius]);

  // Handle Resize when view mode changes
  useEffect(() => {
    if (mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current?.resize(), 300);
    }
  }, [viewMode]);

  const handleSelectChurch = (church: ChurchApplication) => {
    setSelectedChurch(church);
    setHighlightedChurch(church);
  };

  const handleZipSearch = async () => {
    if (!zipCode.trim()) {
      setZipCoords(null);
      return;
    }

    setIsGeocodingZip(true);
    try {
      const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(zipCode)}.json?access_token=${mapboxgl.accessToken}&types=postcode&limit=1`);
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        setZipCoords({ lat, lng });
      } else {
        alert('Zip code not found. Please try again.');
        setZipCoords(null);
      }
    } catch (error) {
      console.error('Error geocoding zip code:', error);
      alert('Failed to search by zip code. Please try again.');
    } finally {
      setIsGeocodingZip(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white shadow-sm p-4 flex flex-col gap-3 z-10 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center flex-1">
            <button onClick={onBack} className="mr-4 p-2 hover:bg-slate-100 rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6 text-slate-700" />
            </button>
            <div className="flex-1">
              <h2 className="text-xl font-serif font-bold text-brand-900">G3 Network Directory</h2>
            </div>
          </div>

          <button
            onClick={onJoinClick}
            className="hidden md:block mr-4 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            Join the Network
          </button>
          
          {/* View Mode Toggle */}
          <div className="hidden md:flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setViewMode('map')} className={`p-2 rounded ${viewMode === 'map' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`} title="Map View"><MapIcon className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('split')} className={`p-2 rounded ${viewMode === 'split' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`} title="Split View"><LayoutGrid className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('list')} className={`p-2 rounded ${viewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`} title="List View"><List className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Zip Code Radius Search */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter zip code"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleZipSearch()}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
          />
          <select value={radius} onChange={(e) => setRadius(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg bg-white">
            <option value="10">10 mi</option>
            <option value="25">25 mi</option>
            <option value="50">50 mi</option>
            <option value="100">100 mi</option>
            <option value="250">250 mi</option>
          </select>
          <button onClick={handleZipSearch} disabled={isGeocodingZip || !zipCode.trim()} className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">
            {isGeocodingZip ? '...' : 'Search'}
          </button>
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        <div 
          className={`absolute inset-0 transition-all duration-300 ${viewMode === 'list' ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'} ${viewMode === 'split' ? 'md:w-[70%]' : 'w-full'}`}
        >
          <div ref={mapContainerRef} className="w-full h-full bg-slate-200" />
        </div>

        <div 
          className={`absolute top-0 bottom-0 right-0 bg-white border-l transition-all duration-300 overflow-hidden ${viewMode === 'map' ? 'translate-x-full' : 'translate-x-0'} ${viewMode === 'split' ? 'w-full md:w-[30%]' : 'w-full'} ${viewMode === 'list' ? 'w-full' : ''}`}
        >
          <ChurchList
            churches={filteredChurches}
            onSelectChurch={handleSelectChurch}
            selectedChurch={highlightedChurch}
          />
        </div>
      </div>

      <ChurchDetailModal
        church={selectedChurch}
        onClose={() => {
          setSelectedChurch(null);
          setHighlightedChurch(null);
        }}
      />
    </div>
  );
};
