import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { Resend } from "resend";
import Stripe from "stripe";
import * as dotenv from "dotenv";
import axios from "axios";

dotenv.config();

admin.initializeApp();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

// HARDCODED FOR DEBUGGING - The .env file might not be loading in the deployed environment
const resend = new Resend(process.env.RESEND_API_KEY || "");

// Helper to split array into chunks
const chunkArray = (arr: any[], size: number) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

// Helper function to check if user is admin based on custom claim
function isAdmin(context: any): boolean {
  return context.auth != null && context.auth.token.admin === true;
}

const SYSTEM_SENDER = "G3 Church Network <admin@g3min.org>";

interface JobApplicationData {
  jobId: string;
  jobTitle: string;
  churchId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  message: string;
  resumeUrl?: string;
  appliedAt: string;
  status: 'new' | 'reviewed' | 'contacted';
}

interface JobListingData {
  id: string;
  churchId: string;
  churchName: string;
  title: string;
  category: string;
  jobType: string;
  location: string;
  description: string;
  requirements?: string;
  salary?: string;
  experienceLevel?: string;
  datePosted: string;
  expirationDate?: string;
  status: 'active' | 'closed';
  createdAt: string;
  updatedAt: string;
  churchLogoUrl?: string;
}

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------

const DATABASE_ID = 'g3network';
const db = getFirestore(admin.app(), DATABASE_ID);

const CHURCH_LOGIN_URL = 'https://g3-church-network.web.app/church-login';

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

interface EmailTemplate {
  subject: string;
  body: string;
  type: string;
}

const DEFAULT_TEMPLATES: Record<string, EmailTemplate> = {
  application_received: {
    type: 'application_received',
    subject: 'Application Received - G3 Church Network',
    body: '<p>Dear {{applicantName}},</p><p>Thank-you for submitting your application for <strong>{{churchName}}</strong> to join the G3 Church Network. We have received your application and will begin the review process shortly.</p><p>We will notify you once a decision has been made.</p><p>You can track your application status here: <a href="' + CHURCH_LOGIN_URL + '">Church Portal Login</a></p><p>Grace and peace,<br>G3 Church Network Team</p>'
  },
  application_approved: {
    type: 'application_approved',
    subject: 'Welcome to G3 Church Network!',
    body: '<p>Dear {{applicantName}},</p><p>We are pleased to inform you that your application for <strong>{{churchName}}</strong> has been <strong>approved</strong>!</p><p>Your church is now listed on our network map. You can log in to your church dashboard to manage your profile.</p><p>You can access your church portal here: <a href="' + CHURCH_LOGIN_URL + '">Church Portal Login</a></p><p>Welcome to the network!</p><p>Grace and peace,<br>G3 Church Network Team</p>'
  },
  application_rejected: {
    type: 'application_rejected',
    subject: 'Update on your G3 Church Network Application',
    body: '<p>Dear {{applicantName}},</p><p>Thank-you for your interest in the G3 Church Network.</p><p>After careful review of your application for <strong>{{churchName}}</strong>, we are unable to accept your application at this time.</p><p>If you have any questions, please feel free to reply to this email.</p><p>You can view your application status here: <a href="' + CHURCH_LOGIN_URL + '">Church Portal Login</a></p><p>Grace and peace,<br>G3 Church Network Team</p>'
  },
  dues_reminder_30: {
    type: 'dues_reminder_30',
    subject: 'G3 Network Dues - Renewal Reminder (30 Days)',
    body: '<p>Dear {{applicantName}},</p><p>This is a reminder that your G3 Church Network annual dues for <strong>{{churchName}}</strong> will be due in 30 days.</p><p>Please <a href="' + CHURCH_LOGIN_URL + '">log in to your dashboard</a> to renew your membership.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
  },
  dues_reminder_7: {
    type: 'dues_reminder_7',
    subject: 'G3 Network Dues - Renewal Reminder (1 Week)',
    body: '<p>Dear {{applicantName}},</p><p>This is a reminder that your G3 Church Network annual dues for <strong>{{churchName}}</strong> will be due in 7 days.</p><p>Please <a href="' + CHURCH_LOGIN_URL + '">log in to your dashboard</a> to renew your membership to ensure uninterrupted access.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
  },
  dues_reminder_0: {
    type: 'dues_reminder_0',
    subject: 'G3 Network Dues - Due Today',
    body: '<p>Dear {{applicantName}},</p><p>Your G3 Church Network annual dues for <strong>{{churchName}}</strong> are due today.</p><p>Please <a href="' + CHURCH_LOGIN_URL + '">log in to your dashboard</a> immediately to renew your membership.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
  },
  dues_delinquent: {
    type: 'dues_delinquent',
    subject: 'Action Required: G3 Network Membership Delinquent',
    body: '<p>Dear {{applicantName}},</p><p>We have not received your annual dues payment for <strong>{{churchName}}</strong>. Your membership is now delinquent.</p><p>As per our policy, your church has been temporarily hidden from the network map.</p><p>Please <a href="' + CHURCH_LOGIN_URL + '">pay your dues immediately via the dashboard</a> to restore your active status.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
  },
  portal_account_setup: {
    type: 'portal_account_setup',
    subject: 'Set Up Your G3 Church Network Portal Account',
    body: '<p>Dear {{applicantName}},</p><p>A portal account has been created for <strong>{{churchName}}</strong> in the G3 Church Network.</p><p>To set your password and access your church\'s profile, please click the link below:</p><p><a href="{{resetLink}}">Set Your Password for the Church Portal</a></p><p>This link is valid for a limited time. If you do not set your password within 24 hours, you may use the "Forgot Password" link on the login page.</p><p>You can log in here: <a href="' + CHURCH_LOGIN_URL + '">Church Portal Login</a></p><p>Grace and peace,<br>G3 Church Network Team</p>'
  },
  job_application_received: {
    type: 'job_application_received',
    subject: 'New Job Application Received for "{{jobTitle}}"',
    body: '<p>Dear {{churchName}} Team,</p><p>You have received a new application for your job listing: <strong>"{{jobTitle}}"</strong> on the G3 Church Network Job Board!</p><p><strong>Applicant Name:</strong> {{applicantName}}</p><p><strong>Applicant Email:</strong> <a href="mailto:{{applicantEmail}}">{{applicantEmail}}</a></p><p><strong>Applicant Phone:</strong> {{applicantPhone}}</p><p><strong>Message:</strong></p><p>{{message}}</p>{{resumeLink}}<p>Please log in to your <a href="' + CHURCH_LOGIN_URL + '">Church Portal</a> to review this application and manage your job listings.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
  }
};

const getTemplate = async (type: string): Promise<EmailTemplate> => {
  try {
    const doc = await db.collection('settings').doc(`email_template_${type}`).get();
    if (doc.exists) {
      return doc.data() as EmailTemplate;
    }
  } catch (error) {
    console.warn(`Failed to fetch template ${type}, using default.`, error);
  }
  return DEFAULT_TEMPLATES[type] || { subject: 'Notification', body: 'No content', type };
};

const replaceVariables = (text: string, application: any) => {
  let result = text;
    result = result.replace(/\{\{applicantName\}\}/g, `${application.applicantFirstName || application.applicantName}`); // For job applications, applicantName is direct
    result = result.replace(/\{\{churchName\}\}/g, application.churchName || application.churchNameFromJob || 'Your Church');
    if (application.jobTitle) {
      result = result.replace(/\{\{jobTitle\}\}/g, application.jobTitle);
    }
    if (application.applicantEmailForJob) { // Specific to job applications
      result = result.replace(/\{\{applicantEmail\}\}/g, application.applicantEmailForJob);
    }
    if (application.applicantPhone) { // Specific to job applications
      result = result.replace(/\{\{applicantPhone\}\}/g, application.applicantPhone);
    }
    if (application.message) { // Specific to job applications
      result = result.replace(/\{\{message\}\}/g, application.message.replace(/\n/g, '<br>'));
    }
    if (application.resumeLink) { // Specific to job applications
      result = result.replace(/\{\{resumeLink\}\}/g, `<p><strong>Resume:</strong> <a href="${application.resumeLink}">Download Resume</a></p>`);
    } else {
      result = result.replace(/\{\{resumeLink\}\}/g, ''); // Remove if no resume
    }
    if (application.resetLink) {
        result = result.replace(/\{\{resetLink\}\}/g, application.resetLink);
    }
    return result;
};

const sendEmailBatch = async (recipients: string[], subject: string, html: string, from?: string) => {
  const senderEmail = from || SYSTEM_SENDER; 

  try {
    // Resend Batch API allows up to 100 emails per request.
    const BATCH_SIZE = 100;
    const recipientChunks = chunkArray(recipients, BATCH_SIZE);
    
    const results = [];

    for (const chunk of recipientChunks) {
      const payload = chunk.map((email: string) => {
        // Wrap content in branded template
        const brandedHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f9fafb; }
                .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
                .header { text-align: center; padding: 30px 20px; border-bottom: 1px solid #eaeaea; background-color: #ffffff; }
                .logo { max-width: 450px; height: auto; } /* Increased from 200px to 450px (75% of 600px container) */
                .content { padding: 40px 30px; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #888; background-color: #f9fafb; border-top: 1px solid #eaeaea; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <img src="https://firebasestorage.googleapis.com/v0/b/g3-church-network.firebasestorage.app/o/images%2Fg3_logo.png?alt=media" alt="G3 Church Network" class="logo">
                </div>
                <div class="content">
                  ${html}
                </div>
                <div class="footer">
                  <p>© ${new Date().getFullYear()} G3 Ministries. All rights reserved.</p>
                  <p>G3 Church Network</p>
                </div>
              </div>
            </body>
          </html>
        `;

        return {
          from: senderEmail,
          to: email,
          subject: subject,
          html: brandedHtml,
        };
      });

      const { data, error } = await resend.batch.send(payload);
      
      if (error) {
        console.error("Resend Batch Error:", error);
        results.push({ success: false, error });
      } else {
        results.push({ success: true, data });
      }
    }

    const allFailed = results.every(r => !r.success);
    if (allFailed && results.length > 0) {
       const firstError = results[0]?.error?.message || "Unknown Resend Error";
       throw new Error(`Resend Error: ${firstError}`);
    }

    return { success: true, results };

  } catch (error: any) {
    console.error("Error sending email:", error);
    // Ensure we throw an Error object with a message
    throw new Error(error.message || JSON.stringify(error) || "Unknown sending error");
  }
};

// ------------------------------------------------------------------
// CLOUD FUNCTIONS (v2)
// ------------------------------------------------------------------

export const createStripeSetupIntent = onCall({ cors: true }, async (request) => {
  const { email, name } = request.data;

  try {
    // 1. Create a Customer
    const customer = await stripe.customers.create({
      email,
      name,
    });

    // 2. Create a SetupIntent
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ['card'],
    });

    return {
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
    };
  } catch (error: any) {
    console.error("Error creating SetupIntent:", error);
    throw new HttpsError("internal", error.message);
  }
});

export const verifyPromoCode = onRequest((req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Max-Age', '3600');
    res.status(204).send('');
    return;
  }

  // Parse body for onCall style or direct JSON
  let code = req.body.data?.code || req.body.code;

  if (!code) {
    res.status(400).send({ data: { error: "Promo code is required." } });
    return;
  }

  const promoCodeRef = db.collection('promoCodes').doc(code);
  
  promoCodeRef.get()
    .then(doc => {
      if (doc.exists) {
        res.status(200).send({ data: { valid: true } });
      } else {
        res.status(200).send({ data: { valid: false } });
      }
    })
    .catch(error => {
      console.error("Error verifying promo code:", error);
      res.status(500).send({ data: { error: "Internal server error." } });
    });
});

// TRIGGER: On Job Application Created
export const onJobApplicationCreated = onDocumentCreated({
    document: "jobApplications/{id}",
    database: DATABASE_ID
  }, async (event) => {
    const snap = event.data;
    if (!snap) return;
    
    const jobApplication = snap.data() as JobApplicationData;
    const jobApplicationId = snap.id;
    if (!jobApplication) return;

    try {
      // 1. Get Job Listing details
      const jobDoc = await db.collection('jobListings').doc(jobApplication.jobId).get();
      if (!jobDoc.exists) {
        console.error(`Job listing ${jobApplication.jobId} not found for application ${jobApplicationId}`);
        return;
      }
      const jobListing = jobDoc.data() as JobListingData;

      // 2. Get Church Application details (to get church email)
      const churchDoc = await db.collection('applications').doc(jobApplication.churchId).get();
      if (!churchDoc.exists) {
        console.error(`Church application ${jobApplication.churchId} not found for job application ${jobApplicationId}`);
        return;
      }
      const church = churchDoc.data();

      if (!church || !church.churchEmail) {
        console.error(`Church ${jobApplication.churchId} has no public email to send notification.`);
        return;
      }

      // 3. Send "job application received" email to the church
      const template = await getTemplate('job_application_received');
      
      const emailData = {
        churchName: church.churchName,
        jobTitle: jobListing.title,
        applicantName: jobApplication.applicantName,
        applicantEmailForJob: jobApplication.applicantEmail, // Use a distinct name to avoid conflict with application.applicantEmail
        applicantPhone: jobApplication.applicantPhone,
        message: jobApplication.message,
        resumeLink: jobApplication.resumeUrl,
      };

      const subject = replaceVariables(template.subject, emailData);
      const body = replaceVariables(template.body, emailData);

      await sendEmailBatch([church.churchEmail], subject, body, SYSTEM_SENDER);
      console.log(`Sent 'job_application_received' email to ${church.churchName} (${church.churchEmail}) for job "${jobListing.title}"`);

    } catch (error) {
      console.error(`Error processing onJobApplicationCreated for application ${jobApplicationId}:`, error);
    }
  });

// ------------------------------------------------------------------
// ADMIN USER MANAGEMENT FUNCTIONS
// ------------------------------------------------------------------

export const createStripeBillingPortalSession = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const { customerId, returnUrl } = request.data;

  if (!customerId) {
    throw new HttpsError("invalid-argument", "customerId is required.");
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || 'https://g3-church-network.web.app/church-login',
    });

    return {
      url: session.url,
    };
  } catch (error: any) {
    console.error("Error creating billing portal session:", error);
    throw new HttpsError("internal", error.message);
  }
});

import { getAuth } from 'firebase-admin/auth';

export const createChurchUserAndSendResetEmail = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const { churchId, applicantEmail } = request.data;

  if (!churchId || !applicantEmail) {
    throw new HttpsError("invalid-argument", "churchId and applicantEmail are required.");
  }

  const authAdmin = getAuth(admin.app());

  try {
    const docRef = db.collection('applications').doc(churchId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new HttpsError("not-found", "Church application not found.");
    }

    const application = docSnap.data();
    if (!application) {
      throw new HttpsError("not-found", "No data for application.");
    }

    let firebaseUser;
    try {
      firebaseUser = await authAdmin.getUserByEmail(applicantEmail);
      console.log(`User already exists for ${applicantEmail}.`);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        // User does not exist, create new one
        firebaseUser = await authAdmin.createUser({
          email: applicantEmail,
          emailVerified: false,
          disabled: false,
        });
        console.log(`Created new Firebase user for ${applicantEmail} with UID: ${firebaseUser.uid}`);
      } else {
        throw error;
      }
    }

    // Update the Firestore application with the userId if not already set
    if (!application.userId || application.userId !== firebaseUser.uid) {
      await docRef.update({ userId: firebaseUser.uid });
      console.log(`Updated Firestore application ${churchId} with userId: ${firebaseUser.uid}`);
    }

    // Generate password reset link with continue URL to redirect to church portal login
    const link = await authAdmin.generatePasswordResetLink(applicantEmail, {
      url: CHURCH_LOGIN_URL
    });
    console.log(`Generated password reset link for ${applicantEmail} with continue URL: ${link}`);

    // Send the password setup email
    const template = await getTemplate('portal_account_setup');
    const subject = replaceVariables(template.subject, application);
    const body = replaceVariables(template.body, { ...application, resetLink: link }); // Pass resetLink as part of application data

    await sendEmailBatch([applicantEmail], subject, body, SYSTEM_SENDER);
    console.log(`Sent 'portal_account_setup' email to ${applicantEmail}`);
    return { success: true, message: "Portal account created and password reset email sent.", uid: firebaseUser.uid }; // Return UID on success

  } catch (error: any) {
    console.error("Error in createChurchUserAndSendResetEmail:", error);
    throw new HttpsError("internal", error.message);
  }
});

/**
 * Safely converts a date-like value to an ISO string.
 * Returns null if the value cannot be converted to a valid date.
 */
const toSafeISOString = (dateValue: any): string | null => {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  return isNaN(date.getTime()) ? null : date.toISOString();
};

export const approveApplication = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const { applicationId } = request.data;
  if (!applicationId) {
    throw new HttpsError("invalid-argument", "Application ID is required.");
  }

  try {
    // 1. Get the application
    const docRef = db.collection('applications').doc(applicationId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      throw new HttpsError("not-found", "Application not found.");
    }
    
    const appData = docSnap.data();
    if (!appData) throw new HttpsError("not-found", "No data.");

    // Check if already approved
    if (appData.status === 'APPROVED') {
       return { success: true, message: "Already approved." };
    }

    // 2. Process Payment (if payment info exists)
    let paymentStatus = "No Payment Info";
    let nextDueDate: string | null = null;
    let lastPaymentDate: string | null = null;
    let subscriptionId = null;

    if (appData.stripeCustomerId && appData.stripePaymentMethodId && appData.paymentAmount) {
       const amountInCents = Math.round(appData.paymentAmount * 100);
       
       if (appData.paymentFrequency === 'yearly') {
          // Create a Product and Price for this subscription (or reuse if we had standard pricing)
          // Since amount is variable (min $500), we create a Price for this specific church
          const price = await stripe.prices.create({
            currency: 'usd',
            unit_amount: amountInCents,
            recurring: {
              interval: 'year',
            },
            product_data: {
              name: 'G3 Network Annual Dues',
            },
          });

          // Create a Subscription
          const subscription = await stripe.subscriptions.create({
            customer: appData.stripeCustomerId,
            default_payment_method: appData.stripePaymentMethodId,
            items: [{
              price: price.id,
            }],
            expand: ['latest_invoice.payment_intent'],
          });
          
          subscriptionId = subscription.id;
          paymentStatus = subscription.status; // 'active', 'incomplete', etc.
          
          if (paymentStatus === 'active') {
             lastPaymentDate = toSafeISOString(new Date());
             nextDueDate = toSafeISOString(new Date((subscription as any).current_period_end * 1000));
          }

       } else {
          // One-time Payment
          const paymentIntent = await stripe.paymentIntents.create({
             amount: amountInCents,
             currency: 'usd',
             customer: appData.stripeCustomerId,
             payment_method: appData.stripePaymentMethodId,
             off_session: true,
             confirm: true,
             description: "G3 Network Dues (One-time)",
             return_url: 'https://g3churchnetwork.com', // Placeholder
          });
          
          if (paymentIntent.status === 'succeeded') {
             paymentStatus = 'succeeded';
             lastPaymentDate = toSafeISOString(new Date());
             // Set next due date to 1 year from now
             const nextDate = new Date();
             nextDate.setFullYear(nextDate.getFullYear() + 1);
             nextDueDate = toSafeISOString(nextDate);
          } else {
             throw new HttpsError("aborted", `Payment failed with status: ${paymentIntent.status}`);
          }
       }
    }

    // 3. Update Application Status
    // If no payment info or payment was not a subscription, calculate nextDueDate as 1 year from lastPaymentDate
    if (!nextDueDate && lastPaymentDate) {
       const lastPayDateObj = new Date(lastPaymentDate);
       lastPayDateObj.setFullYear(lastPayDateObj.getFullYear() + 1);
       nextDueDate = toSafeISOString(lastPayDateObj);
    } else if (!nextDueDate) {
       // If no lastPaymentDate (e.g., first free approval), set next due date to 1 year from now
       const nextDate = new Date();
       nextDate.setFullYear(nextDate.getFullYear() + 1);
       nextDueDate = toSafeISOString(nextDate);
    }

    await docRef.update({
      status: 'APPROVED',
      lastPaymentDate,
      nextDueDate,
      stripeSubscriptionId: subscriptionId,
      updatedAt: toSafeISOString(new Date())
    });

    return { success: true, paymentStatus };

  } catch (error: any) {
    console.error("Error approving application:", error);
    throw new HttpsError("internal", error.message);
  }
});

// Scheduled Function: Daily Check for Dues and Reminders
export const checkDuesAndReminders = onSchedule("every 24 hours", async (event) => {
  const now = new Date(); // This is a new Date object, always valid.
  
  try {
    const snapshot = await db.collection('applications')
      .where('status', 'in', ['APPROVED', 'DELINQUENT'])
      .get();

    for (const doc of snapshot.docs) {
       const data = doc.data();
       if (!data.nextDueDate) continue;

       // Ensure nextDueDate is a valid date before using it
       const dueDate = new Date(data.nextDueDate);
       if (isNaN(dueDate.getTime())) {
          console.warn(`Invalid nextDueDate found for doc ${doc.id}: ${data.nextDueDate}. Skipping reminder/delinquency check.`);
          continue; // Skip this document if date is invalid
       }

       const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
       
       // Handling Reminders for Manual Payers (One-time)
       // Recurring subscriptions are handled by Stripe's own email system usually, 
       // but we can add redundant reminders if needed. 
       // For now, focusing on manual or if subscription failed/canceled.
       
       // If subscription is active, Stripe handles billing. 
       // If manual (one_time), we need to remind them.
       const isManual = data.paymentFrequency === 'one_time' || !data.paymentFrequency;

       if (isManual && data.status === 'APPROVED') {
          let templateType = '';
          if (daysUntilDue === 30) templateType = 'dues_reminder_30';
          else if (daysUntilDue === 7) templateType = 'dues_reminder_7';
          else if (daysUntilDue === 0) templateType = 'dues_reminder_0';
          
          if (templateType) {
             console.log(`[Reminder] Sending ${templateType} to ${data.churchName}`);
             const template = await getTemplate(templateType);
             const subject = replaceVariables(template.subject, data);
             const body = replaceVariables(template.body, data);
             await sendEmailBatch([data.applicantEmail], subject, body, SYSTEM_SENDER);
          }
       }

       // Handling Delinquency
       if (daysUntilDue < 0) {
          // It's overdue.
          // If status is still APPROVED, mark DELINQUENT
          if (data.status === 'APPROVED') {
             await doc.ref.update({ status: 'DELINQUENT' });
             console.log(`[Delinquency] Marked ${data.churchName} as DELINQUENT`);
             
             // Send first delinquent email
             const template = await getTemplate('dues_delinquent');
             const subject = replaceVariables(template.subject, data);
             const body = replaceVariables(template.body, data);
             await sendEmailBatch([data.applicantEmail], subject, body, SYSTEM_SENDER);
          }
          
          // Send Weekly Delinquent Reminder (if not just sent above)
          // Logic: If delinquent for > 0 days and it's a weekly cycle
          if (data.status === 'DELINQUENT' && Math.abs(daysUntilDue) % 7 === 0) {
             console.log(`[Delinquency] Sending weekly reminder to ${data.churchName}`);
             const template = await getTemplate('dues_delinquent');
             const subject = replaceVariables(template.subject, data);
             const body = replaceVariables(template.body, data);
             await sendEmailBatch([data.applicantEmail], subject, body, SYSTEM_SENDER);
          }
       }
    }
  } catch (error) {
    console.error("Error in checkDuesAndReminders:", error);
  }
});

export const sendEmailV2 = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const { recipients, subject, html, from } = request.data;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    throw new HttpsError("invalid-argument", "Recipients must be a non-empty array.");
  }

  if (!subject || !html) {
    throw new HttpsError("invalid-argument", "Subject and content are required.");
  }

  try {
    return await sendEmailBatch(recipients, subject, html, from);
  } catch (error: any) {
    console.error("sendEmail failed:", error);
    throw new HttpsError("internal", `Email failed: ${error.message}`);
  }
});

export const resendSystemEmailV2 = onCall({ cors: true }, async (request) => {
  // 1. Auth Check
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const { churchId, type } = request.data;

  if (!churchId || !type) {
    throw new HttpsError("invalid-argument", "churchId and type are required.");
  }

  try {
    const appDoc = await db.collection('applications').doc(churchId).get();
    if (!appDoc.exists) {
      throw new HttpsError("not-found", "Church application not found.");
    }
    const application = appDoc.data();
    
    if (!application || !application.applicantEmail) {
      throw new HttpsError("failed-precondition", "Application has no email.");
    }

    const template = await getTemplate(type);
    const subject = replaceVariables(template.subject, application);
    const body = replaceVariables(template.body, application);

    console.log(`Attempting to resend ${type} email to ${application.applicantEmail} from ${SYSTEM_SENDER}`);
    return await sendEmailBatch([application.applicantEmail], subject, body, SYSTEM_SENDER);

  } catch (error: any) {
    console.error("resendSystemEmail failed:", error);
    // Return the actual error message to the client
    throw new HttpsError("unknown", `Resend failed: ${error.message || error}`);
  }
});

// TRIGGER: On Application Created
export const onApplicationCreatedV2 = onDocumentCreated({
    document: "applications/{id}",
    database: DATABASE_ID
  }, async (event) => {
    const snap = event.data;
    if (!snap) return;
    
    const application = snap.data();
    const applicationId = snap.id;
    if (!application) return;

    // Async tasks: email and geocoding
    const promises = [];

    // 1. Send "application received" email
    if (application.applicantEmail) {
      const emailPromise = (async () => {
        try {
          const template = await getTemplate('application_received');
          const subject = replaceVariables(template.subject, application);
          const body = replaceVariables(template.body, application);
          await sendEmailBatch([application.applicantEmail], subject, body, SYSTEM_SENDER);
          console.log(`Sent 'application_received' email to ${application.applicantEmail}`);
        } catch (error) {
          console.error("Error sending application received email:", error);
        }
      })();
      promises.push(emailPromise);
    }

    // 2. Geocode the address
    const geocodePromise = (async () => {
      if (application.churchAddress && !application.coordinates) {
        try {
          const addr = application.churchAddress;
          const addressString = `${addr.street}, ${addr.city}, ${addr.state} ${addr.postalCode}, ${addr.country}`;
          console.log(`Geocoding address with Mapbox: ${addressString}`);

          const response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressString)}.json`, {
            params: {
              access_token: process.env.MAPBOX_ACCESS_TOKEN,
              limit: 1
            }
          });

          if (response.data.features && response.data.features.length > 0) {
            const [lng, lat] = response.data.features[0].center;
            const coordinates = { lat, lng };
            console.log(`Geocoding successful for ${application.churchName}:`, coordinates);
            await db.collection('applications').doc(applicationId).update({ coordinates });
          } else {
            console.warn(`Geocoding failed for ${application.churchName}: No features found.`);
          }
        } catch (error) {
          console.error(`Error geocoding address for ${application.churchName}:`, error);
        }
      }
    })();
    promises.push(geocodePromise);
    
    // Wait for all async operations to complete
    await Promise.all(promises);
  });

// TRIGGER: On Application Updated (Status Change and Address Updates)
export const onApplicationStatusUpdatedV2 = onDocumentUpdated({
    document: "applications/{id}",
    database: DATABASE_ID
  }, async (event) => {
    const change = event.data;
    if (!change) return;

    const newData = change.after.data();
    const oldData = change.before.data();
    const applicationId = event.params.id;

    if (!newData || !oldData) return;

    // Handle status change emails
    if (newData.status !== oldData.status) {
      try {
        let type = '';
        if (newData.status === 'APPROVED') {
          type = 'application_approved';
        } else if (newData.status === 'REJECTED') {
          type = 'application_rejected';
        }

        if (type) {
          const template = await getTemplate(type);
          const subject = replaceVariables(template.subject, newData);
          const body = replaceVariables(template.body, newData);

          if (newData.applicantEmail) {
             await sendEmailBatch([newData.applicantEmail], subject, body, SYSTEM_SENDER);
             console.log(`Sent '${type}' email to ${newData.applicantEmail}`);
          }
        }
      } catch (error) {
         console.error("Error in onApplicationStatusUpdated:", error);
      }
    }

    // Handle address changes and trigger coordinate recalculation
    const hasAddressChanged = () => {
      const oldAddr = oldData.churchAddress;
      const newAddr = newData.churchAddress;
      
      if (!oldAddr && !newAddr) return false;
      if (!oldAddr || !newAddr) return true;
      
      return (
        oldAddr.street !== newAddr.street ||
        oldAddr.aptUnit !== newAddr.aptUnit ||
        oldAddr.city !== newAddr.city ||
        oldAddr.state !== newAddr.state ||
        oldAddr.postalCode !== newAddr.postalCode ||
        oldAddr.country !== newAddr.country
      );
    };

    if (hasAddressChanged() && newData.churchAddress) {
      try {
        console.log(`Address changed for ${newData.churchName || 'church'} [${applicationId}], triggering coordinate recalculation...`);
        
        const addr = newData.churchAddress;
        const addressString = `${addr.street || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.postalCode || ''}, ${addr.country || ''}`.replace(/,\s*,/g, ',').trim();
        
        // Skip geocoding if address is incomplete
        if (!addr.city || !addr.country) {
          console.log(`Incomplete address for ${newData.churchName || 'church'} [${applicationId}], skipping geocoding`);
          return;
        }

        console.log(`Geocoding updated address for ${newData.churchName || 'church'}: ${addressString}`);

        const response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressString)}.json`, {
          params: {
            access_token: process.env.MAPBOX_ACCESS_TOKEN,
            limit: 1
          }
        });

        if (response.data.features && response.data.features.length > 0) {
          const [lng, lat] = response.data.features[0].center;
          const coordinates = { lat, lng };
          
          // Update coordinates in background
          await db.collection('applications').doc(applicationId).update({ coordinates });
          console.log(`Successfully updated coordinates for ${newData.churchName || 'church'} [${applicationId}]:`, coordinates);
        } else {
          console.warn(`Geocoding failed for updated address of ${newData.churchName || 'church'} [${applicationId}]: No features found`);
          // Optionally clear coordinates if geocoding fails
          await db.collection('applications').doc(applicationId).update({ coordinates: null });
        }
      } catch (error) {
        console.error(`Error geocoding updated address for ${newData.churchName || 'church'} [${applicationId}]:`, error);
        // Don't throw error to avoid breaking other operations
      }
    }
  });

// ------------------------------------------------------------------
// STATISTICS & CONTACT FUNCTIONS
// ------------------------------------------------------------------

export const sendAdminContactEmail = onCall({ cors: true }, async (request) => {
  const { senderName, senderEmail, message } = request.data;

  if (!senderName || !senderEmail || !message) {
    throw new HttpsError("invalid-argument", "All fields are required.");
  }

  try {
    // Send email to admin
    const emailSubject = `Contact Request from ${senderName} via G3 Church Network`;
    const emailBody = `
      <p><strong>You have received a new contact request via the G3 Church Network:</strong></p>
      <hr>
      <p><strong>From:</strong> ${senderName} (${senderEmail})</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
      <hr>
      <p><em>This message was sent via the G3 Church Network contact form.</em></p>
      <p><em>Reply directly to ${senderEmail} to respond to this inquiry.</em></p>
    `;

    await sendEmailBatch(['admin@g3min.org'], emailSubject, emailBody, SYSTEM_SENDER);
    console.log(`Sent contact email to admin@g3min.org`);

    return { success: true, message: "Contact email sent successfully." };
  } catch (error: any) {
    console.error("Error sending contact email:", error);
    throw new HttpsError("internal", error.message);
  }
});

export const sendChurchContactEmail = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const { churchId, senderName, senderEmail, message } = request.data;

  if (!churchId || !senderName || !senderEmail || !message) {
    throw new HttpsError("invalid-argument", "All fields are required.");
  }

  try {
    // Get church information
    const churchDoc = await db.collection('applications').doc(churchId).get();
    if (!churchDoc.exists) {
      throw new HttpsError("not-found", "Church not found.");
    }

    const church = churchDoc.data();
    if (!church || !church.churchEmail) {
      throw new HttpsError("failed-precondition", "Church has no email address.");
    }

    // Send email to church
    const emailSubject = `Contact Request from ${senderName} via G3 Church Network`;
    const emailBody = `
      <p><strong>You have received a new contact request via the G3 Church Network:</strong></p>
      <hr>
      <p><strong>From:</strong> ${senderName} (${senderEmail})</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
      <hr>
      <p><em>This message was sent via the G3 Church Network contact form.</em></p>
      <p><em>Reply directly to ${senderEmail} to respond to this inquiry.</em></p>
    `;

    await sendEmailBatch([church.churchEmail], emailSubject, emailBody, SYSTEM_SENDER);
    console.log(`Sent contact email to ${church.churchName} (${church.churchEmail})`);

    // Increment contact statistic
    const statsRef = db.collection('churchStats').doc(churchId);
    const statsDoc = await statsRef.get();
    
    if (statsDoc.exists) {
      await statsRef.update({
        contacts: admin.firestore.FieldValue.increment(1),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await statsRef.set({
        churchId,
        visits: 0,
        contacts: 1,
        views: 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return { success: true, message: "Contact email sent successfully." };
  } catch (error: any) {
    console.error("Error sending contact email:", error);
    throw new HttpsError("internal", error.message);
  }
});

export const incrementChurchStatistic = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const { churchId, type } = request.data;

  if (!churchId || !type) {
    throw new HttpsError("invalid-argument", "churchId and type are required.");
  }

  if (!['visits', 'contacts', 'views'].includes(type)) {
    throw new HttpsError("invalid-argument", "type must be 'visits', 'contacts', or 'views'.");
  }

  try {
    const statsRef = db.collection('churchStats').doc(churchId);
    const statsDoc = await statsRef.get();
    
    if (statsDoc.exists) {
      await statsRef.update({
        [type]: admin.firestore.FieldValue.increment(1),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Initialize stats document
      await statsRef.set({
        churchId,
        visits: type === 'visits' ? 1 : 0,
        contacts: type === 'contacts' ? 1 : 0,
        views: type === 'views' ? 1 : 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error(`Error incrementing ${type} for ${churchId}:`, error);
    throw new HttpsError("internal", error.message);
  }
});

// ------------------------------------------------------------------
// ADMIN USER MANAGEMENT FUNCTIONS
// ------------------------------------------------------------------

export const getAllUsers = onCall({ cors: true }, async (request) => {
  if (!isAdmin(request)) {
    throw new HttpsError("permission-denied", "Only administrators can list all users.");
  }

  try {
    const listUsersResult = await getAuth(admin.app()).listUsers(1000); // List up to 1000 users
    const users = listUsersResult.users.map(userRecord => {
      const customClaims = (userRecord.customClaims || {});
      return {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        disabled: userRecord.disabled,
        creationTime: userRecord.metadata.creationTime,
        lastSignInTime: userRecord.metadata.lastSignInTime,
        // The 'role' property will be augmented on the client side from Firestore profile
        // For now, customClaims can indicate admin status
        admin: customClaims.admin || false, 
        churchId: customClaims.churchId || undefined
      };
    });
    return users;
  } catch (error: any) {
    console.error("Error listing users:", error);
    throw new HttpsError("internal", "Failed to list users: " + error.message);
  }
});

export const setAdminClaim = onCall({ cors: true }, async (request) => {
  if (!isAdmin(request)) {
    throw new HttpsError("permission-denied", "Only administrators can set admin claims.");
  }

  const { uid, role } = request.data;

  if (!uid || role !== 'admin') {
    throw new HttpsError("invalid-argument", "UID and role 'admin' are required.");
  }

  try {
    await getAuth(admin.app()).setCustomUserClaims(uid, { admin: true });
    // Also ensure the Firestore user profile is updated
    await db.collection('userProfiles').doc(uid).update({ role: 'admin' });
    console.log(`Custom claim 'admin' set for user ${uid}.`);
    return { success: true };
  } catch (error: any) {
    console.error("Error setting custom admin claim:", error);
    throw new HttpsError("internal", "Failed to set admin claim: " + error.message);
  }
});

export const removeAdminClaim = onCall({ cors: true }, async (request) => {
  if (!isAdmin(request)) {
    throw new HttpsError("permission-denied", "Only administrators can remove admin claims.");
  }

  const { uid } = request.data;

  if (!uid) {
    throw new HttpsError("invalid-argument", "UID is required.");
  }

  try {
    await getAuth(admin.app()).setCustomUserClaims(uid, { admin: false });
    // Also ensure the Firestore user profile is updated
    await db.collection('userProfiles').doc(uid).update({ role: 'guest' });
    console.log(`Custom claim 'admin' removed for user ${uid}.`);
    return { success: true };
  } catch (error: any) {
    console.error("Error removing custom admin claim:", error);
    throw new HttpsError("internal", "Failed to remove admin claim: " + error.message);
  }
});

export const createAdminUser = onCall({ cors: true }, async (request) => {
  if (!isAdmin(request)) {
    throw new HttpsError("permission-denied", "Only administrators can create other admin users.");
  }

  const { email, password } = request.data;

  if (!email || !password) {
    throw new HttpsError("invalid-argument", "Email and password are required.");
  }

  try {
    const userRecord = await getAuth(admin.app()).createUser({
      email,
      password,
      emailVerified: true,
      disabled: false,
    });

    await getAuth(admin.app()).setCustomUserClaims(userRecord.uid, { admin: true });
    // A Firestore userProfile will be created on the client side in services/firebase.ts
    console.log(`New admin user created with UID: ${userRecord.uid}`);
    return userRecord.uid;
  } catch (error: any) {
    console.error("Error creating admin user:", error);
    if (error.code === 'auth/email-already-exists') {
      throw new HttpsError("already-exists", "The email address is already in use by another user.");
    }
    throw new HttpsError("internal", "Failed to create admin user: " + error.message);
  }
});

export const deleteUser = onCall({ cors: true }, async (request) => {
  if (!isAdmin(request)) {
    throw new HttpsError("permission-denied", "Only administrators can delete users.");
  }

  const { uid } = request.data;

  if (!uid) {
    throw new HttpsError("invalid-argument", "UID is required.");
  }

  // Prevent deleting yourself
  if (request.auth && request.auth.uid === uid) {
    throw new HttpsError("failed-precondition", "You cannot delete your own account.");
  }

  try {
    // Delete the user's Firestore profile if it exists
    try {
      await db.collection('userProfiles').doc(uid).delete();
      console.log(`Deleted Firestore profile for user ${uid}`);
    } catch (error) {
      console.warn(`No Firestore profile found for user ${uid}, continuing with auth deletion`);
    }

    // Delete the user from Firebase Authentication
    await getAuth(admin.app()).deleteUser(uid);
    console.log(`Successfully deleted user ${uid} from Authentication`);
    
    return { success: true, message: "User deleted successfully" };
  } catch (error: any) {
    console.error("Error deleting user:", error);
    throw new HttpsError("internal", "Failed to delete user: " + error.message);
  }
});

export const backfillGeocodes = onCall({ cors: true, timeoutSeconds: 300 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be an authenticated admin to run this.");
  }

  const { startAfterDocId } = request.data;
  console.log(`Starting geocode backfill batch. Starting after: ${startAfterDocId || 'beginning'}`);

  let successCount = 0;
  let failCount = 0;
  const BATCH_SIZE = 10;

  try {
    let query = db.collection('applications').where('status', '==', 'APPROVED').orderBy(admin.firestore.FieldPath.documentId()).limit(BATCH_SIZE);

    if (startAfterDocId) {
      const startAfterDoc = await db.collection('applications').doc(startAfterDocId).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }

    const snapshot = await query.get();
    
    if (snapshot.empty) {
      console.log("No more approved churches found to backfill.");
      return { success: true, message: "Backfill complete.", successCount, failCount, remaining: 0, lastDocId: null };
    }

    const lastDocId = snapshot.docs[snapshot.docs.length - 1].id;

    const promises = snapshot.docs.map(async (doc) => {
      const application = doc.data();
      const applicationId = doc.id;

      if (application.churchAddress) {
        try {
          const addr = application.churchAddress;
          const addressString = `${addr.street}, ${addr.city}, ${addr.state} ${addr.postalCode}, ${addr.country}`;
          
          await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit

          const response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressString)}.json`, {
            params: {
              access_token: process.env.MAPBOX_ACCESS_TOKEN,
              limit: 1
            }
          });

          if (response.data.features && response.data.features.length > 0) {
            const [lng, lat] = response.data.features[0].center;
            const coordinates = { lat, lng };
            await doc.ref.update({ coordinates });
            console.log(`Successfully geocoded ${application.churchName} [${applicationId}]`);
            successCount++;
          } else {
            console.warn(`Geocoding not found for ${application.churchName} [${applicationId}]`);
            await doc.ref.update({ coordinates: 'failed' }); // Mark as failed to avoid retrying
            failCount++;
          }
        } catch (error) {
          console.error(`Error geocoding ${application.churchName} [${applicationId}]:`, error);
          await doc.ref.update({ coordinates: 'failed' }); // Mark as failed
          failCount++;
        }
      } else {
        console.warn(`No address found for ${application.churchName} [${applicationId}]`);
        await doc.ref.update({ coordinates: 'failed' }); // Mark as failed
        failCount++;
      }
    });

    await Promise.all(promises);
    
    // A full count is expensive. We can infer if there are more by checking if we received a full batch.
    const remaining = snapshot.size < BATCH_SIZE ? 0 : 1; // 1 means "at least one more batch"

    const message = `Batch complete. Processed: ${successCount + failCount}. Success: ${successCount}, Failed: ${failCount}.`;
    console.log(message);
    return { success: true, message, successCount, failCount, remaining, lastDocId };

  } catch (error: any) {
    console.error("Error during geocode backfill process:", error);
    throw new HttpsError("internal", "An error occurred during the backfill.", {
      message: error.message,
    });
  }
});

export const regeocodeAddress = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be an authenticated admin to run this.");
  }

  const { churchId } = request.data;
  if (!churchId) {
    throw new HttpsError("invalid-argument", "churchId is required.");
  }

  console.log(`Re-geocoding address for church: ${churchId}`);

  try {
    const docRef = db.collection('applications').doc(churchId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new HttpsError("not-found", "Church application not found.");
    }

    const application = docSnap.data();
    if (!application || !application.churchAddress) {
      throw new HttpsError("failed-precondition", "Application has no address to geocode.");
    }

    const addr = application.churchAddress;
    const addressString = `${addr.street}, ${addr.city}, ${addr.state} ${addr.postalCode}, ${addr.country}`;

    const response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressString)}.json`, {
      params: {
        access_token: process.env.MAPBOX_ACCESS_TOKEN,
        limit: 1
      }
    });

    if (response.data.features && response.data.features.length > 0) {
      const [lng, lat] = response.data.features[0].center;
      const coordinates = { lat, lng };
      await docRef.update({ coordinates });
      console.log(`Successfully re-geocoded ${application.churchName}:`, coordinates);
      return { success: true, coordinates };
    } else {
      console.warn(`Re-geocoding failed for ${application.churchName}: No features found.`);
      await docRef.update({ coordinates: 'failed' });
      throw new HttpsError("not-found", "Address could not be geocoded.");
    }
  } catch (error: any) {
    console.error(`Error re-geocoding address for ${churchId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "An unexpected error occurred during re-geocoding.");
  }
});

// ------------------------------------------------------------------
// ENHANCED STATISTICS & ANALYTICS FUNCTIONS
// ------------------------------------------------------------------

/**
 * Log a detailed event with metadata
 */
export const logChurchEvent = onCall({ cors: true }, async (request) => {
  const { churchId, type, metadata } = request.data;

  if (!churchId || !type) {
    throw new HttpsError("invalid-argument", "churchId and type are required.");
  }

  const validTypes = ['view', 'contact', 'visit', 'email_sent', 'email_opened', 'email_clicked', 'social_click'];
  if (!validTypes.includes(type)) {
    throw new HttpsError("invalid-argument", `type must be one of: ${validTypes.join(', ')}`);
  }

  try {
    // Create event document
    const eventRef = db.collection('churchEvents').doc();
    await eventRef.set({
      id: eventRef.id,
      churchId,
      type,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      metadata: metadata || {}
    });

    // Update aggregate stats
    const statsRef = db.collection('churchStats').doc(churchId);
    const increment = admin.firestore.FieldValue.increment(1);
    
    const updates: any = {
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };

    // Map event types to stat fields
    switch (type) {
      case 'view':
        updates.views = increment;
        break;
      case 'contact':
        updates.contacts = increment;
        break;
      case 'visit':
        updates.visits = increment;
        break;
      case 'social_click':
        updates.socialClicks = increment;
        break;
    }

    await statsRef.set(updates, { merge: true });

    return { success: true };
  } catch (error: any) {
    console.error(`Error logging event for ${churchId}:`, error);
    throw new HttpsError("internal", error.message);
  }
});

/**
 * Get comprehensive analytics for a specific church
 */
export const getChurchAnalytics = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const { churchId } = request.data;
  if (!churchId) {
    throw new HttpsError("invalid-argument", "churchId is required.");
  }

  try {
    // Get church info
    const churchDoc = await db.collection('applications').doc(churchId).get();
    if (!churchDoc.exists) {
      throw new HttpsError("not-found", "Church not found.");
    }
    const church = churchDoc.data();

    // Get total stats
    const statsDoc = await db.collection('churchStats').doc(churchId).get();
    const stats = statsDoc.exists ? (statsDoc.data() || {}) : {};
    const totalStats = {
      views: (stats as any).views || 0,
      contacts: (stats as any).contacts || 0,
      visits: (stats as any).visits || 0,
      socialClicks: (stats as any).socialClicks || 0
    };

    // Calculate date ranges
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get events for time periods
    const eventsSnapshot = await db.collection('churchEvents')
      .where('churchId', '==', churchId)
      .where('timestamp', '>=', thirtyDaysAgo)
      .get();

    const last30Days = { views: 0, contacts: 0, visits: 0, socialClicks: 0 };
    const last7Days = { views: 0, contacts: 0, visits: 0, socialClicks: 0 };
    let lastActivity: Date | null = null;
    const socialPlatforms: Record<string, number> = {};

    eventsSnapshot.forEach(doc => {
      const event = doc.data();
      const timestamp = event.timestamp?.toDate();
      
      if (timestamp) {
        if (!lastActivity || timestamp > lastActivity) {
          lastActivity = timestamp;
        }

        // Count for 30-day period
        if (event.type === 'view') last30Days.views++;
        else if (event.type === 'contact') last30Days.contacts++;
        else if (event.type === 'visit') last30Days.visits++;
        else if (event.type === 'social_click') {
          last30Days.socialClicks++;
          const platform = event.metadata?.platform;
          if (platform) {
            socialPlatforms[platform] = (socialPlatforms[platform] || 0) + 1;
          }
        }

        // Count for 7-day period
        if (timestamp >= sevenDaysAgo) {
          if (event.type === 'view') last7Days.views++;
          else if (event.type === 'contact') last7Days.contacts++;
          else if (event.type === 'visit') last7Days.visits++;
          else if (event.type === 'social_click') last7Days.socialClicks++;
        }
      }
    });

    // Find top social platform
    let topSocialPlatform: string | undefined;
    let maxClicks = 0;
    for (const [platform, clicks] of Object.entries(socialPlatforms)) {
      if (clicks > maxClicks) {
        maxClicks = clicks;
        topSocialPlatform = platform;
      }
    }

    const analytics = {
      churchId,
      churchName: church?.churchName || 'Unknown',
      total: totalStats,
      last30Days,
      last7Days,
      topSocialPlatform,
      lastActivity: lastActivity ? (lastActivity as Date).toISOString() : undefined
    };

    return analytics;
  } catch (error: any) {
    console.error(`Error getting analytics for ${churchId}:`, error);
    throw new HttpsError("internal", error.message);
  }
});

/**
 * Get global analytics across all churches
 */
export const getGlobalAnalytics = onCall({ cors: true }, async (request) => {
  if (!isAdmin(request)) {
    throw new HttpsError("permission-denied", "Only administrators can view global analytics.");
  }

  try {
    // Get all churches
    const churchesSnapshot = await db.collection('applications')
      .where('status', '==', 'APPROVED')
      .get();

    // Placeholder for future global analytics aggregation
    const promises = churchesSnapshot.docs.map(async (doc) => {
      const church = doc.data();
      const statsDoc = await db.collection('churchStats').doc(doc.id).get();
      const stats = statsDoc.exists ? (statsDoc.data() || {}) : {};

      return {
        id: doc.id,
        churchName: church.churchName,
        city: church.churchAddress?.city,
        country: church.churchAddress?.country,
        views: (stats as any).views || 0,
        contacts: (stats as any).contacts || 0,
        visits: (stats as any).visits || 0,
        socialClicks: (stats as any).socialClicks || 0
      };
    });

    const churchStats = await Promise.all(promises);

    // Calculate global totals
    const total = churchStats.reduce((acc, church) => ({
      views: acc.views + (church.views || 0),
      contacts: acc.contacts + (church.contacts || 0),
      visits: acc.visits + (church.visits || 0),
      socialClicks: acc.socialClicks + (church.socialClicks || 0)
    }), { views: 0, contacts: 0, visits: 0, socialClicks: 0 });

    // Calculate Last 30 Days Global Stats
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // We can't query all events easily if there are too many, but for now this is the best approach
    // without pre-aggregated daily stats. Limit to reasonable amount or aggregation.
    // Note: 'churchEvents' is a root collection? No, code says db.collection('churchEvents').
    const recentEventsSnapshot = await db.collection('churchEvents')
      .where('timestamp', '>=', thirtyDaysAgo)
      .get();

    const last30Days = { views: 0, contacts: 0, visits: 0, socialClicks: 0 };
    
    recentEventsSnapshot.forEach(doc => {
      const event = doc.data();
      if (event.type === 'view') last30Days.views++;
      else if (event.type === 'contact') last30Days.contacts++;
      else if (event.type === 'visit') last30Days.visits++;
      else if (event.type === 'social_click') last30Days.socialClicks++;
    });

    // Geographic distribution
    const geoStats: Record<string, any> = {};
    churchStats.forEach(church => {
      const country = church.country || 'Unknown';
      if (!geoStats[country]) {
        geoStats[country] = {
          country,
          churchCount: 0,
          totalViews: 0,
          totalContacts: 0
        };
      }
      geoStats[country].churchCount++;
      geoStats[country].totalViews += church.views || 0;
      geoStats[country].totalContacts += church.contacts || 0;
    });

    return {
      total,
      last30Days,
      churchCount: churchStats.length,
      topChurches: churchStats.sort((a, b) => b.views - a.views).slice(0, 10),
      geographicDistribution: Object.values(geoStats)
    };
  } catch (error: any) {
    console.error("Error getting global analytics:", error);
    throw new HttpsError("internal", error.message);
  }
});

/**
 * Get time-series data for charts
 */
export const getTimeSeriesData = onCall({ cors: true }, async (request) => {
  if (!isAdmin(request)) {
    throw new HttpsError("permission-denied", "Only administrators can view time-series data.");
  }

  const { churchId, days = 30 } = request.data;

  try {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    let query = db.collection('churchEvents')
      .where('timestamp', '>=', startDate)
      .orderBy('timestamp', 'asc');

    if (churchId) {
      query = query.where('churchId', '==', churchId);
    }

    const snapshot = await query.get();

    // Group events by date
    const dataByDate: Record<string, { views: number; contacts: number; visits: number }> = {};

    snapshot.forEach(doc => {
      const event = doc.data();
      const timestamp = event.timestamp?.toDate();
      if (timestamp) {
        const dateStr = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
        if (!dataByDate[dateStr]) {
          dataByDate[dateStr] = { views: 0, contacts: 0, visits: 0 };
        }

        if (event.type === 'view') dataByDate[dateStr].views++;
        else if (event.type === 'contact') dataByDate[dateStr].contacts++;
        else if (event.type === 'visit') dataByDate[dateStr].visits++;
      }
    });

    // Fill in missing dates with zeros
    const timeSeriesData: any[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      timeSeriesData.push({
        date: dateStr,
        views: dataByDate[dateStr]?.views || 0,
        contacts: dataByDate[dateStr]?.contacts || 0,
        visits: dataByDate[dateStr]?.visits || 0
      });
    }

    return timeSeriesData;
  } catch (error: any) {
    console.error("Error getting time-series data:", error);
    throw new HttpsError("internal", error.message);
  }
});

/**
 * Reset all analytics data
 */
export const resetAnalytics = onCall({ cors: true }, async (request) => {
  if (!isAdmin(request)) {
    throw new HttpsError("permission-denied", "Only administrators can reset analytics.");
  }

  try {
    const collectionsToDelete = ['churchStats', 'churchEvents'];
    const promises = [];

    for (const collectionName of collectionsToDelete) {
      const collectionRef = db.collection(collectionName);
      const snapshot = await collectionRef.get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      promises.push(batch.commit());
    }

    await Promise.all(promises);
    return { success: true, message: "Analytics data reset successfully." };
  } catch (error: any) {
    console.error("Error resetting analytics:", error);
    throw new HttpsError("internal", error.message);
  }
});
