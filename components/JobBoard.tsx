import React, { useState, useEffect } from 'react';
import { JobListing } from '../types';
import { MapPin, Briefcase, Calendar, Search, X, Loader2, Church, ArrowLeft } from 'lucide-react'; // Added ArrowLeft
import { subscribeToActiveJobs } from '../services/firebase';
import { Button } from './Button';

interface JobBoardProps {
  onJobClick: (jobId: string) => void;
  onApplyClick: (jobId: string) => void;
  onBack: () => void;
  onChurchClick: (churchId: string) => void;
}

export const JobBoard: React.FC<JobBoardProps> = ({ onJobClick, onApplyClick, onBack, onChurchClick }) => {
  const [allJobs, setAllJobs] = useState<JobListing[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeywords, setSearchKeywords] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [jobTypeFilter, setJobTypeFilter] = useState('');
  const [datePostedFilter, setDatePostedFilter] = useState(''); // e.g., '24h', '7d', '30d'
  const [sortBy, setSortBy] = useState<'datePosted' | 'title'>('datePosted');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const categories = ["Lead Pastor", "Associate Pastor", "Worship", "Admin", "Missions", "Other"];
  const jobTypes = ['Full Time', 'Part Time', 'Internship', 'Temporary', 'Volunteer'];
  const dateFilters = [
    { label: 'Last 24 hours', value: '24h' },
    { label: 'Last 7 days', value: '7d' },
    { label: 'Last 30 days', value: '30d' },
    { label: 'All Time', value: '' },
  ];

  useEffect(() => {
    const unsubscribe = subscribeToActiveJobs((jobs) => {
      setAllJobs(jobs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let tempJobs = [...allJobs];

    // Filter by keywords
    if (searchKeywords) {
      const keywords = searchKeywords.toLowerCase().split(' ').filter(Boolean);
      tempJobs = tempJobs.filter(job =>
        keywords.every(keyword =>
          job.title.toLowerCase().includes(keyword) ||
          job.description.toLowerCase().includes(keyword) ||
          job.churchName.toLowerCase().includes(keyword) ||
          job.location.toLowerCase().includes(keyword) ||
          (job.requirements?.toLowerCase().includes(keyword))
        )
      );
    }

    // Filter by location
    if (locationFilter) {
      const filter = locationFilter.toLowerCase();
      tempJobs = tempJobs.filter(job => job.location.toLowerCase().includes(filter));
    }

    // Filter by category
    if (categoryFilter) {
      tempJobs = tempJobs.filter(job => job.category === categoryFilter);
    }

    // Filter by job type
    if (jobTypeFilter) {
      tempJobs = tempJobs.filter(job => job.jobType === jobTypeFilter);
    }

    // Filter by date posted
    if (datePostedFilter) {
      const now = new Date();
      tempJobs = tempJobs.filter(job => {
        const postDate = new Date(job.datePosted);
        const diffTime = Math.abs(now.getTime() - postDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (datePostedFilter === '24h') return diffDays <= 1;
        if (datePostedFilter === '7d') return diffDays <= 7;
        if (datePostedFilter === '30d') return diffDays <= 30;
        return true;
      });
    }

    // Sort
    tempJobs.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'datePosted') {
        comparison = new Date(a.datePosted).getTime() - new Date(b.datePosted).getTime();
      } else if (sortBy === 'title') {
        comparison = a.title.localeCompare(b.title);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    setFilteredJobs(tempJobs);
  }, [allJobs, searchKeywords, locationFilter, categoryFilter, jobTypeFilter, datePostedFilter, sortBy, sortOrder]);

  const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-slate-700" />
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Job Board</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1 bg-white p-6 rounded-lg shadow-md space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Filters</h2>

            {/* Search by Keywords */}
            <div>
              <label htmlFor="keywords" className="block text-sm font-medium text-gray-700 mb-2">Search by Keywords</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  id="keywords"
                  placeholder="Job title, keywords..."
                  value={searchKeywords}
                  onChange={(e) => setSearchKeywords(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Location */}
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">Location</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  id="location"
                  placeholder="City or postcode"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <select
                id="category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Job Type */}
            <div>
              <label htmlFor="jobType" className="block text-sm font-medium text-gray-700 mb-2">Job Type</label>
              <select
                id="jobType"
                value={jobTypeFilter}
                onChange={(e) => setJobTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white"
              >
                <option value="">All Job Types</option>
                {jobTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Date Posted */}
            <div>
              <label htmlFor="datePosted" className="block text-sm font-medium text-gray-700 mb-2">Date Posted</label>
              <select
                id="datePosted"
                value={datePostedFilter}
                onChange={(e) => setDatePostedFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white"
              >
                {dateFilters.map(filter => (
                  <option key={filter.value} value={filter.value}>{filter.label}</option>
                ))}
              </select>
            </div>

            {/* Clear Filters */}
            {(searchKeywords || locationFilter || categoryFilter || jobTypeFilter || datePostedFilter) && (
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchKeywords('');
                  setLocationFilter('');
                  setCategoryFilter('');
                  setJobTypeFilter('');
                  setDatePostedFilter('');
                }}
                className="w-full mt-4"
              >
                Clear All Filters
              </Button>
            )}
          </div>

          {/* Job Listings */}
          <div className="lg:col-span-3">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Showing {filteredJobs.length} of {allJobs.length} results
              </h2>
              <div className="flex items-center gap-2">
                <label htmlFor="sortBy" className="text-sm text-gray-700">Sort by:</label>
                <select
                  id="sortBy"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white"
                >
                  <option value="datePosted">Date Posted</option>
                  <option value="title">Job Title</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {filteredJobs.length === 0 ? (
                <div className="bg-white p-12 rounded-lg shadow-md text-center text-gray-500">
                  <Briefcase className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  No jobs found matching your criteria.
                </div>
              ) : (
                filteredJobs.map(job => (
                  <div key={job.id} className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200">
                    <div className="p-6 flex items-start gap-4">
                      <div onClick={() => onChurchClick(job.churchId)} className="cursor-pointer">
                        {job.churchLogoUrl ? (
                          <img src={job.churchLogoUrl} alt={job.churchName} className="w-16 h-16 rounded-full object-cover border border-gray-200 flex-shrink-0" />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center text-gray-500 flex-shrink-0">
                            <Church className="w-8 h-8" />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 mb-1 cursor-pointer hover:text-blue-600" onClick={() => onJobClick(job.id)}>{job.title}</h3>
                        <p className="text-blue-600 font-medium mb-2 cursor-pointer hover:underline" onClick={() => onChurchClick(job.churchId)}>{job.churchName}</p>
                        <div className="flex items-center text-gray-600 text-sm mb-2 gap-4">
                          <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {job.location}</span>
                          <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {job.jobType}</span>
                          <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {getTimeAgo(job.datePosted)}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-4">
                          <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">{job.category}</span>
                          {job.experienceLevel && <span className="px-3 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">{job.experienceLevel}</span>}
                          {job.salary && <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">{job.salary}</span>}
                        </div>
                        <p className="text-gray-700 line-clamp-3">{job.description}</p>
                        <div className="mt-4 flex gap-3">
                          <Button onClick={() => onJobClick(job.id)} variant="outline">View Details</Button>
                          <Button onClick={() => onApplyClick(job.id)}>Apply Now</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
