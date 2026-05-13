"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStripeWebhook = exports.createStripeCheckoutSession = exports.clearTestStripeData = exports.resetAnalytics = exports.getTimeSeriesData = exports.getGlobalAnalytics = exports.getChurchAnalytics = exports.logChurchEvent = exports.regeocodeAddress = exports.backfillGeocodes = exports.setupAccountPassword = exports.getSetupTokenInfo = exports.sendPasswordResetEmail = exports.changeUserPassword = exports.deleteUser = exports.createAdminUser = exports.removeAdminClaim = exports.setAdminClaim = exports.getAllUsers = exports.incrementChurchStatistic = exports.sendChurchContactEmail = exports.sendAdminContactEmail = exports.onApplicationStatusUpdatedV2 = exports.onApplicationUpdatedShopifySync = exports.onApplicationCreatedShopifySync = exports.onApplicationCreatedV2 = exports.resendSystemEmailV2 = exports.syncSubscriptionStatus = exports.sendEmailV2 = exports.checkDuesAndReminders = exports.processChurchPayment = exports.provisionallyApproveApplication = exports.approveApplication = exports.createChurchUserAndSendResetEmail = exports.createStripeBillingPortalSession = exports.onJobApplicationCreated = exports.verifyPromoCode = exports.createStripeSetupIntent = void 0;
// Forcing redeployment with updated environment variables and new email functionality
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const resend_1 = require("resend");
const stripe_1 = __importDefault(require("stripe"));
const dotenv = __importStar(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const shopify_api_1 = require("@shopify/shopify-api");
require("@shopify/shopify-api/adapters/node");
dotenv.config();
admin.initializeApp();
// Initialize Stripe
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || "");
const stripeTest = new stripe_1.default(process.env.STRIPE_SECRET_KEY_TEST || "");
// HARDCODED FOR DEBUGGING - The .env file might not be loading in the deployed environment
const resend = new resend_1.Resend(process.env.RESEND_API_KEY || "");
// Helper to split array into chunks
const chunkArray = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
};
// Helper function to check if user is admin based on custom claim
function isAdmin(context) {
    return context.auth != null && context.auth.token.admin === true;
}
const SYSTEM_SENDER = "G3 Church Network <admin@g3min.org>";
// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------
const DATABASE_ID = 'g3network';
const db = (0, firestore_1.getFirestore)(admin.app(), DATABASE_ID);
const CHURCH_LOGIN_URL = 'https://network.g3min.org/login';
const PASSWORD_SETUP_BASE_URL = 'https://network.g3min.org/setup-password';
const SETUP_TOKENS_COLLECTION = 'passwordSetupTokens';
// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------
/**
 * Creates a long-lived password setup token, stores it in Firestore,
 * and returns the full setup URL the user should click. Each call
 * invalidates any previously-issued unused tokens for the same email
 * so a freshly-resent welcome email always supersedes older ones.
 *
 * Tokens are single-use and do not expire by time — they remain valid
 * until consumed (or manually revoked). This avoids the situation where
 * Firebase's built-in password reset links expire before a busy church
 * gets to them.
 */
const createPasswordSetupLink = async (email, userId, applicationId) => {
    // Invalidate any prior unused tokens for this email so only the newest works.
    try {
        const stale = await db.collection(SETUP_TOKENS_COLLECTION)
            .where('email', '==', email)
            .where('used', '==', false)
            .get();
        const batch = db.batch();
        stale.forEach(doc => {
            batch.update(doc.ref, {
                used: true,
                usedAt: new Date().toISOString(),
                revokedReason: 'superseded_by_new_token',
            });
        });
        if (!stale.empty) {
            await batch.commit();
        }
    }
    catch (err) {
        console.warn(`Could not revoke prior setup tokens for ${email}:`, err);
    }
    const token = crypto.randomBytes(32).toString('hex');
    await db.collection(SETUP_TOKENS_COLLECTION).doc(token).set({
        token,
        email,
        userId,
        applicationId: applicationId || null,
        createdAt: new Date().toISOString(),
        used: false,
        usedAt: null,
    });
    return `${PASSWORD_SETUP_BASE_URL}?token=${token}`;
};
const DEFAULT_TEMPLATES = {
    application_received: {
        type: 'application_received',
        subject: 'Application Received - G3 Church Network',
        body: '<p>Dear {{applicantName}},</p><p>Thank you for submitting your application for <strong>{{churchName}}</strong> to join the G3 Church Network. We have received your application and will begin the review process shortly.</p><p>We will notify you once a decision has been made.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
    },
    admin_application_notification: {
        type: 'admin_application_notification',
        subject: 'New Church Application - {{churchName}}',
        body: '<p><strong>New Church Application Received</strong></p><hr><p><strong>Church Name:</strong> {{churchName}}</p><p><strong>Applicant:</strong> {{applicantName}}</p><p><strong>Email:</strong> {{applicantEmail}}</p><p><strong>Location:</strong> {{churchAddress}}</p><hr><p>Please review this application in the admin dashboard.</p><p><a href="https://network.g3min.org/admin">Go to Admin Dashboard</a></p>'
    },
    application_provisional_approved: {
        type: 'application_provisional_approved',
        subject: 'Next Steps for Your G3 Church Network Membership',
        body: '<p>Dear {{applicantName}},</p><p>Congratulations! We are pleased to inform you that your application for <strong>{{churchName}}</strong> has been <strong>provisionally approved</strong> to join the G3 Church Network.</p><p><strong>Next Steps:</strong></p><ol><li>Set up your church portal account password using the link below</li><li>Log in to your church portal</li><li>Complete your payment ($500 minimum annual dues)</li><li>Once payment is received, your membership will be fully activated</li></ol><p><strong>Set Your Password:</strong><br><a href="{{resetLink}}">Click here to set your password and access the Church Portal</a></p><p>This link will remain active until you use it. After setting your password, you can log in at: <a href="' + CHURCH_LOGIN_URL + '">Church Portal Login</a></p><p><strong>Payment Information:</strong><br>Once logged in, you will have the option to complete your annual dues payment. The minimum annual contribution is $500, and you can choose between a yearly subscription or a one-time payment.</p><p>After your payment is processed, you will gain full access to all network benefits and your church will be added to our public map.</p><p>If you have any questions, please don\'t hesitate to reply to this email.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
    },
    application_approved: {
        type: 'application_approved',
        subject: 'Welcome to G3 Church Network!',
        body: '<p>Dear {{applicantName}},</p><p>We are pleased to inform you that your application for <strong>{{churchName}}</strong> has been <strong>approved</strong>!</p><p>Your church is now listed on our network map. You can log in to your church dashboard to manage your profile.</p><p>You can access your church portal here: <a href="' + CHURCH_LOGIN_URL + '">Church Portal Login</a></p><p>Welcome to the network!</p><p>Grace and peace,<br>G3 Church Network Team</p>'
    },
    application_fully_approved: {
        type: 'application_fully_approved',
        subject: 'Welcome to the G3 Church Network Family!',
        body: '<p>Dear {{applicantName}},</p><p>🎉 <strong>Congratulations!</strong> Your payment has been received and <strong>{{churchName}}</strong> is now a <strong>full member</strong> of the G3 Church Network!</p><p><strong>Your Church is Now Live:</strong></p><ul><li>✓ Listed on our interactive <a href="https://network.g3min.org/map">Network Map</a></li><li>✓ Full access to the Church Portal</li><li>✓ Ability to post job openings on our Job Board</li><li>✓ Access to member resources and discounts</li><li>✓ Connection with like-minded Reformed Baptist churches worldwide</li></ul><p><strong>What You Can Do Now:</strong></p><ol><li><strong>Update Your Profile:</strong> Add your church logo, update your description, and ensure all contact information is current</li><li><strong>Post Job Openings:</strong> Use our Job Board to find qualified candidates for ministry positions</li><li><strong>View Analytics:</strong> Track how many people are viewing and contacting your church</li><li><strong>Explore Network Benefits:</strong> Check out exclusive discounts on conferences, resources, and more</li></ol><p><strong>Log in to your Church Portal:</strong><br><a href="' + CHURCH_LOGIN_URL + '">Access Your Dashboard</a></p><p><strong>Network Benefits Include:</strong></p><ul><li>Discounts on G3 Conferences and Resources</li><li>Access to the Pastors Forum</li><li>Priority consideration for speaking opportunities</li><li>Global fellowship with doctrinally sound churches</li><li>Job board access for recruiting ministry staff</li></ul><p>We are thrilled to have you as part of our network and look forward to partnering with you in the work of the gospel.</p><p>If you have any questions or need assistance, please don\'t hesitate to reach out.</p><p>Grace and peace,<br>The G3 Church Network Team</p><p><em>For the glory of God alone.</em></p>'
    },
    application_rejected: {
        type: 'application_rejected',
        subject: 'Update on your G3 Church Network Application',
        body: '<p>Dear {{applicantName}},</p><p>Thank-you for your interest in the G3 Church Network.</p><p>After careful review of your application for <strong>{{churchName}}</strong>, we are unable to accept your application at this time.</p><p>If you have any questions, please feel free to reply to this email.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
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
        body: '<p>Dear {{applicantName}},</p><p>A portal account has been created for <strong>{{churchName}}</strong> in the G3 Church Network.</p><p>To set your password and access your church\'s profile, please click the link below:</p><p><a href="{{resetLink}}">Set Your Password for the Church Portal</a></p><p>This link will remain active until you use it. If you ever need to reset your password again later, you can use the "Forgot Password" link on the login page.</p><p>You can log in here: <a href="' + CHURCH_LOGIN_URL + '">Church Portal Login</a></p><p>Grace and peace,<br>G3 Church Network Team</p>'
    },
    job_application_received: {
        type: 'job_application_received',
        subject: 'New Job Application Received for "{{jobTitle}}"',
        body: '<p>Dear {{churchName}} Team,</p><p>You have received a new application for your job listing: <strong>"{{jobTitle}}"</strong> on the G3 Church Network Job Board!</p><p><strong>Applicant Name:</strong> {{applicantName}}</p><p><strong>Applicant Email:</strong> <a href="mailto:{{applicantEmail}}">{{applicantEmail}}</a></p><p><strong>Applicant Phone:</strong> {{applicantPhone}}</p><p><strong>Message:</strong></p><p>{{message}}</p>{{resumeLink}}<p>Please log in to your <a href="' + CHURCH_LOGIN_URL + '">Church Portal</a> to review this application and manage your job listings.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
    },
    job_application_confirmation: {
        type: 'job_application_confirmation',
        subject: 'Your Job Application for "{{jobTitle}}" has been received',
        body: '<p>Dear {{applicantName}},</p><p>Thank you for submitting your application for the <strong>"{{jobTitle}}"</strong> position at <strong>{{churchName}}</strong> through the G3 Church Network Job Board.</p><p>Your application has been successfully received and forwarded to the church for review. You will be contacted directly by the church if they are interested in moving forward with your application.</p><p>We wish you the best in your job search.</p><p>Grace and peace,<br>G3 Church Network Team</p>'
    }
};
const getTemplate = async (type) => {
    try {
        const doc = await db.collection('settings').doc(`email_template_${type}`).get();
        if (doc.exists) {
            return doc.data();
        }
    }
    catch (error) {
        console.warn(`Failed to fetch template ${type}, using default.`, error);
    }
    return DEFAULT_TEMPLATES[type] || { subject: 'Notification', body: 'No content', type };
};
const replaceVariables = (text, application) => {
    let result = text;
    result = result.replace(/\{\{applicantName\}\}/g, `${application.applicantFirstName || application.applicantName}`); // For job applications, applicantName is direct
    result = result.replace(/\{\{churchName\}\}/g, application.churchName || application.churchNameFromJob || 'Your Church');
    // Replace applicantEmail for both church applications and job applications
    if (application.applicantEmail) {
        result = result.replace(/\{\{applicantEmail\}\}/g, application.applicantEmail);
    }
    else if (application.applicantEmailForJob) { // Fallback for job applications
        result = result.replace(/\{\{applicantEmail\}\}/g, application.applicantEmailForJob);
    }
    // Format church address for admin notifications
    if (application.churchAddress) {
        const addr = application.churchAddress;
        const formatted = `${addr.city || ''}, ${addr.state || ''} ${addr.postalCode || ''}, ${addr.country || ''}`.replace(/,\s*,/g, ',').trim();
        result = result.replace(/\{\{churchAddress\}\}/g, formatted);
    }
    if (application.jobTitle) {
        result = result.replace(/\{\{jobTitle\}\}/g, application.jobTitle);
    }
    if (application.applicantPhone) { // Specific to job applications
        result = result.replace(/\{\{applicantPhone\}\}/g, application.applicantPhone);
    }
    if (application.message) { // Specific to job applications
        result = result.replace(/\{\{message\}\}/g, application.message.replace(/\n/g, '<br>'));
    }
    if (application.resumeLink) { // Specific to job applications
        result = result.replace(/\{\{resumeLink\}\}/g, `<p><strong>Resume:</strong> <a href="${application.resumeLink}">Download Resume</a></p>`);
    }
    else {
        result = result.replace(/\{\{resumeLink\}\}/g, ''); // Remove if no resume
    }
    if (application.resetLink) {
        result = result.replace(/\{\{resetLink\}\}/g, application.resetLink);
    }
    // Handle {{portalLink}} — maps to resetLink if available, otherwise login URL
    result = result.replace(/\{\{portalLink\}\}/g, application.resetLink || CHURCH_LOGIN_URL);
    return result;
};
const sendPaymentNotification = async (churchData, paymentDate, amount) => {
    try {
        const emailBody = `
      <p><strong>Payment Received - G3 Church Network Dues</strong></p>
      <hr>
      <p><strong>Church Name:</strong> ${churchData.churchName}</p>
      <p><strong>Church Email:</strong> ${churchData.applicantEmail || churchData.churchEmail}</p>
      <p><strong>Payment Date:</strong> ${paymentDate}</p>
      <p><strong>Payment Amount:</strong> $${amount.toFixed(2)}</p>
      <hr>
      <p><em>This is an automated notification from the G3 Church Network system.</em></p>
    `;
        await sendEmailBatch(['finance@g3min.org'], 'G3 Church Network Dues Payment Received', emailBody, SYSTEM_SENDER);
        console.log(`Sent payment notification to finance@g3min.org for ${churchData.churchName}`);
    }
    catch (error) {
        console.error('Error sending payment notification to finance@g3min.org:', error);
    }
};
const sendEmailBatch = async (recipients, subject, html, from) => {
    var _a, _b;
    const senderEmail = from || SYSTEM_SENDER;
    try {
        // Resend Batch API allows up to 100 emails per request.
        const BATCH_SIZE = 100;
        const recipientChunks = chunkArray(recipients, BATCH_SIZE);
        const results = [];
        for (const chunk of recipientChunks) {
            const payload = chunk.map((email) => {
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
                  <img src="https://g3min.org/wp-content/uploads/2025/06/G3-web-banner-scaled.png" alt="G3 Church Network" class="logo">
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
            }
            else {
                results.push({ success: true, data });
            }
        }
        const allFailed = results.every(r => !r.success);
        if (allFailed && results.length > 0) {
            const firstError = ((_b = (_a = results[0]) === null || _a === void 0 ? void 0 : _a.error) === null || _b === void 0 ? void 0 : _b.message) || "Unknown Resend Error";
            throw new Error(`Resend Error: ${firstError}`);
        }
        return { success: true, results };
    }
    catch (error) {
        console.error("Error sending email:", error);
        // Ensure we throw an Error object with a message
        throw new Error(error.message || JSON.stringify(error) || "Unknown sending error");
    }
};
// ------------------------------------------------------------------
// CLOUD FUNCTIONS (v2)
// ------------------------------------------------------------------
exports.createStripeSetupIntent = (0, https_1.onCall)({ cors: true }, async (request) => {
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
    }
    catch (error) {
        console.error("Error creating SetupIntent:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
exports.verifyPromoCode = (0, https_1.onRequest)((req, res) => {
    var _a;
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Max-Age', '3600');
        res.status(204).send('');
        return;
    }
    // Parse body for onCall style or direct JSON
    let code = ((_a = req.body.data) === null || _a === void 0 ? void 0 : _a.code) || req.body.code;
    if (!code) {
        res.status(400).send({ data: { error: "Promo code is required." } });
        return;
    }
    const promoCodeRef = db.collection('promoCodes').doc(code);
    promoCodeRef.get()
        .then(doc => {
        if (doc.exists) {
            res.status(200).send({ data: { valid: true } });
        }
        else {
            res.status(200).send({ data: { valid: false } });
        }
    })
        .catch(error => {
        console.error("Error verifying promo code:", error);
        res.status(500).send({ data: { error: "Internal server error." } });
    });
});
// TRIGGER: On Job Application Created
exports.onJobApplicationCreated = (0, firestore_2.onDocumentCreated)({
    document: "jobApplications/{id}",
    database: DATABASE_ID
}, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const jobApplication = snap.data();
    const jobApplicationId = snap.id;
    if (!jobApplication)
        return;
    try {
        // 1. Get Job Listing details
        const jobDoc = await db.collection('jobListings').doc(jobApplication.jobId).get();
        if (!jobDoc.exists) {
            console.error(`Job listing ${jobApplication.jobId} not found for application ${jobApplicationId}`);
            return;
        }
        const jobListing = jobDoc.data();
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
            applicantEmailForJob: jobApplication.applicantEmail,
            applicantPhone: jobApplication.applicantPhone,
            message: jobApplication.message,
            resumeLink: jobApplication.resumeUrl,
        };
        const subject = replaceVariables(template.subject, emailData);
        const body = replaceVariables(template.body, emailData);
        const recipients = Array.from(new Set([church.churchEmail, church.applicantEmail].filter(e => e && typeof e === 'string')));
        await sendEmailBatch(recipients, subject, body, SYSTEM_SENDER);
        console.log(`Sent 'job_application_received' email to ${recipients.join(', ')} for job "${jobListing.title}"`);
        // 4. Send "job application confirmation" email to the applicant
        const applicantTemplate = await getTemplate('job_application_confirmation');
        const applicantEmailData = {
            churchName: church.churchName,
            jobTitle: jobListing.title,
            applicantName: jobApplication.applicantName,
        };
        const applicantSubject = replaceVariables(applicantTemplate.subject, applicantEmailData);
        const applicantBody = replaceVariables(applicantTemplate.body, applicantEmailData);
        await sendEmailBatch([jobApplication.applicantEmail], applicantSubject, applicantBody, SYSTEM_SENDER);
        console.log(`Sent 'job_application_confirmation' email to ${jobApplication.applicantEmail}`);
    }
    catch (error) {
        console.error(`Error processing onJobApplicationCreated for application ${jobApplicationId}:`, error);
    }
});
// ------------------------------------------------------------------
// ADMIN USER MANAGEMENT FUNCTIONS
// ------------------------------------------------------------------
exports.createStripeBillingPortalSession = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated.");
    }
    const { customerId, returnUrl } = request.data;
    if (!customerId) {
        throw new https_1.HttpsError("invalid-argument", "customerId is required.");
    }
    try {
        // Try with live mode Stripe key first
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl || 'https://network.g3min.org/church-login',
        });
        console.log(`Billing portal session created with live key for customer: ${customerId}`);
        return {
            url: session.url,
        };
    }
    catch (error) {
        // If customer doesn't exist in live mode, try test mode
        if (error.code === 'resource_missing') {
            console.log(`Customer ${customerId} not found with live key, trying test key.`);
            try {
                const session = await stripeTest.billingPortal.sessions.create({
                    customer: customerId,
                    return_url: returnUrl || 'https://network.g3min.org/church-login',
                });
                console.log(`Billing portal session created with test key for customer: ${customerId}`);
                return {
                    url: session.url,
                };
            }
            catch (testError) {
                console.error(`Customer ${customerId} not found with test key either.`);
                throw new https_1.HttpsError("not-found", "Customer not found in either live or test mode.");
            }
        }
        // For other errors, log and throw
        console.error("Error creating billing portal session:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
const auth_1 = require("firebase-admin/auth");
exports.createChurchUserAndSendResetEmail = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated.");
    }
    const { churchId, applicantEmail } = request.data;
    if (!churchId || !applicantEmail) {
        throw new https_1.HttpsError("invalid-argument", "churchId and applicantEmail are required.");
    }
    const authAdmin = (0, auth_1.getAuth)(admin.app());
    try {
        const docRef = db.collection('applications').doc(churchId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            throw new https_1.HttpsError("not-found", "Church application not found.");
        }
        const application = docSnap.data();
        if (!application) {
            throw new https_1.HttpsError("not-found", "No data for application.");
        }
        let firebaseUser;
        try {
            firebaseUser = await authAdmin.getUserByEmail(applicantEmail);
            console.log(`User already exists for ${applicantEmail}.`);
        }
        catch (error) {
            if (error.code === 'auth/user-not-found') {
                // User does not exist, create new one
                firebaseUser = await authAdmin.createUser({
                    email: applicantEmail,
                    emailVerified: false,
                    disabled: false,
                });
                console.log(`Created new Firebase user for ${applicantEmail} with UID: ${firebaseUser.uid}`);
            }
            else {
                throw error;
            }
        }
        // Update the Firestore application with the userId if not already set
        if (!application.userId || application.userId !== firebaseUser.uid) {
            await docRef.update({ userId: firebaseUser.uid });
            console.log(`Updated Firestore application ${churchId} with userId: ${firebaseUser.uid}`);
        }
        // Generate a long-lived setup link (does not expire by time, single-use)
        const link = await createPasswordSetupLink(applicantEmail, firebaseUser.uid, churchId);
        console.log(`Generated password setup link for ${applicantEmail}: ${link}`);
        // Send the password setup email
        const template = await getTemplate('portal_account_setup');
        const subject = replaceVariables(template.subject, application);
        const body = replaceVariables(template.body, Object.assign(Object.assign({}, application), { resetLink: link })); // Pass resetLink as part of application data
        await sendEmailBatch([applicantEmail], subject, body, SYSTEM_SENDER);
        console.log(`Sent 'portal_account_setup' email to ${applicantEmail}`);
        return { success: true, message: "Portal account created and password reset email sent.", uid: firebaseUser.uid }; // Return UID on success
    }
    catch (error) {
        console.error("Error in createChurchUserAndSendResetEmail:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
/**
 * Safely converts a date-like value to an ISO string.
 * Returns null if the value cannot be converted to a valid date.
 */
const toSafeISOString = (dateValue) => {
    if (!dateValue)
        return null;
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? null : date.toISOString();
};
exports.approveApplication = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated.");
    }
    const { applicationId } = request.data;
    if (!applicationId) {
        throw new https_1.HttpsError("invalid-argument", "Application ID is required.");
    }
    try {
        // 1. Get the application
        const docRef = db.collection('applications').doc(applicationId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            throw new https_1.HttpsError("not-found", "Application not found.");
        }
        const appData = docSnap.data();
        if (!appData)
            throw new https_1.HttpsError("not-found", "No data.");
        // Check if already approved
        if (appData.status === 'APPROVED') {
            return { success: true, message: "Already approved." };
        }
        // 2. Process Payment (if payment info exists)
        let paymentStatus = "No Payment Info";
        let nextDueDate = null;
        let lastPaymentDate = null;
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
                        name: `G3 Church Network Annual Dues - ${appData.churchName}`,
                        metadata: {
                            churchId: applicationId,
                            churchName: appData.churchName,
                            description: 'Annual membership dues for G3 Church Network'
                        }
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
                    description: `G3 Church Network Annual Dues - ${appData.churchName}`,
                    metadata: {
                        churchId: applicationId,
                        churchName: appData.churchName,
                        applicantEmail: appData.applicantEmail,
                        type: 'annual_dues'
                    }
                });
                subscriptionId = subscription.id;
                paymentStatus = subscription.status; // 'active', 'incomplete', etc.
                if (paymentStatus === 'active') {
                    lastPaymentDate = toSafeISOString(new Date());
                    nextDueDate = toSafeISOString(new Date(subscription.current_period_end * 1000));
                }
            }
            else {
                // One-time Payment
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amountInCents,
                    currency: 'usd',
                    customer: appData.stripeCustomerId,
                    payment_method: appData.stripePaymentMethodId,
                    off_session: true,
                    confirm: true,
                    description: `G3 Church Network Annual Dues - ${appData.churchName} (One-time Payment)`,
                    statement_descriptor: 'G3 Network Dues',
                    metadata: {
                        churchId: applicationId,
                        churchName: appData.churchName,
                        applicantEmail: appData.applicantEmail,
                        type: 'annual_dues_onetime',
                        paymentYear: new Date().getFullYear().toString()
                    },
                    return_url: 'https://g3churchnetwork.com', // Placeholder
                });
                if (paymentIntent.status === 'succeeded') {
                    paymentStatus = 'succeeded';
                    lastPaymentDate = toSafeISOString(new Date());
                    // Set next due date to 1 year from now
                    const nextDate = new Date();
                    nextDate.setFullYear(nextDate.getFullYear() + 1);
                    nextDueDate = toSafeISOString(nextDate);
                    // Send payment notification email
                    if (lastPaymentDate) {
                        await sendPaymentNotification(appData, lastPaymentDate, appData.paymentAmount);
                    }
                }
                else {
                    throw new https_1.HttpsError("aborted", `Payment failed with status: ${paymentIntent.status}`);
                }
            }
        }
        // 3. Update Application Status
        // If no payment info or payment was not a subscription, calculate nextDueDate as 1 year from lastPaymentDate
        if (!nextDueDate && lastPaymentDate) {
            const lastPayDateObj = new Date(lastPaymentDate);
            lastPayDateObj.setFullYear(lastPayDateObj.getFullYear() + 1);
            nextDueDate = toSafeISOString(lastPayDateObj);
        }
        else if (!nextDueDate) {
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
    }
    catch (error) {
        console.error("Error approving application:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
/**
 * Provisionally approve an application - creates portal account and sends email
 * Does NOT process payment - payment happens later in the church portal
 */
exports.provisionallyApproveApplication = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated.");
    }
    const { applicationId } = request.data;
    if (!applicationId) {
        throw new https_1.HttpsError("invalid-argument", "Application ID is required.");
    }
    try {
        // 1. Get the application
        const docRef = db.collection('applications').doc(applicationId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            throw new https_1.HttpsError("not-found", "Application not found.");
        }
        const appData = docSnap.data();
        if (!appData)
            throw new https_1.HttpsError("not-found", "No data.");
        // Check if already provisionally approved or fully approved
        if (appData.status === 'PROVISIONAL_APPROVED' || appData.status === 'APPROVED') {
            return { success: true, message: `Already ${appData.status}.` };
        }
        const authAdmin = (0, auth_1.getAuth)(admin.app());
        const applicantEmail = appData.applicantEmail;
        // 2. Create or get Firebase Auth user
        let firebaseUser;
        try {
            firebaseUser = await authAdmin.getUserByEmail(applicantEmail);
            console.log(`User already exists for ${applicantEmail}.`);
        }
        catch (error) {
            if (error.code === 'auth/user-not-found') {
                // User does not exist, create new one
                firebaseUser = await authAdmin.createUser({
                    email: applicantEmail,
                    emailVerified: false,
                    disabled: false,
                });
                console.log(`Created new Firebase user for ${applicantEmail} with UID: ${firebaseUser.uid}`);
            }
            else {
                throw error;
            }
        }
        // 3. Update the Firestore application with userId and status
        await docRef.update({
            userId: firebaseUser.uid,
            status: 'PROVISIONAL_APPROVED',
            updatedAt: toSafeISOString(new Date())
        });
        console.log(`Updated application ${applicationId} to PROVISIONAL_APPROVED with userId: ${firebaseUser.uid}`);
        // 4. Generate a long-lived password setup link (does not expire by time, single-use)
        const resetLink = await createPasswordSetupLink(applicantEmail, firebaseUser.uid, applicationId);
        console.log(`Generated password setup link for ${applicantEmail}`);
        // 5. Send provisional approval email with portal access instructions
        const template = await getTemplate('application_provisional_approved');
        const subject = replaceVariables(template.subject, appData);
        const body = replaceVariables(template.body, Object.assign(Object.assign({}, appData), { resetLink }));
        await sendEmailBatch([applicantEmail], subject, body, SYSTEM_SENDER);
        console.log(`Sent 'application_provisional_approved' email to ${applicantEmail}`);
        return {
            success: true,
            message: "Application provisionally approved. Portal account created and email sent.",
            uid: firebaseUser.uid
        };
    }
    catch (error) {
        console.error("Error in provisionallyApproveApplication:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
/**
 * Process payment for a provisionally approved church
 * Called from the Church Portal when church submits payment
 */
exports.processChurchPayment = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated.");
    }
    const { applicationId, paymentAmount, paymentFrequency, paymentMethodId } = request.data;
    if (!applicationId || !paymentAmount || !paymentFrequency || !paymentMethodId) {
        throw new https_1.HttpsError("invalid-argument", "Missing required payment parameters.");
    }
    try {
        // 1. Get the application
        const docRef = db.collection('applications').doc(applicationId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            throw new https_1.HttpsError("not-found", "Application not found.");
        }
        const appData = docSnap.data();
        if (!appData)
            throw new https_1.HttpsError("not-found", "No data.");
        // Verify this application belongs to the authenticated user
        if (appData.userId !== request.auth.uid) {
            throw new https_1.HttpsError("permission-denied", "You don't have permission to process payment for this application.");
        }
        // Check status - Allow PROVISIONAL_APPROVED, DELINQUENT, or APPROVED (Renewals)
        const allowedStatuses = ['PROVISIONAL_APPROVED', 'DELINQUENT', 'APPROVED'];
        if (!allowedStatuses.includes(appData.status)) {
            throw new https_1.HttpsError("failed-precondition", `Application status is ${appData.status}, expected one of: ${allowedStatuses.join(', ')}.`);
        }
        const amountInCents = Math.round(paymentAmount * 100);
        // 2. Create or get Stripe customer
        let customerId = appData.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: appData.applicantEmail,
                name: appData.churchName,
                metadata: {
                    churchId: applicationId,
                    churchName: appData.churchName
                }
            });
            customerId = customer.id;
            await docRef.update({ stripeCustomerId: customerId });
        }
        // 3. Attach payment method to customer
        await stripe.paymentMethods.attach(paymentMethodId, {
            customer: customerId,
        });
        // Set as default payment method
        await stripe.customers.update(customerId, {
            invoice_settings: {
                default_payment_method: paymentMethodId,
            },
        });
        let subscriptionId = null;
        let nextDueDate = null;
        let lastPaymentDate = null;
        // 4. Process payment based on frequency
        if (paymentFrequency === 'yearly') {
            // Create recurring subscription
            const price = await stripe.prices.create({
                currency: 'usd',
                unit_amount: amountInCents,
                recurring: {
                    interval: 'year',
                },
                product_data: {
                    name: `G3 Church Network Annual Dues - ${appData.churchName}`,
                    metadata: {
                        churchId: applicationId,
                        churchName: appData.churchName,
                        description: 'Annual membership dues for G3 Church Network'
                    }
                },
            });
            const subscription = await stripe.subscriptions.create({
                customer: customerId,
                default_payment_method: paymentMethodId,
                items: [{
                        price: price.id,
                    }],
                expand: ['latest_invoice.payment_intent'],
                description: `G3 Church Network Annual Dues - ${appData.churchName}`,
                metadata: {
                    churchId: applicationId,
                    churchName: appData.churchName,
                    applicantEmail: appData.applicantEmail,
                    type: 'annual_dues'
                }
            });
            subscriptionId = subscription.id;
            if (subscription.status === 'active') {
                lastPaymentDate = toSafeISOString(new Date());
                nextDueDate = toSafeISOString(new Date(subscription.current_period_end * 1000));
            }
            else {
                throw new https_1.HttpsError("aborted", `Subscription creation failed with status: ${subscription.status}`);
            }
        }
        else {
            // One-time payment
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amountInCents,
                currency: 'usd',
                customer: customerId,
                payment_method: paymentMethodId,
                off_session: true,
                confirm: true,
                description: `G3 Church Network Annual Dues - ${appData.churchName} (One-time Payment)`,
                statement_descriptor: 'G3 Network Dues',
                metadata: {
                    churchId: applicationId,
                    churchName: appData.churchName,
                    applicantEmail: appData.applicantEmail,
                    type: 'annual_dues_onetime',
                    paymentYear: new Date().getFullYear().toString()
                },
                return_url: 'https://network.g3min.org/dashboard',
            });
            if (paymentIntent.status === 'succeeded') {
                lastPaymentDate = toSafeISOString(new Date());
                // Set next due date to 1 year from now
                const nextDate = new Date();
                nextDate.setFullYear(nextDate.getFullYear() + 1);
                nextDueDate = toSafeISOString(nextDate);
                // Send payment notification email
                if (lastPaymentDate) {
                    await sendPaymentNotification(appData, lastPaymentDate, paymentAmount);
                }
            }
            else {
                throw new https_1.HttpsError("aborted", `Payment failed with status: ${paymentIntent.status}`);
            }
        }
        // 5. Update application status to APPROVED
        await docRef.update({
            status: 'APPROVED',
            isManuallyDelinquent: false,
            paymentAmount,
            paymentFrequency,
            stripePaymentMethodId: paymentMethodId,
            stripeSubscriptionId: subscriptionId,
            lastPaymentDate,
            nextDueDate,
            updatedAt: toSafeISOString(new Date())
        });
        console.log(`Payment processed successfully for ${appData.churchName}. Status updated to APPROVED.`);
        return {
            success: true,
            message: "Payment processed successfully. Your membership is now fully active!",
            subscriptionId
        };
    }
    catch (error) {
        console.error("Error in processChurchPayment:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
// Scheduled Function: Daily Check for Dues and Reminders
exports.checkDuesAndReminders = (0, scheduler_1.onSchedule)({
    schedule: "every 24 hours",
    timeZone: "America/New_York",
    region: "us-central1"
}, async (event) => {
    const now = new Date(); // This is a new Date object, always valid.
    try {
        const snapshot = await db.collection('applications')
            .where('status', 'in', ['APPROVED', 'DELINQUENT'])
            .get();
        for (const doc of snapshot.docs) {
            const data = doc.data();
            // Skip dues-exempt churches
            if (data.duesExempt)
                continue;
            if (!data.nextDueDate)
                continue;
            // Ensure nextDueDate is a valid date before using it
            const dueDate = new Date(data.nextDueDate);
            if (isNaN(dueDate.getTime())) {
                console.warn(`Invalid nextDueDate found for doc ${doc.id}: ${data.nextDueDate}. Skipping reminder/delinquency check.`);
                continue;
            }
            const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            // Determine the effective "next payment due" date for installment plans
            const hasInstallmentPlan = data.paymentPlan && data.paymentPlan !== 'annual';
            const installmentDueDate = hasInstallmentPlan && data.nextInstallmentDue ? new Date(data.nextInstallmentDue) : null;
            const effectiveDueDate = installmentDueDate && !isNaN(installmentDueDate.getTime()) ? installmentDueDate : dueDate;
            const daysUntilEffectiveDue = Math.ceil((effectiveDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            // GRACE_PERIOD: 7 days after installment due date before marking delinquent
            const INSTALLMENT_GRACE_DAYS = 7;
            // If subscription is active, Stripe handles billing. 
            // If manual (one_time), we need to remind them.
            const isManual = data.paymentFrequency === 'one_time' || !data.paymentFrequency;
            if (isManual && data.status === 'APPROVED') {
                // Use the effective due date (installment due for installment plans, annual due for annual)
                const daysToCheck = hasInstallmentPlan ? daysUntilEffectiveDue : daysUntilDue;
                let templateType = '';
                let reminderType = '';
                // 30-day reminder: send if between 29-31 days before due (only for annual plans)
                if (!hasInstallmentPlan && daysToCheck >= 29 && daysToCheck <= 31) {
                    templateType = 'dues_reminder_30';
                    reminderType = '30-day';
                }
                // 7-day reminder: send if between 6-8 days before due
                else if (daysToCheck >= 6 && daysToCheck <= 8) {
                    templateType = hasInstallmentPlan ? 'dues_reminder_7' : 'dues_reminder_7';
                    reminderType = '7-day';
                }
                // Due today reminder: send if between -1 and 1 days
                else if (daysToCheck >= -1 && daysToCheck <= 1) {
                    templateType = hasInstallmentPlan ? 'dues_reminder_0' : 'dues_reminder_0';
                    reminderType = 'due-today';
                }
                if (templateType) {
                    const lastReminderType = data.lastReminderType;
                    const lastReminderSent = data.lastReminderSent ? new Date(data.lastReminderSent) : null;
                    const daysSinceLastReminder = lastReminderSent
                        ? Math.floor((now.getTime() - lastReminderSent.getTime()) / (1000 * 60 * 60 * 24))
                        : 999;
                    if (lastReminderType !== templateType || daysSinceLastReminder >= 3) {
                        const planLabel = data.paymentPlan === 'quarterly' ? 'quarterly' : data.paymentPlan === 'biannual' ? 'bi-annual' : 'annual';
                        console.log(`[Pre-Due Reminder] Sending ${reminderType} ${planLabel} reminder to ${data.churchName} (${daysToCheck} days until due)`);
                        const template = await getTemplate(templateType);
                        const subject = replaceVariables(template.subject, data);
                        const body = replaceVariables(template.body, data);
                        await sendEmailBatch([data.applicantEmail], subject, body, SYSTEM_SENDER);
                        await doc.ref.update({
                            lastReminderSent: toSafeISOString(now),
                            lastReminderType: templateType,
                            reminderCount: (data.reminderCount || 0) + 1
                        });
                        console.log(`[Pre-Due Reminder] Sent ${reminderType} reminder to ${data.churchName}`);
                    }
                    else {
                        console.log(`[Pre-Due Reminder] Skipping ${data.churchName} - ${reminderType} reminder already sent ${daysSinceLastReminder} days ago`);
                    }
                }
            }
            // Handling Delinquency
            // For installment plans: check if installment is overdue past grace period
            // For annual plans: check if annual due date has passed
            const isOverdue = hasInstallmentPlan
                ? (daysUntilEffectiveDue < -INSTALLMENT_GRACE_DAYS) // Past grace period
                : (daysUntilDue < 0); // Past due date
            if (isOverdue) {
                if (data.status === 'APPROVED') {
                    await doc.ref.update({
                        status: 'DELINQUENT',
                        lastReminderSent: toSafeISOString(now),
                        reminderCount: 1,
                        lastReminderType: 'dues_delinquent'
                    });
                    console.log(`[Delinquency] Marked ${data.churchName} as DELINQUENT (plan: ${data.paymentPlan || 'annual'})`);
                    const template = await getTemplate('dues_delinquent');
                    const subject = replaceVariables(template.subject, data);
                    const body = replaceVariables(template.body, data);
                    await sendEmailBatch([data.applicantEmail], subject, body, SYSTEM_SENDER);
                    console.log(`[Delinquency] Sent initial delinquent email to ${data.churchName}`);
                }
                // Send Weekly Delinquent Reminder
                if (data.status === 'DELINQUENT') {
                    const lastReminder = data.lastReminderSent ? new Date(data.lastReminderSent) : null;
                    const daysSinceLastReminder = lastReminder
                        ? Math.floor((now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60 * 24))
                        : 999;
                    if (daysSinceLastReminder >= 7) {
                        console.log(`[Delinquency] Sending weekly reminder to ${data.churchName} (${daysSinceLastReminder} days since last)`);
                        const template = await getTemplate('dues_delinquent');
                        const subject = replaceVariables(template.subject, data);
                        const body = replaceVariables(template.body, data);
                        await sendEmailBatch([data.applicantEmail], subject, body, SYSTEM_SENDER);
                        await doc.ref.update({
                            lastReminderSent: toSafeISOString(now),
                            reminderCount: (data.reminderCount || 0) + 1,
                            lastReminderType: 'dues_delinquent'
                        });
                        console.log(`[Delinquency] Weekly reminder sent to ${data.churchName} (reminder #${(data.reminderCount || 0) + 1})`);
                    }
                    else {
                        console.log(`[Delinquency] Skipping ${data.churchName} - only ${daysSinceLastReminder} days since last reminder`);
                    }
                }
            }
        }
    }
    catch (error) {
        console.error("Error in checkDuesAndReminders:", error);
    }
});
exports.sendEmailV2 = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated.");
    }
    const { recipients, subject, html, from } = request.data;
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "Recipients must be a non-empty array.");
    }
    if (!subject || !html) {
        throw new https_1.HttpsError("invalid-argument", "Subject and content are required.");
    }
    try {
        return await sendEmailBatch(recipients, subject, html, from);
    }
    catch (error) {
        console.error("sendEmail failed:", error);
        throw new https_1.HttpsError("internal", `Email failed: ${error.message}`);
    }
});
/**
 * Synchronizes the subscription status from Stripe to Firestore.
 * This is primarily used when a user returns from the Stripe Billing Portal
 * or to periodically ensure the frontend displays the correct subscription status.
 */
exports.syncSubscriptionStatus = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated.");
    }
    const { churchId } = request.data;
    if (!churchId) {
        throw new https_1.HttpsError("invalid-argument", "churchId is required.");
    }
    try {
        const docRef = db.collection('applications').doc(churchId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            throw new https_1.HttpsError("not-found", "Church application not found.");
        }
        const appData = docSnap.data(); // Cast to ChurchApplication
        if (!appData) {
            throw new https_1.HttpsError("not-found", "No data for application.");
        }
        const { stripeSubscriptionId } = appData;
        if (!stripeSubscriptionId) {
            console.log(`Church ${churchId} does not have a Stripe subscription ID. No sync needed.`);
            return { success: true, message: "No active subscription to sync." };
        }
        let subscription;
        try {
            // Attempt to retrieve with the live key first
            subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        }
        catch (error) {
            // If it fails because the subscription doesn't exist, try the test key
            if (error.code === 'resource_missing') {
                console.log(`Subscription ${stripeSubscriptionId} not found with live key, trying test key.`);
                try {
                    subscription = await stripeTest.subscriptions.retrieve(stripeSubscriptionId);
                }
                catch (testError) {
                    console.error(`Subscription ${stripeSubscriptionId} not found with test key either.`);
                    // Rethrow the original error if it fails with the test key too
                    throw error;
                }
            }
            else {
                // For other errors, rethrow them
                throw error;
            }
        }
        // If the subscription is set to cancel at period end, update paymentFrequency to 'one_time'
        // This correctly changes the UI display from "Auto-Renew" to "Year"
        if (subscription.cancel_at_period_end) {
            if (appData.paymentFrequency !== 'one_time') {
                await docRef.update({
                    paymentFrequency: 'one_time',
                    updatedAt: toSafeISOString(new Date())
                });
                console.log(`Church ${churchId}: Subscription ${stripeSubscriptionId} is set to cancel. Updated paymentFrequency to 'one_time'.`);
                return { success: true, message: "Subscription status synced: auto-renew canceled." };
            }
            return { success: true, message: "Subscription status already 'one_time' due to cancellation." };
        }
        else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
            // If the subscription is actually canceled or unpaid, mark as delinquent and update frequency
            if (appData.status !== 'DELINQUENT') {
                await docRef.update({
                    status: 'DELINQUENT',
                    paymentFrequency: 'one_time',
                    updatedAt: toSafeISOString(new Date())
                });
                console.log(`Church ${churchId}: Subscription ${stripeSubscriptionId} is ${subscription.status}. Marked as DELINQUENT and set paymentFrequency to 'one_time'.`);
                return { success: true, message: "Subscription status synced: subscription canceled/unpaid." };
            }
            return { success: true, message: "Subscription already delinquent." };
        }
        else if (appData.paymentFrequency !== 'yearly' && subscription.status === 'active') {
            // If subscription is active but frontend shows one_time (e.g., re-subscribed)
            await docRef.update({
                paymentFrequency: 'yearly',
                updatedAt: toSafeISOString(new Date())
            });
            console.log(`Church ${churchId}: Subscription ${stripeSubscriptionId} is active. Updated paymentFrequency to 'yearly'.`);
            return { success: true, message: "Subscription status synced: subscription active and yearly." };
        }
        console.log(`Church ${churchId}: Subscription ${stripeSubscriptionId} status is current. No update needed.`);
        return { success: true, message: "Subscription status is current." };
    }
    catch (error) {
        console.error("Error syncing subscription status:", error);
        if (error.code === 'resource_missing' && ((_a = error.raw) === null || _a === void 0 ? void 0 : _a.param) === 'subscription') {
            // Handle cases where the subscription might have been deleted in Stripe
            try {
                const docRef = db.collection('applications').doc(churchId);
                const appData = (await docRef.get()).data(); // Cast here too
                if ((appData === null || appData === void 0 ? void 0 : appData.paymentFrequency) === 'yearly') {
                    await docRef.update({
                        paymentFrequency: 'one_time',
                        'stripeSubscriptionId': admin.firestore.FieldValue.delete(),
                        updatedAt: toSafeISOString(new Date())
                    });
                    console.warn(`Church ${churchId}: Stripe subscription ${appData.stripeSubscriptionId} not found. Removed ID and set paymentFrequency to 'one_time'.`);
                    return { success: true, message: "Subscription ID removed, payment frequency set to one-time." };
                }
            }
            catch (dbError) {
                console.error("Error updating Firestore after missing Stripe subscription:", dbError);
                throw new https_1.HttpsError("internal", `Failed to update Firestore after missing Stripe subscription: ${dbError}`);
            }
        }
        throw new https_1.HttpsError("internal", error.message);
    }
});
exports.resendSystemEmailV2 = (0, https_1.onCall)({ cors: true }, async (request) => {
    // 1. Auth Check
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated.");
    }
    const { churchId, type } = request.data;
    if (!churchId || !type) {
        throw new https_1.HttpsError("invalid-argument", "churchId and type are required.");
    }
    try {
        const appDoc = await db.collection('applications').doc(churchId).get();
        if (!appDoc.exists) {
            throw new https_1.HttpsError("not-found", "Church application not found.");
        }
        const application = appDoc.data();
        if (!application || !application.applicantEmail) {
            throw new https_1.HttpsError("failed-precondition", "Application has no email.");
        }
        const template = await getTemplate(type);
        const subject = replaceVariables(template.subject, application);
        // For emails that need a password setup link, generate a fresh long-lived one.
        // (Issuing a new token automatically invalidates any prior unused tokens for this email.)
        let templateData = Object.assign({}, application);
        if (type === 'application_provisional_approved' || type === 'portal_account_setup') {
            const authAdmin = (0, auth_1.getAuth)(admin.app());
            let userId = application.userId;
            if (!userId) {
                try {
                    const u = await authAdmin.getUserByEmail(application.applicantEmail);
                    userId = u.uid;
                }
                catch (err) {
                    if (err.code === 'auth/user-not-found') {
                        const created = await authAdmin.createUser({
                            email: application.applicantEmail,
                            emailVerified: false,
                            disabled: false,
                        });
                        userId = created.uid;
                        await db.collection('applications').doc(churchId).update({ userId });
                    }
                    else {
                        throw err;
                    }
                }
            }
            const resetLink = await createPasswordSetupLink(application.applicantEmail, userId, churchId);
            console.log(`Generated fresh password setup link for resend to ${application.applicantEmail}`);
            templateData.resetLink = resetLink;
        }
        const body = replaceVariables(template.body, templateData);
        console.log(`Attempting to resend ${type} email to ${application.applicantEmail} from ${SYSTEM_SENDER}`);
        return await sendEmailBatch([application.applicantEmail], subject, body, SYSTEM_SENDER);
    }
    catch (error) {
        console.error("resendSystemEmail failed:", error);
        // Return the actual error message to the client
        throw new https_1.HttpsError("unknown", `Resend failed: ${error.message || error}`);
    }
});
// TRIGGER: On Application Created
exports.onApplicationCreatedV2 = (0, firestore_2.onDocumentCreated)({
    document: "applications/{id}",
    database: DATABASE_ID
}, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const application = snap.data();
    const applicationId = snap.id;
    if (!application)
        return;
    // Async tasks: email and geocoding
    const promises = [];
    // 1. Send "application received" email to applicant
    if (application.applicantEmail) {
        const emailPromise = (async () => {
            try {
                const template = await getTemplate('application_received');
                const subject = replaceVariables(template.subject, application);
                const body = replaceVariables(template.body, application);
                await sendEmailBatch([application.applicantEmail], subject, body, SYSTEM_SENDER);
                console.log(`Sent 'application_received' email to ${application.applicantEmail}`);
            }
            catch (error) {
                console.error("Error sending application received email:", error);
            }
        })();
        promises.push(emailPromise);
    }
    // 2. Send admin notification email to saniol@g3min.org
    const adminEmailPromise = (async () => {
        try {
            const template = await getTemplate('admin_application_notification');
            const subject = replaceVariables(template.subject, application);
            const body = replaceVariables(template.body, application);
            await sendEmailBatch(['saniol@g3min.org'], subject, body, SYSTEM_SENDER);
            console.log(`Sent 'admin_application_notification' email to saniol@g3min.org for ${application.churchName}`);
        }
        catch (error) {
            console.error("Error sending admin notification email:", error);
        }
    })();
    promises.push(adminEmailPromise);
    // 3. Geocode the address
    const geocodePromise = (async () => {
        if (application.churchAddress && !application.coordinates) {
            try {
                const addr = application.churchAddress;
                const addressString = `${addr.street}, ${addr.city}, ${addr.state} ${addr.postalCode}, ${addr.country}`;
                console.log(`Geocoding address with Mapbox: ${addressString}`);
                const response = await axios_1.default.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressString)}.json`, {
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
                }
                else {
                    console.warn(`Geocoding failed for ${application.churchName}: No features found.`);
                }
            }
            catch (error) {
                console.error(`Error geocoding address for ${application.churchName}:`, error);
            }
        }
    })();
    promises.push(geocodePromise);
    // Wait for all async operations to complete
    await Promise.all(promises);
});
// TRIGGER: On Application Created -> Sync to Shopify
exports.onApplicationCreatedShopifySync = (0, firestore_2.onDocumentCreated)({
    document: "applications/{id}",
    database: DATABASE_ID
}, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const application = snap.data();
    if (!application)
        return;
    console.log(`Received application for Shopify sync: ${application.applicantEmail}`);
    const { SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_STORE_NAME, } = process.env;
    if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET || !SHOPIFY_STORE_NAME) {
        console.error("Shopify API credentials are not set in environment variables.");
        return;
    }
    const sanitizedStoreName = SHOPIFY_STORE_NAME.replace(/\s+/g, '-').toLowerCase();
    try {
        const shopify = (0, shopify_api_1.shopifyApi)({
            apiKey: SHOPIFY_API_KEY,
            apiSecretKey: SHOPIFY_API_SECRET,
            scopes: ['read_customers', 'write_customers'],
            hostName: `${sanitizedStoreName}.myshopify.com`,
            apiVersion: shopify_api_1.ApiVersion.April24,
            isEmbeddedApp: false,
        });
        const session = new shopify_api_1.Session({
            shop: `${sanitizedStoreName}.myshopify.com`,
            accessToken: SHOPIFY_API_SECRET,
            isOnline: false,
            id: "offline_session_for_g3_network",
            state: "offline_state"
        });
        const client = new shopify.clients.Rest({
            session: session,
        });
        const customerData = {
            customer: {
                first_name: application.applicantFirstName,
                last_name: application.applicantLastName,
                email: application.applicantEmail,
                tags: "G3 Church Network",
            },
        };
        const response = await client.post({
            path: 'customers',
            data: customerData,
        });
        const responseBody = response.body;
        if (responseBody.customer && responseBody.customer.id) {
            console.log(`Successfully created customer in Shopify: ${application.applicantEmail}`);
        }
        else {
            console.error(`Failed to create customer in Shopify. Body:`, responseBody);
        }
    }
    catch (error) {
        console.error("Error syncing customer to Shopify:", error);
    }
});
// TRIGGER: On Application Updated -> Sync to Shopify
exports.onApplicationUpdatedShopifySync = (0, firestore_2.onDocumentUpdated)({
    document: "applications/{id}",
    database: DATABASE_ID
}, async (event) => {
    var _a, _b;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after) {
        console.log("No data found in update event.");
        return;
    }
    const nameChanged = before.applicantFirstName !== after.applicantFirstName || before.applicantLastName !== after.applicantLastName;
    const emailChanged = before.applicantEmail !== after.applicantEmail;
    if (!nameChanged && !emailChanged) {
        console.log("No relevant fields changed for Shopify sync.");
        return;
    }
    console.log(`Received application update for Shopify sync: ${after.applicantEmail}`);
    const { SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_STORE_NAME, } = process.env;
    if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET || !SHOPIFY_STORE_NAME) {
        console.error("Shopify API credentials are not set in environment variables.");
        return;
    }
    const sanitizedStoreName = SHOPIFY_STORE_NAME.replace(/\s+/g, '-').toLowerCase();
    try {
        const shopify = (0, shopify_api_1.shopifyApi)({
            apiKey: SHOPIFY_API_KEY,
            apiSecretKey: SHOPIFY_API_SECRET,
            scopes: ['read_customers', 'write_customers'],
            hostName: `${sanitizedStoreName}.myshopify.com`,
            apiVersion: shopify_api_1.ApiVersion.April24,
            isEmbeddedApp: false,
        });
        const session = new shopify_api_1.Session({
            shop: `${sanitizedStoreName}.myshopify.com`,
            accessToken: SHOPIFY_API_SECRET,
            isOnline: false,
            id: "offline_session_for_g3_network_update",
            state: "offline_state"
        });
        const client = new shopify.clients.Rest({
            session: session,
        });
        // Search for customer by new email first, then old email
        let searchResponse = await client.get({
            path: 'customers/search',
            query: {
                query: `email:${after.applicantEmail}`,
            },
        });
        let customers = searchResponse.body.customers;
        if (!customers || customers.length === 0) {
            searchResponse = await client.get({
                path: 'customers/search',
                query: {
                    query: `email:${before.applicantEmail}`,
                },
            });
            customers = searchResponse.body.customers;
        }
        if (customers && customers.length > 0) {
            const customerId = customers[0].id;
            const customerData = {
                customer: {
                    id: customerId,
                    first_name: after.applicantFirstName,
                    last_name: after.applicantLastName,
                    email: after.applicantEmail,
                    tags: "G3 Church Network",
                },
            };
            const updateResponse = await client.put({
                path: `customers/${customerId}`,
                data: customerData,
            });
            const responseBody = updateResponse.body;
            if (responseBody.customer && responseBody.customer.id) {
                console.log(`Successfully updated customer in Shopify: ${after.applicantEmail}`);
            }
            else {
                console.error(`Failed to update customer in Shopify. Body:`, responseBody);
            }
        }
        else {
            console.warn(`Could not find customer with email ${before.applicantEmail} to update. Creating a new one.`);
            const customerData = {
                customer: {
                    first_name: after.applicantFirstName,
                    last_name: after.applicantLastName,
                    email: after.applicantEmail,
                    tags: "G3 Church Network",
                },
            };
            const createResponse = await client.post({
                path: 'customers',
                data: customerData,
            });
            const responseBody = createResponse.body;
            if (responseBody.customer && responseBody.customer.id) {
                console.log(`Successfully created new customer in Shopify during update: ${after.applicantEmail}`);
            }
            else {
                console.error(`Failed to create new customer in Shopify during update. Body:`, responseBody);
            }
        }
    }
    catch (error) {
        console.error("Error syncing customer update to Shopify:", error);
    }
});
// TRIGGER: On Application Updated (Status Change and Address Updates)
exports.onApplicationStatusUpdatedV2 = (0, firestore_2.onDocumentUpdated)({
    document: "applications/{id}",
    database: DATABASE_ID
}, async (event) => {
    const change = event.data;
    if (!change)
        return;
    const newData = change.after.data();
    const oldData = change.before.data();
    const applicationId = event.params.id;
    if (!newData || !oldData)
        return;
    // Handle status change emails
    if (newData.status !== oldData.status) {
        try {
            let type = '';
            // When moving to APPROVED from PROVISIONAL_APPROVED (after payment), send full welcome
            if (newData.status === 'APPROVED' && oldData.status === 'PROVISIONAL_APPROVED') {
                type = 'application_fully_approved';
            }
            // When moving to APPROVED from any other status (legacy flow), send standard approval
            else if (newData.status === 'APPROVED') {
                type = 'application_approved';
            }
            else if (newData.status === 'REJECTED') {
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
        }
        catch (error) {
            console.error("Error in onApplicationStatusUpdated:", error);
        }
    }
    // Handle address changes and trigger coordinate recalculation
    const hasAddressChanged = () => {
        const oldAddr = oldData.churchAddress;
        const newAddr = newData.churchAddress;
        if (!oldAddr && !newAddr)
            return false;
        if (!oldAddr || !newAddr)
            return true;
        return (oldAddr.street !== newAddr.street ||
            oldAddr.aptUnit !== newAddr.aptUnit ||
            oldAddr.city !== newAddr.city ||
            oldAddr.state !== newAddr.state ||
            oldAddr.postalCode !== newAddr.postalCode ||
            oldAddr.country !== newAddr.country);
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
            const response = await axios_1.default.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressString)}.json`, {
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
            }
            else {
                console.warn(`Geocoding failed for updated address of ${newData.churchName || 'church'} [${applicationId}]: No features found`);
                // Optionally clear coordinates if geocoding fails
                await db.collection('applications').doc(applicationId).update({ coordinates: null });
            }
        }
        catch (error) {
            console.error(`Error geocoding updated address for ${newData.churchName || 'church'} [${applicationId}]:`, error);
            // Don't throw error to avoid breaking other operations
        }
    }
});
// ------------------------------------------------------------------
// STATISTICS & CONTACT FUNCTIONS
// ------------------------------------------------------------------
exports.sendAdminContactEmail = (0, https_1.onCall)({ cors: true }, async (request) => {
    const { senderName, senderEmail, message } = request.data;
    if (!senderName || !senderEmail || !message) {
        throw new https_1.HttpsError("invalid-argument", "All fields are required.");
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
    }
    catch (error) {
        console.error("Error sending contact email:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
exports.sendChurchContactEmail = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated.");
    }
    const { churchId, senderName, senderEmail, message } = request.data;
    if (!churchId || !senderName || !senderEmail || !message) {
        throw new https_1.HttpsError("invalid-argument", "All fields are required.");
    }
    try {
        // Get church information
        const churchDoc = await db.collection('applications').doc(churchId).get();
        if (!churchDoc.exists) {
            throw new https_1.HttpsError("not-found", "Church not found.");
        }
        const church = churchDoc.data();
        if (!church || !church.churchEmail) {
            throw new https_1.HttpsError("failed-precondition", "Church has no email address.");
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
        }
        else {
            await statsRef.set({
                churchId,
                visits: 0,
                contacts: 1,
                views: 0,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        return { success: true, message: "Contact email sent successfully." };
    }
    catch (error) {
        console.error("Error sending contact email:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
exports.incrementChurchStatistic = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated.");
    }
    const { churchId, type } = request.data;
    if (!churchId || !type) {
        throw new https_1.HttpsError("invalid-argument", "churchId and type are required.");
    }
    if (!['visits', 'contacts', 'views'].includes(type)) {
        throw new https_1.HttpsError("invalid-argument", "type must be 'visits', 'contacts', or 'views'.");
    }
    try {
        const statsRef = db.collection('churchStats').doc(churchId);
        const statsDoc = await statsRef.get();
        if (statsDoc.exists) {
            await statsRef.update({
                [type]: admin.firestore.FieldValue.increment(1),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        else {
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
    }
    catch (error) {
        console.error(`Error incrementing ${type} for ${churchId}:`, error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
// ------------------------------------------------------------------
// ADMIN USER MANAGEMENT FUNCTIONS
// ------------------------------------------------------------------
exports.getAllUsers = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!isAdmin(request)) {
        throw new https_1.HttpsError("permission-denied", "Only administrators can list all users.");
    }
    try {
        const listUsersResult = await (0, auth_1.getAuth)(admin.app()).listUsers(1000); // List up to 1000 users
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
    }
    catch (error) {
        console.error("Error listing users:", error);
        throw new https_1.HttpsError("internal", "Failed to list users: " + error.message);
    }
});
exports.setAdminClaim = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!isAdmin(request)) {
        throw new https_1.HttpsError("permission-denied", "Only administrators can set admin claims.");
    }
    const { uid, role } = request.data;
    if (!uid || role !== 'admin') {
        throw new https_1.HttpsError("invalid-argument", "UID and role 'admin' are required.");
    }
    try {
        await (0, auth_1.getAuth)(admin.app()).setCustomUserClaims(uid, { admin: true });
        // Also ensure the Firestore user profile is updated
        await db.collection('userProfiles').doc(uid).update({ role: 'admin' });
        console.log(`Custom claim 'admin' set for user ${uid}.`);
        return { success: true };
    }
    catch (error) {
        console.error("Error setting custom admin claim:", error);
        throw new https_1.HttpsError("internal", "Failed to set admin claim: " + error.message);
    }
});
exports.removeAdminClaim = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!isAdmin(request)) {
        throw new https_1.HttpsError("permission-denied", "Only administrators can remove admin claims.");
    }
    const { uid } = request.data;
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "UID is required.");
    }
    try {
        await (0, auth_1.getAuth)(admin.app()).setCustomUserClaims(uid, { admin: false });
        // Also ensure the Firestore user profile is updated
        await db.collection('userProfiles').doc(uid).update({ role: 'guest' });
        console.log(`Custom claim 'admin' removed for user ${uid}.`);
        return { success: true };
    }
    catch (error) {
        console.error("Error removing custom admin claim:", error);
        throw new https_1.HttpsError("internal", "Failed to remove admin claim: " + error.message);
    }
});
exports.createAdminUser = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!isAdmin(request)) {
        throw new https_1.HttpsError("permission-denied", "Only administrators can create other admin users.");
    }
    const { email, password } = request.data;
    if (!email || !password) {
        throw new https_1.HttpsError("invalid-argument", "Email and password are required.");
    }
    try {
        const userRecord = await (0, auth_1.getAuth)(admin.app()).createUser({
            email,
            password,
            emailVerified: true,
            disabled: false,
        });
        await (0, auth_1.getAuth)(admin.app()).setCustomUserClaims(userRecord.uid, { admin: true });
        // A Firestore userProfile will be created on the client side in services/firebase.ts
        console.log(`New admin user created with UID: ${userRecord.uid}`);
        return userRecord.uid;
    }
    catch (error) {
        console.error("Error creating admin user:", error);
        if (error.code === 'auth/email-already-exists') {
            throw new https_1.HttpsError("already-exists", "The email address is already in use by another user.");
        }
        throw new https_1.HttpsError("internal", "Failed to create admin user: " + error.message);
    }
});
exports.deleteUser = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!isAdmin(request)) {
        throw new https_1.HttpsError("permission-denied", "Only administrators can delete users.");
    }
    const { uid } = request.data;
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "UID is required.");
    }
    // Prevent deleting yourself
    if (request.auth && request.auth.uid === uid) {
        throw new https_1.HttpsError("failed-precondition", "You cannot delete your own account.");
    }
    try {
        // Delete the user's Firestore profile if it exists
        try {
            await db.collection('userProfiles').doc(uid).delete();
            console.log(`Deleted Firestore profile for user ${uid}`);
        }
        catch (error) {
            console.warn(`No Firestore profile found for user ${uid}, continuing with auth deletion`);
        }
        // Delete the user from Firebase Authentication
        await (0, auth_1.getAuth)(admin.app()).deleteUser(uid);
        console.log(`Successfully deleted user ${uid} from Authentication`);
        return { success: true, message: "User deleted successfully" };
    }
    catch (error) {
        console.error("Error deleting user:", error);
        throw new https_1.HttpsError("internal", "Failed to delete user: " + error.message);
    }
});
exports.changeUserPassword = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!isAdmin(request)) {
        throw new https_1.HttpsError("permission-denied", "Only administrators can change user passwords.");
    }
    const { uid, newPassword } = request.data;
    if (!uid || !newPassword) {
        throw new https_1.HttpsError("invalid-argument", "UID and newPassword are required.");
    }
    if (newPassword.length < 6) {
        throw new https_1.HttpsError("invalid-argument", "Password must be at least 6 characters.");
    }
    try {
        // Update the user's password
        await (0, auth_1.getAuth)(admin.app()).updateUser(uid, {
            password: newPassword,
        });
        console.log(`Successfully changed password for user ${uid}`);
        return { success: true, message: "Password changed successfully" };
    }
    catch (error) {
        console.error("Error changing user password:", error);
        throw new https_1.HttpsError("internal", "Failed to change password: " + error.message);
    }
});
exports.sendPasswordResetEmail = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!isAdmin(request)) {
        throw new https_1.HttpsError("permission-denied", "Only administrators can send password reset emails.");
    }
    const { email } = request.data;
    if (!email) {
        throw new https_1.HttpsError("invalid-argument", "Email is required.");
    }
    try {
        // Generate password reset link
        const link = await (0, auth_1.getAuth)(admin.app()).generatePasswordResetLink(email, {
            url: CHURCH_LOGIN_URL
        });
        // Send email with the reset link
        const subject = "Password Reset Request - G3 Church Network";
        const body = `
      <p>You requested a password reset for your G3 Church Network account.</p>
      <p>Click the link below to reset your password:</p>
      <p><a href="${link}">Reset Your Password</a></p>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
      <p>Grace and peace,<br>G3 Church Network Team</p>
    `;
        await sendEmailBatch([email], subject, body, SYSTEM_SENDER);
        console.log(`Sent password reset email to ${email}`);
        return { success: true, message: "Password reset email sent successfully" };
    }
    catch (error) {
        console.error("Error sending password reset email:", error);
        throw new https_1.HttpsError("internal", "Failed to send password reset email: " + error.message);
    }
});
/**
 * Validate a password setup token and return basic info so the
 * /setup-password page can confirm to the church which account
 * they're about to set a password for. Public (no auth) — the token
 * itself is the bearer credential.
 */
exports.getSetupTokenInfo = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    const { token } = request.data || {};
    if (!token || typeof token !== 'string') {
        throw new https_1.HttpsError("invalid-argument", "Token is required.");
    }
    const docRef = db.collection(SETUP_TOKENS_COLLECTION).doc(token);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
        throw new https_1.HttpsError("not-found", "This setup link is invalid. Please request a new one.");
    }
    const data = docSnap.data();
    if (data.used) {
        throw new https_1.HttpsError("failed-precondition", "This setup link has already been used. If you need to reset your password, use the Forgot Password link on the login page.");
    }
    let churchName = null;
    if (data.applicationId) {
        try {
            const appDoc = await db.collection('applications').doc(data.applicationId).get();
            if (appDoc.exists) {
                churchName = ((_a = appDoc.data()) === null || _a === void 0 ? void 0 : _a.churchName) || null;
            }
        }
        catch (err) {
            // Non-fatal — the page can still proceed without the church name
            console.warn(`Could not load application ${data.applicationId} for token info:`, err);
        }
    }
    return {
        success: true,
        email: data.email,
        churchName,
    };
});
/**
 * Consume a password setup token: set the user's password via the
 * Admin SDK and mark the token as used. Public (no auth) — the token
 * itself is the bearer credential.
 */
exports.setupAccountPassword = (0, https_1.onCall)({ cors: true }, async (request) => {
    const { token, newPassword } = request.data || {};
    if (!token || typeof token !== 'string') {
        throw new https_1.HttpsError("invalid-argument", "Token is required.");
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        throw new https_1.HttpsError("invalid-argument", "Password must be at least 8 characters.");
    }
    const docRef = db.collection(SETUP_TOKENS_COLLECTION).doc(token);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
        throw new https_1.HttpsError("not-found", "This setup link is invalid. Please request a new one.");
    }
    const data = docSnap.data();
    if (data.used) {
        throw new https_1.HttpsError("failed-precondition", "This setup link has already been used.");
    }
    try {
        await (0, auth_1.getAuth)(admin.app()).updateUser(data.userId, {
            password: newPassword,
            emailVerified: true,
        });
    }
    catch (err) {
        console.error(`Failed to set password for user ${data.userId}:`, err);
        throw new https_1.HttpsError("internal", "Failed to set password: " + (err.message || err));
    }
    await docRef.update({
        used: true,
        usedAt: new Date().toISOString(),
    });
    console.log(`Password setup completed for ${data.email} (uid=${data.userId})`);
    return {
        success: true,
        email: data.email,
        loginUrl: CHURCH_LOGIN_URL,
    };
});
exports.backfillGeocodes = (0, https_1.onCall)({ cors: true, timeoutSeconds: 300 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be an authenticated admin to run this.");
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
                    const response = await axios_1.default.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressString)}.json`, {
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
                    }
                    else {
                        console.warn(`Geocoding not found for ${application.churchName} [${applicationId}]`);
                        await doc.ref.update({ coordinates: 'failed' }); // Mark as failed to avoid retrying
                        failCount++;
                    }
                }
                catch (error) {
                    console.error(`Error geocoding ${application.churchName} [${applicationId}]:`, error);
                    await doc.ref.update({ coordinates: 'failed' }); // Mark as failed
                    failCount++;
                }
            }
            else {
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
    }
    catch (error) {
        console.error("Error during geocode backfill process:", error);
        throw new https_1.HttpsError("internal", "An error occurred during the backfill.", {
            message: error.message,
        });
    }
});
exports.regeocodeAddress = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be an authenticated admin to run this.");
    }
    const { churchId } = request.data;
    if (!churchId) {
        throw new https_1.HttpsError("invalid-argument", "churchId is required.");
    }
    console.log(`Re-geocoding address for church: ${churchId}`);
    try {
        const docRef = db.collection('applications').doc(churchId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            throw new https_1.HttpsError("not-found", "Church application not found.");
        }
        const application = docSnap.data();
        if (!application || !application.churchAddress) {
            throw new https_1.HttpsError("failed-precondition", "Application has no address to geocode.");
        }
        const addr = application.churchAddress;
        const addressString = `${addr.street || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.postalCode || ''}, ${addr.country || ''}`.replace(/,\s*,/g, ',').trim();
        // Skip geocoding if address is incomplete
        if (!addr.city || !addr.country) {
            console.warn(`Incomplete address for re-geocoding church ${churchId}. City or country is missing.`);
            throw new https_1.HttpsError("failed-precondition", "Incomplete address: city and country are required for geocoding.");
        }
        console.log(`Attempting to re-geocode address for ${churchId}: ${addressString}`);
        const response = await axios_1.default.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressString)}.json`, {
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
        }
        else {
            console.warn(`Re-geocoding failed for ${application.churchName}: No features found.`);
            await docRef.update({ coordinates: 'failed' });
            throw new https_1.HttpsError("not-found", "Address could not be geocoded.");
        }
    }
    catch (error) {
        console.error(`Error re-geocoding address for ${churchId}:`, error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError("internal", "An unexpected error occurred during re-geocoding.");
    }
});
// ------------------------------------------------------------------
// ENHANCED STATISTICS & ANALYTICS FUNCTIONS
// ------------------------------------------------------------------
/**
 * Log a detailed event with metadata
 */
exports.logChurchEvent = (0, https_1.onCall)({ cors: true }, async (request) => {
    const { churchId, type, metadata } = request.data;
    if (!churchId || !type) {
        throw new https_1.HttpsError("invalid-argument", "churchId and type are required.");
    }
    const validTypes = ['view', 'contact', 'visit', 'email_sent', 'email_opened', 'email_clicked', 'social_click'];
    if (!validTypes.includes(type)) {
        throw new https_1.HttpsError("invalid-argument", `type must be one of: ${validTypes.join(', ')}`);
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
        const updates = {
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
    }
    catch (error) {
        console.error(`Error logging event for ${churchId}:`, error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
/**
 * Get comprehensive analytics for a specific church
 */
exports.getChurchAnalytics = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated.");
    }
    const { churchId } = request.data;
    if (!churchId) {
        throw new https_1.HttpsError("invalid-argument", "churchId is required.");
    }
    try {
        // Get church info
        const churchDoc = await db.collection('applications').doc(churchId).get();
        if (!churchDoc.exists) {
            throw new https_1.HttpsError("not-found", "Church not found.");
        }
        const church = churchDoc.data();
        // Get total stats
        const statsDoc = await db.collection('churchStats').doc(churchId).get();
        const stats = statsDoc.exists ? (statsDoc.data() || {}) : {};
        const totalStats = {
            views: stats.views || 0,
            contacts: stats.contacts || 0,
            visits: stats.visits || 0,
            socialClicks: stats.socialClicks || 0
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
        let lastActivity = null;
        const socialPlatforms = {};
        eventsSnapshot.forEach(doc => {
            var _a, _b;
            const event = doc.data();
            const timestamp = (_a = event.timestamp) === null || _a === void 0 ? void 0 : _a.toDate();
            if (timestamp) {
                if (!lastActivity || timestamp > lastActivity) {
                    lastActivity = timestamp;
                }
                // Count for 30-day period
                if (event.type === 'view')
                    last30Days.views++;
                else if (event.type === 'contact')
                    last30Days.contacts++;
                else if (event.type === 'visit')
                    last30Days.visits++;
                else if (event.type === 'social_click') {
                    last30Days.socialClicks++;
                    const platform = (_b = event.metadata) === null || _b === void 0 ? void 0 : _b.platform;
                    if (platform) {
                        socialPlatforms[platform] = (socialPlatforms[platform] || 0) + 1;
                    }
                }
                // Count for 7-day period
                if (timestamp >= sevenDaysAgo) {
                    if (event.type === 'view')
                        last7Days.views++;
                    else if (event.type === 'contact')
                        last7Days.contacts++;
                    else if (event.type === 'visit')
                        last7Days.visits++;
                    else if (event.type === 'social_click')
                        last7Days.socialClicks++;
                }
            }
        });
        // Find top social platform
        let topSocialPlatform;
        let maxClicks = 0;
        for (const [platform, clicks] of Object.entries(socialPlatforms)) {
            if (clicks > maxClicks) {
                maxClicks = clicks;
                topSocialPlatform = platform;
            }
        }
        const analytics = {
            churchId,
            churchName: (church === null || church === void 0 ? void 0 : church.churchName) || 'Unknown',
            total: totalStats,
            last30Days,
            last7Days,
            topSocialPlatform,
            lastActivity: lastActivity ? lastActivity.toISOString() : undefined
        };
        return analytics;
    }
    catch (error) {
        console.error(`Error getting analytics for ${churchId}:`, error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
/**
 * Get global analytics across all churches
 */
exports.getGlobalAnalytics = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!isAdmin(request)) {
        throw new https_1.HttpsError("permission-denied", "Only administrators can view global analytics.");
    }
    try {
        // Get all churches
        const churchesSnapshot = await db.collection('applications')
            .where('status', '==', 'APPROVED')
            .get();
        // Placeholder for future global analytics aggregation
        const promises = churchesSnapshot.docs.map(async (doc) => {
            var _a, _b;
            const church = doc.data();
            const statsDoc = await db.collection('churchStats').doc(doc.id).get();
            const stats = statsDoc.exists ? (statsDoc.data() || {}) : {};
            return {
                id: doc.id,
                churchName: church.churchName,
                city: (_a = church.churchAddress) === null || _a === void 0 ? void 0 : _a.city,
                country: (_b = church.churchAddress) === null || _b === void 0 ? void 0 : _b.country,
                views: stats.views || 0,
                contacts: stats.contacts || 0,
                visits: stats.visits || 0,
                socialClicks: stats.socialClicks || 0
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
            if (event.type === 'view')
                last30Days.views++;
            else if (event.type === 'contact')
                last30Days.contacts++;
            else if (event.type === 'visit')
                last30Days.visits++;
            else if (event.type === 'social_click')
                last30Days.socialClicks++;
        });
        // Geographic distribution
        const geoStats = {};
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
    }
    catch (error) {
        console.error("Error getting global analytics:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
/**
 * Get time-series data for charts
 */
exports.getTimeSeriesData = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b, _c;
    if (!isAdmin(request)) {
        throw new https_1.HttpsError("permission-denied", "Only administrators can view time-series data.");
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
        const dataByDate = {};
        snapshot.forEach(doc => {
            var _a;
            const event = doc.data();
            const timestamp = (_a = event.timestamp) === null || _a === void 0 ? void 0 : _a.toDate();
            if (timestamp) {
                const dateStr = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
                if (!dataByDate[dateStr]) {
                    dataByDate[dateStr] = { views: 0, contacts: 0, visits: 0 };
                }
                if (event.type === 'view')
                    dataByDate[dateStr].views++;
                else if (event.type === 'contact')
                    dataByDate[dateStr].contacts++;
                else if (event.type === 'visit')
                    dataByDate[dateStr].visits++;
            }
        });
        // Fill in missing dates with zeros
        const timeSeriesData = [];
        for (let i = 0; i < days; i++) {
            const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            const dateStr = date.toISOString().split('T')[0];
            timeSeriesData.push({
                date: dateStr,
                views: ((_a = dataByDate[dateStr]) === null || _a === void 0 ? void 0 : _a.views) || 0,
                contacts: ((_b = dataByDate[dateStr]) === null || _b === void 0 ? void 0 : _b.contacts) || 0,
                visits: ((_c = dataByDate[dateStr]) === null || _c === void 0 ? void 0 : _c.visits) || 0
            });
        }
        return timeSeriesData;
    }
    catch (error) {
        console.error("Error getting time-series data:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
/**
 * Reset all analytics data
 */
exports.resetAnalytics = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!isAdmin(request)) {
        throw new https_1.HttpsError("permission-denied", "Only administrators can reset analytics.");
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
    }
    catch (error) {
        console.error("Error resetting analytics:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
/**
 * Clear test mode Stripe customer IDs from all churches
 */
exports.clearTestStripeData = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!isAdmin(request)) {
        throw new https_1.HttpsError("permission-denied", "Only administrators can clear test Stripe data.");
    }
    try {
        const snapshot = await db.collection('applications').get();
        let testModeCount = 0;
        let updatedCount = 0;
        const batch = db.batch();
        snapshot.forEach(doc => {
            const data = doc.data();
            const customerId = data.stripeCustomerId || '';
            // Check if this is a test mode customer (doesn't start with cus_live_)
            const isTestMode = customerId.startsWith('cus_') && !customerId.startsWith('cus_live_');
            if (isTestMode) {
                console.log(`Clearing test data for ${data.churchName}: ${customerId}`);
                testModeCount++;
                // Clear the test Stripe data
                batch.update(doc.ref, {
                    stripeCustomerId: admin.firestore.FieldValue.delete(),
                    stripePaymentMethodId: admin.firestore.FieldValue.delete(),
                    stripeSubscriptionId: admin.firestore.FieldValue.delete()
                });
                updatedCount++;
            }
        });
        if (updatedCount > 0) {
            await batch.commit();
            console.log(`Successfully cleared test Stripe data from ${updatedCount} churches.`);
            return {
                success: true,
                message: `Cleared test Stripe data from ${updatedCount} churches.`,
                scanned: snapshot.size,
                updated: updatedCount,
                testModeFound: testModeCount
            };
        }
        else {
            return {
                success: true,
                message: "No test mode Stripe data found.",
                scanned: snapshot.size,
                updated: 0,
                testModeFound: 0
            };
        }
    }
    catch (error) {
        console.error("Error clearing test Stripe data:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
/**
 * Create a Stripe Checkout Session for initial payment setup
 * This allows churches to set up their first recurring payment
 */
exports.createStripeCheckoutSession = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated.");
    }
    const { churchId, amount, paymentPlan } = request.data;
    if (!churchId) {
        throw new https_1.HttpsError("invalid-argument", "churchId is required.");
    }
    // Validate amount (minimum $500 annual)
    const paymentAmount = amount || 500;
    if (paymentAmount < 500) {
        throw new https_1.HttpsError("invalid-argument", "Minimum annual payment amount is $500.");
    }
    // Determine payment plan and installment amount
    const plan = paymentPlan || 'annual';
    const installmentCount = plan === 'quarterly' ? 4 : plan === 'biannual' ? 2 : 1;
    const installmentAmount = Math.ceil(paymentAmount / installmentCount);
    try {
        // Get church data
        const docRef = db.collection('applications').doc(churchId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            throw new https_1.HttpsError("not-found", "Church application not found.");
        }
        const churchData = docSnap.data();
        if (!churchData) {
            throw new https_1.HttpsError("not-found", "No church data found.");
        }
        // Verify the authenticated user owns this church
        if (request.auth.uid !== churchData.userId) {
            throw new https_1.HttpsError("permission-denied", "You do not have permission to manage this church's payment.");
        }
        const installmentAmountInCents = Math.round(installmentAmount * 100);
        // Check if customer already exists, if not create one
        let customerId = churchData.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: churchData.applicantEmail,
                name: churchData.churchName,
                metadata: {
                    churchId: churchId,
                    churchName: churchData.churchName
                }
            });
            customerId = customer.id;
            // Save customer ID to Firestore
            await docRef.update({
                stripeCustomerId: customerId
            });
            console.log(`Created Stripe customer ${customerId} for church ${churchId}`);
        }
        // Determine Stripe recurring interval based on payment plan
        const planLabel = plan === 'quarterly' ? 'Quarterly' : plan === 'biannual' ? 'Bi-Annual' : 'Annual';
        const recurringConfig = plan === 'quarterly'
            ? { interval: 'month', interval_count: 3 }
            : plan === 'biannual'
                ? { interval: 'month', interval_count: 6 }
                : { interval: 'year' };
        // Create a Price for the subscription (installment amount per period)
        const price = await stripe.prices.create({
            currency: 'usd',
            unit_amount: installmentAmountInCents,
            recurring: recurringConfig,
            product_data: {
                name: `G3 Church Network ${planLabel} Dues - ${churchData.churchName}`,
                metadata: {
                    churchId: churchId,
                    churchName: churchData.churchName,
                    description: `${planLabel} membership dues for G3 Church Network ($${paymentAmount}/year)`
                }
            },
        });
        // Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [
                {
                    price: price.id,
                    quantity: 1,
                },
            ],
            subscription_data: {
                description: `G3 Church Network ${planLabel} Dues - ${churchData.churchName} ($${installmentAmount}/${plan === 'quarterly' ? 'quarter' : plan === 'biannual' ? '6 months' : 'year'})`,
                metadata: {
                    churchId: churchId,
                    churchName: churchData.churchName,
                    type: 'annual_dues',
                    applicantEmail: churchData.applicantEmail,
                    paymentPlan: plan,
                    annualTotal: paymentAmount.toString(),
                    installmentAmount: installmentAmount.toString()
                }
            },
            success_url: `${process.env.APP_URL || 'https://network.g3min.org'}/church-login?session_id={CHECKOUT_SESSION_ID}&payment_success=true`,
            cancel_url: `${process.env.APP_URL || 'https://network.g3min.org'}/church-login?payment_cancelled=true`,
            metadata: {
                churchId: churchId,
                churchName: churchData.churchName,
                paymentAmount: paymentAmount.toString(),
                paymentPlan: plan,
                installmentAmount: installmentAmount.toString(),
                type: 'annual_dues'
            }
        });
        console.log(`Created Stripe Checkout session ${session.id} for church ${churchId} (${planLabel} plan, $${installmentAmount}/installment, $${paymentAmount}/year)`);
        return {
            url: session.url,
            sessionId: session.id
        };
    }
    catch (error) {
        console.error("Error creating Stripe Checkout session:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
/**
 * Stripe Webhook Handler
 * Processes Stripe events like successful checkout completions
 */
exports.handleStripeWebhook = (0, https_1.onRequest)(async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const sig = req.headers['stripe-signature'];
    if (!sig) {
        console.error('No Stripe signature found');
        res.status(400).send('No signature');
        return;
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
    }
    catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    console.log(`Processing Stripe event: ${event.type}`);
    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                console.log(`Checkout session completed: ${session.id}`);
                const churchId = (_a = session.metadata) === null || _a === void 0 ? void 0 : _a.churchId;
                const paymentAmount = (_b = session.metadata) === null || _b === void 0 ? void 0 : _b.paymentAmount;
                if (!churchId) {
                    console.error('No churchId in session metadata');
                    break;
                }
                // Get current church data to check status
                const churchDoc = await db.collection('applications').doc(churchId).get();
                const churchData = churchDoc.data();
                if (!churchData) {
                    console.error(`Church ${churchId} not found in Firestore`);
                    break;
                }
                // Retrieve the subscription details
                const subscriptionId = session.subscription;
                if (subscriptionId) {
                    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                    // Calculate dates
                    const lastPaymentDate = toSafeISOString(new Date());
                    const nextDueDate = toSafeISOString(new Date(subscription.current_period_end * 1000));
                    // Extract payment plan metadata
                    const sessionPlan = ((_c = session.metadata) === null || _c === void 0 ? void 0 : _c.paymentPlan) || 'annual';
                    const sessionInstallmentAmount = ((_d = session.metadata) === null || _d === void 0 ? void 0 : _d.installmentAmount) ? parseFloat(session.metadata.installmentAmount) : (paymentAmount ? parseFloat(paymentAmount) : 500);
                    const annualTotal = paymentAmount ? parseFloat(paymentAmount) : 500;
                    // Calculate next installment due date based on plan
                    let nextInstallmentDue = nextDueDate; // For annual, same as nextDueDate
                    if (sessionPlan === 'quarterly') {
                        const nextInstallment = new Date();
                        nextInstallment.setMonth(nextInstallment.getMonth() + 3);
                        nextInstallmentDue = toSafeISOString(nextInstallment);
                    }
                    else if (sessionPlan === 'biannual') {
                        const nextInstallment = new Date();
                        nextInstallment.setMonth(nextInstallment.getMonth() + 6);
                        nextInstallmentDue = toSafeISOString(nextInstallment);
                    }
                    // Prepare update data
                    const updateData = {
                        stripeSubscriptionId: subscriptionId,
                        lastPaymentDate,
                        nextDueDate,
                        paymentAmount: annualTotal,
                        paymentFrequency: 'yearly',
                        paymentPlan: sessionPlan,
                        installmentAmount: sessionInstallmentAmount,
                        totalPaidInPeriod: sessionInstallmentAmount,
                        annualPeriodStart: toSafeISOString(new Date()),
                        installmentsPaidCount: 1,
                        nextInstallmentDue,
                        updatedAt: toSafeISOString(new Date())
                    };
                    // ✅ FIX: Update status to APPROVED if currently PROVISIONAL or DELINQUENT
                    const wasProvisional = churchData.status === 'PROVISIONAL_APPROVED';
                    if (churchData.status === 'PROVISIONAL_APPROVED' || churchData.status === 'DELINQUENT') {
                        updateData.status = 'APPROVED';
                        updateData.isManuallyDelinquent = false;
                        console.log(`🎉 Activating church ${churchId} (${churchData.churchName}) after successful payment - Status: ${churchData.status} → APPROVED`);
                    }
                    // Update church record
                    await db.collection('applications').doc(churchId).update(updateData);
                    console.log(`Updated church ${churchId} with subscription ${subscriptionId}`);
                    console.log(`  Last Payment: ${lastPaymentDate}`);
                    console.log(`  Next Due: ${nextDueDate}`);
                    // ✅ FIX: Send welcome email if transitioning from provisional
                    if (wasProvisional) {
                        try {
                            const template = await getTemplate('application_fully_approved');
                            const subject = replaceVariables(template.subject, churchData);
                            const body = replaceVariables(template.body, churchData);
                            await sendEmailBatch([churchData.applicantEmail], subject, body, SYSTEM_SENDER);
                            console.log(`📧 Sent 'application_fully_approved' welcome email to ${churchData.applicantEmail}`);
                        }
                        catch (emailError) {
                            console.error(`❌ Error sending welcome email to ${churchData.applicantEmail}:`, emailError);
                            // Don't fail the whole webhook if email fails
                        }
                    }
                    // Send payment notification to finance
                    if (lastPaymentDate && churchData) {
                        const amountPaid = paymentAmount ? parseFloat(paymentAmount) : 500;
                        await sendPaymentNotification(churchData, lastPaymentDate, amountPaid);
                    }
                }
                break;
            }
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                console.log(`Subscription updated: ${subscription.id}`);
                // Find church by subscription ID
                const snapshot = await db.collection('applications')
                    .where('stripeSubscriptionId', '==', subscription.id)
                    .limit(1)
                    .get();
                if (!snapshot.empty) {
                    const churchDoc = snapshot.docs[0];
                    const nextDueDate = toSafeISOString(new Date(subscription.current_period_end * 1000));
                    await churchDoc.ref.update({
                        nextDueDate,
                        paymentFrequency: subscription.cancel_at_period_end ? 'one_time' : 'yearly',
                        updatedAt: toSafeISOString(new Date())
                    });
                    console.log(`Updated church ${churchDoc.id} subscription dates`);
                }
                break;
            }
            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                console.log(`Invoice payment succeeded: ${invoice.id}`);
                const subscriptionId = invoice.subscription;
                if (subscriptionId) {
                    // Find church by subscription ID
                    const snapshot = await db.collection('applications')
                        .where('stripeSubscriptionId', '==', subscriptionId)
                        .limit(1)
                        .get();
                    if (!snapshot.empty) {
                        const churchDoc = snapshot.docs[0];
                        const churchData = churchDoc.data();
                        const paidAt = (_e = invoice.status_transitions) === null || _e === void 0 ? void 0 : _e.paid_at;
                        const lastPaymentDate = paidAt ? toSafeISOString(new Date(paidAt * 1000)) : toSafeISOString(new Date());
                        const amountPaid = invoice.amount_paid ? invoice.amount_paid / 100 : ((churchData === null || churchData === void 0 ? void 0 : churchData.installmentAmount) || (churchData === null || churchData === void 0 ? void 0 : churchData.paymentAmount) || 0);
                        // Determine payment plan from church data
                        const currentPlan = (churchData === null || churchData === void 0 ? void 0 : churchData.paymentPlan) || 'annual';
                        const currentInstallmentCount = currentPlan === 'quarterly' ? 4 : currentPlan === 'biannual' ? 2 : 1;
                        const previousPaidCount = (churchData === null || churchData === void 0 ? void 0 : churchData.installmentsPaidCount) || 0;
                        const previousTotalPaid = (churchData === null || churchData === void 0 ? void 0 : churchData.totalPaidInPeriod) || 0;
                        const newPaidCount = previousPaidCount + 1;
                        const newTotalPaid = previousTotalPaid + amountPaid;
                        // Calculate next installment due date based on plan
                        let nextInstallmentDue = null;
                        if (currentPlan === 'quarterly') {
                            const next = new Date(lastPaymentDate);
                            next.setMonth(next.getMonth() + 3);
                            nextInstallmentDue = toSafeISOString(next);
                        }
                        else if (currentPlan === 'biannual') {
                            const next = new Date(lastPaymentDate);
                            next.setMonth(next.getMonth() + 6);
                            nextInstallmentDue = toSafeISOString(next);
                        }
                        // Check if this completes an annual cycle (all installments paid)
                        const cycleComplete = newPaidCount >= currentInstallmentCount;
                        // Calculate annual period next due date
                        let nextDueDate;
                        if (cycleComplete) {
                            // Reset for next annual cycle
                            const annualStart = (churchData === null || churchData === void 0 ? void 0 : churchData.annualPeriodStart) ? new Date(churchData.annualPeriodStart) : new Date(lastPaymentDate);
                            annualStart.setFullYear(annualStart.getFullYear() + 1);
                            nextDueDate = toSafeISOString(annualStart);
                        }
                        else {
                            // Keep existing annual period end date
                            nextDueDate = (churchData === null || churchData === void 0 ? void 0 : churchData.nextDueDate) || null;
                            if (!nextDueDate) {
                                const ndObj = new Date(lastPaymentDate);
                                ndObj.setFullYear(ndObj.getFullYear() + 1);
                                nextDueDate = toSafeISOString(ndObj);
                            }
                        }
                        const updateData = {
                            lastPaymentDate,
                            nextDueDate,
                            totalPaidInPeriod: newTotalPaid,
                            installmentsPaidCount: newPaidCount,
                            updatedAt: toSafeISOString(new Date())
                        };
                        if (nextInstallmentDue) {
                            updateData.nextInstallmentDue = nextInstallmentDue;
                        }
                        // If cycle complete, reset for next year
                        if (cycleComplete && newTotalPaid >= ((churchData === null || churchData === void 0 ? void 0 : churchData.paymentAmount) || 500)) {
                            console.log(`[Installment] Annual cycle complete for ${churchData === null || churchData === void 0 ? void 0 : churchData.churchName}. Total paid: $${newTotalPaid}. Resetting for next year.`);
                            updateData.totalPaidInPeriod = 0;
                            updateData.installmentsPaidCount = 0;
                            updateData.annualPeriodStart = toSafeISOString(new Date());
                        }
                        // If church was delinquent, reactivate on payment
                        if ((churchData === null || churchData === void 0 ? void 0 : churchData.status) === 'DELINQUENT') {
                            updateData.status = 'APPROVED';
                            updateData.isManuallyDelinquent = false;
                            console.log(`🎉 Reactivating delinquent church ${churchDoc.id} after successful payment`);
                        }
                        await churchDoc.ref.update(updateData);
                        console.log(`[Installment] Updated church ${churchDoc.id} - Payment #${newPaidCount}/${currentInstallmentCount}, Total: $${newTotalPaid}/$${(churchData === null || churchData === void 0 ? void 0 : churchData.paymentAmount) || 500}`);
                        // Send payment notification email to finance@g3min.org
                        if (lastPaymentDate && churchData) {
                            await sendPaymentNotification(churchData, lastPaymentDate, amountPaid);
                        }
                    }
                }
                break;
            }
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object;
                console.log(`Payment Intent succeeded: ${paymentIntent.id}`);
                // Check if this is an annual dues payment (not a subscription payment, those are handled by invoice.payment_succeeded)
                const churchId = (_f = paymentIntent.metadata) === null || _f === void 0 ? void 0 : _f.churchId;
                const paymentType = (_g = paymentIntent.metadata) === null || _g === void 0 ? void 0 : _g.type;
                if (churchId && (paymentType === 'annual_dues_onetime' || paymentType === 'annual_dues')) {
                    const churchDoc = await db.collection('applications').doc(churchId).get();
                    if (churchDoc.exists) {
                        const churchData = churchDoc.data();
                        const lastPaymentDate = toSafeISOString(new Date(paymentIntent.created * 1000));
                        // Calculate next due date (1 year from payment date)
                        const nextDueDateObj = new Date(lastPaymentDate);
                        nextDueDateObj.setFullYear(nextDueDateObj.getFullYear() + 1);
                        const nextDueDate = toSafeISOString(nextDueDateObj);
                        const updateData = {
                            lastPaymentDate,
                            nextDueDate,
                            updatedAt: toSafeISOString(new Date())
                        };
                        // If church was delinquent, reactivate on payment (matches subscription + installment handlers)
                        if ((churchData === null || churchData === void 0 ? void 0 : churchData.status) === 'DELINQUENT') {
                            updateData.status = 'APPROVED';
                            updateData.isManuallyDelinquent = false;
                            console.log(`🎉 Reactivating delinquent church ${churchId} (${churchData === null || churchData === void 0 ? void 0 : churchData.churchName}) after one-time payment`);
                        }
                        await churchDoc.ref.update(updateData);
                        console.log(`✅ One-time payment processed for ${churchData === null || churchData === void 0 ? void 0 : churchData.churchName} (${churchId})`);
                        console.log(`   Last Payment: ${lastPaymentDate}, Next Due: ${nextDueDate}`);
                        // Send payment notification email to finance@g3min.org
                        if (lastPaymentDate && churchData) {
                            const amountPaid = paymentIntent.amount_received ? paymentIntent.amount_received / 100 : (churchData.paymentAmount || 0);
                            await sendPaymentNotification(churchData, lastPaymentDate, amountPaid);
                        }
                    }
                    else {
                        console.error(`Church ${churchId} not found for payment intent ${paymentIntent.id}`);
                    }
                }
                break;
            }
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
        res.json({ received: true });
    }
    catch (error) {
        console.error(`Error processing webhook: ${error.message}`);
        res.status(500).send(`Webhook processing error: ${error.message}`);
    }
});
//# sourceMappingURL=index.js.map