export enum AppView {
  HOME = 'HOME',
  APPLY = 'APPLY',
  ADMIN = 'ADMIN',
  MAP = 'MAP',
  CHURCH_DASHBOARD = 'CHURCH_DASHBOARD',
  CHURCH_LOGIN = 'CHURCH_LOGIN'
}

export enum ApplicationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export interface ChurchAddress {
  country: string;
  street: string;
  aptUnit?: string;
  city: string;
  state: string;
  postalCode: string;
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
  lastPaymentDate?: string;
  nextDueDate?: string;

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
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export type EmailType = 'application_received' | 'application_approved' | 'application_rejected' | 'dues_reminder_30' | 'dues_reminder_7' | 'dues_reminder_0' | 'dues_delinquent';

export interface EmailTemplate {
  subject: string;
  body: string;
  type: EmailType;
}
