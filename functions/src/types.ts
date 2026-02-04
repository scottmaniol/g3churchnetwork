export enum AppView {
  HOME = 'HOME',
  APPLY = 'APPLY',
  ADMIN = 'ADMIN',
  MAP = 'MAP',
  CHURCH_DASHBOARD = 'CHURCH_DASHBOARD',
  CHURCH_LOGIN = 'CHURCH_LOGIN',
  JOB_BOARD = 'JOB_BOARD',
  JOB_DETAIL = 'JOB_DETAIL'
}

export enum ApplicationStatus {
  PENDING = 'PENDING',
  PROVISIONAL_APPROVED = 'PROVISIONAL_APPROVED', // Approved but awaiting payment
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  DELINQUENT = 'DELINQUENT'
}

export interface ChurchAddress {
  country: string;
  street: string;
  aptUnit?: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface JobListing {
  id: string;
  churchId: string;
  churchName: string;
  title: string;
  category: string; // "Lead Pastor", "Associate Pastor", "Music", "Admin", "Other"
  jobType: 'Full Time' | 'Part Time' | 'Internship' | 'Temporary' | 'Volunteer';
  location: string; // City, State (from church address)
  description: string;
  requirements?: string;
  salary?: string;
  experienceLevel?: string; // e.g., "Entry Level", "Mid Level", "Senior Level"
  datePosted: string; // ISO string
  expirationDate?: string; // ISO string
  status: 'active' | 'closed';
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  churchLogoUrl?: string; // To display church logo on job board
}

export interface JobApplication {
  id: string;
  jobId: string;
  jobTitle: string;
  churchId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  message: string;
  resumeUrl?: string; // URL to uploaded resume
  appliedAt: string; // ISO string
  status: 'new' | 'reviewed' | 'contacted';
}

export interface ChurchLeader {
  id: string;
  firstName: string;
  lastName: string;
  role: 'Elder' | 'Pastor' | 'Deacon' | 'Other';
  email: string;
  phone: string;
}

export interface ChurchGathering {
  id: string;
  name: string;
  day: 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
  startTime: string; // Format: "HH:MM AM/PM"
  endTime: string;
}

export interface ChurchConnections {
  website?: string;
  facebook?: string;
  x?: string; // Twitter/X
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  vimeo?: string;
  sermons?: string; // Generic sermons link
  spotify?: string;
  applePodcasts?: string;
  googlePodcasts?: string;
  amazon?: string;
  sermonaudio?: string;
  sermonaudioApiKey?: string;
}

export interface ChurchApplication {
  id: string; // Firestore ID

  // Applicant Info (Primary Contact)
  applicantFirstName: string;
  applicantLastName: string;
  applicantEmail: string;
  applicantPassword?: string; // Hashed password for church login

  // Church Info
  churchName: string;
  churchAddress: ChurchAddress;
  churchPhone: string;
  churchEmail: string; // For map and public contact
  churchDescription: string;

  // Leadership (replaces otherElders)
  leaders: ChurchLeader[];

  // Schedule
  gatherings: ChurchGathering[];

  // Connections
  connections: ChurchConnections;

  // Payment Info
  paymentAmount?: number; // Minimum 500
  paymentFrequency?: 'yearly' | 'one_time';
  stripeCustomerId?: string;
  stripePaymentMethodId?: string;
  stripeSubscriptionId?: string; // Added to track Stripe subscription ID
  lastPaymentDate?: string;
  nextDueDate?: string;
  promoCodeUsed?: string;

  // Doctrinal Info
  pluralityOfElders: 'Yes' | 'No' | 'No, but working toward it.' | '';
  churchDiscipline: 'Yes' | 'No' | 'No, but working toward it.' | '';
  ssjgSigned: 'Yes' | 'No' | 'No, but agree with it' | '';
  confessionAffirmation: string; // 1689 LBC explanation

  // System Fields
  status: ApplicationStatus;
  submittedAt: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  userId?: string; // Firebase Auth UID for church login
  churchLogoUrl?: string; // URL to uploaded logo
  jobListings?: JobListing[]; // Array of job listings for this church
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export type EmailType = 'application_received' | 'admin_application_notification' | 'application_provisional_approved' | 'application_approved' | 'application_fully_approved' | 'application_rejected' | 'dues_reminder_30' | 'dues_reminder_7' | 'dues_reminder_0' | 'dues_delinquent' | 'portal_account_setup';

export interface EmailTemplate {
  subject: string;
  body: string;
  type: EmailType;
}

// User Profile for Firebase Auth Users (Admins and Church Users)
export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: 'admin' | 'church_user' | 'user'; // Define roles
  churchId?: string; // If role is 'church_user', link to church application
}

// Admin User for display in Admin Dashboard (extended from UserProfile)
export interface AdminUser extends UserProfile {
  creationTime?: string;
  lastSignInTime?: string;
  disabled: boolean;
}

// Church Statistics for tracking interactions
export interface ChurchStatistics {
  churchId: string;
  visits: number;      // Website button clicks
  contacts: number;    // Contact form submissions
  views: number;       // Profile modal opens
  lastUpdated: string;
  // Aggregated statistics for analytics
  total?: {
    views: number;
    contacts: number;
    visits: number;
    socialClicks: number;
  };
  last30Days?: {
    views: number;
    contacts: number;
    visits: number;
    socialClicks: number;
  };
  last7Days?: {
    views: number;
    contacts: number;
    visits: number;
    socialClicks: number;
  };
  socialBreakdown?: {
    [platform: string]: number;
  };
  lastActivity?: string;
}

// Contact Form Data
export interface ContactFormData {
  senderName: string;
  senderEmail: string;
  message: string;
}

// Detailed Event Tracking Types
export type EventType = 'view' | 'contact' | 'visit' | 'email_sent' | 'email_opened' | 'email_clicked' | 'social_click';

export interface ChurchEvent {
  id: string;
  churchId: string;
  type: EventType;
  timestamp: string;
  metadata?: {
    source?: string;        // e.g., 'map', 'list', 'search'
    platform?: string;      // e.g., 'facebook', 'website', 'instagram'
    emailType?: EmailType;  // For email events
    referrer?: string;
  };
}

// Aggregated statistics with time periods
export interface ChurchAnalytics {
  churchId: string;
  churchName: string;
  total: {
    views: number;
    contacts: number;
    visits: number;
    socialClicks: number;
  };
  last30Days: {
    views: number;
    contacts: number;
    visits: number;
    socialClicks: number;
  };
  last7Days: {
    views: number;
    contacts: number;
    visits: number;
    socialClicks: number;
  };
  topSocialPlatform?: string;
  lastActivity?: string;
}

// Time-series data point for charts
export interface TimeSeriesDataPoint {
  date: string;  // YYYY-MM-DD format
  views: number;
  contacts: number;
  visits: number;
}

// Geographic distribution
export interface GeographicStats {
  country: string;
  state?: string;
  churchCount: number;
  totalViews: number;
  totalContacts: number;
}
