import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
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

const SYSTEM_SENDER = "G3 Church Network <admin@g3min.org>";

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
  result = result.replace(/\{\{applicantName\}\}/g, `${application.applicantFirstName} ${application.applicantLastName}`);
    result = result.replace(/\{\{churchName\}\}/g, application.churchName);
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

import { getAuth } from 'firebase-admin/auth';

// ... (other code)

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

    // Generate password reset link
    const link = await authAdmin.generatePasswordResetLink(applicantEmail);
    console.log(`Generated password reset link for ${applicantEmail}: ${link}`);

    // Send the password setup email
    const template = await getTemplate('portal_account_setup');
    const subject = replaceVariables(template.subject, application);
    const body = replaceVariables(template.body, { ...application, resetLink: link }); // Pass resetLink as part of application data

    await sendEmailBatch([applicantEmail], subject, body, SYSTEM_SENDER);
    console.log(`Sent 'portal_account_setup' email to ${applicantEmail}`);

    return { success: true, message: "Portal account created and password reset email sent." };

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

// TRIGGER: On Application Updated (Status Change)
export const onApplicationStatusUpdatedV2 = onDocumentUpdated({
    document: "applications/{id}",
    database: DATABASE_ID
  }, async (event) => {
    const change = event.data;
    if (!change) return;

    const newData = change.after.data();
    const oldData = change.before.data();

    if (!newData || !oldData) return;

    // Only send if status changed
    if (newData.status === oldData.status) return;

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
