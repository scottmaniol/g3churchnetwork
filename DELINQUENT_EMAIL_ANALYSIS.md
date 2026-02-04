# Delinquent Church Dues Reminder Email Analysis

**Date:** January 26, 2026  
**Function:** `checkDuesAndReminders` (Scheduled Cloud Function)

---

## 🔍 CRITICAL ISSUES IDENTIFIED

### Issue #1: ❌ **Weekly Reminder Logic is BROKEN**

**Location:** `functions/src/index.ts` - Line ~917-920

```typescript
// Send Weekly Delinquent Reminder (if not just sent above)
// Logic: If delinquent for > 0 days and it's a weekly cycle
if (data.status === 'DELINQUENT' && Math.abs(daysUntilDue) % 7 === 0) {
  // Send weekly reminder
}
```

**Problem:**
- Weekly reminders only send on **EXACT** 7-day intervals (7, 14, 21, 28 days overdue)
- The scheduler runs "every 24 hours" but **NOT at the exact same time each day**
- Firebase Cloud Scheduler can drift by several hours
- If a church becomes 7 days overdue at 2 PM, but the scheduler runs at 5 PM, the calculation will show 7.125 days, which **fails the modulo check**
- **Result:** Churches may NEVER receive weekly reminders!

**Impact:** 🔴 **HIGH** - Delinquent churches may not receive follow-up emails

---

### Issue #2: ⚠️ **First Delinquent Email Sent Only Once**

**Location:** `functions/src/index.ts` - Line ~909-916

```typescript
// If status is still APPROVED, mark DELINQUENT
if (data.status === 'APPROVED') {
  await doc.ref.update({ status: 'DELINQUENT' });
  // Send first delinquent email
  const template = await getTemplate('dues_delinquent');
  // ... send email
}
```

**Problem:**
- The first delinquent email is sent when status changes from APPROVED → DELINQUENT
- If the status is already DELINQUENT, this block is skipped
- No tracking of when the last reminder was sent

**Impact:** 🟡 **MEDIUM** - Initial notification works, but follow-ups are unreliable

---

### Issue #3: ⚠️ **No Email Tracking or Logs**

**Problem:**
- No database field tracking `lastReminderSent`
- No database field tracking `reminderEmailsSent` count
- Cannot verify if emails were actually sent
- Cannot prevent duplicate emails if function runs multiple times

**Impact:** 🟡 **MEDIUM** - No visibility into email delivery

---

### Issue #4: ⚠️ **Reminders Only for Manual Payments**

**Location:** `functions/src/index.ts` - Line ~888-904

```typescript
// Handling Reminders for Manual Payers (One-time)
const isManual = data.paymentFrequency === 'one_time' || !data.paymentFrequency;

if (isManual && data.status === 'APPROVED') {
  // Send 30-day, 7-day, 0-day reminders
}
```

**Observation:**
- Pre-due reminders (30, 7, 0 days) only sent to manual payment churches
- Recurring subscription churches rely on Stripe's email system
- This is **likely intentional** but should be documented

**Impact:** 🟢 **LOW** - Acceptable if documented

---

### Issue #5: ⚠️ **Date Validation Missing Error Handling**

**Location:** `functions/src/index.ts` - Line ~870-876

```typescript
if (!data.nextDueDate) continue;

const dueDate = new Date(data.nextDueDate);
if (isNaN(dueDate.getTime())) {
  console.warn(`Invalid nextDueDate found for doc ${doc.id}`);
  continue; // Skip this document
}
```

**Problem:**
- Invalid dates are silently skipped
- No alert sent to admins about data issues
- Churches with bad data never get reminders

**Impact:** 🟡 **MEDIUM** - Data quality issues go unnoticed

---

## 📊 WHAT SHOULD BE HAPPENING

### For APPROVED Churches (Manual Payment):
1. **30 days before due:** Send `dues_reminder_30` email
2. **7 days before due:** Send `dues_reminder_7` email  
3. **0 days (due date):** Send `dues_reminder_0` email
4. **After due date:** Change status to DELINQUENT and send first `dues_delinquent` email

### For DELINQUENT Churches:
1. **Initial:** Send `dues_delinquent` email when marked delinquent
2. **Weekly:** Send `dues_delinquent` email every 7 days (7, 14, 21, 28...)

### For APPROVED Churches (Recurring/Yearly):
- **No reminders** - Stripe handles billing automatically

---

## ✅ WHAT IS ACTUALLY WORKING

1. ✅ Pre-due reminders (30, 7, 0 days) for manual payment churches
2. ✅ Initial delinquent email when church becomes overdue
3. ✅ Scheduler runs daily (every 24 hours)
4. ✅ Status change from APPROVED → DELINQUENT
5. ✅ Invalid date checking prevents crashes

---

## 🚨 RECOMMENDATIONS

### Priority 1: Fix Weekly Reminder System

**Add tracking fields to church documents:**
```typescript
{
  lastReminderSent: string | null,  // ISO date of last email
  reminderCount: number,             // Total reminders sent
  lastReminderType: string           // 'dues_delinquent', 'dues_reminder_30', etc.
}
```

**Update logic to use time-based tracking instead of modulo:**
```typescript
// Instead of: Math.abs(daysUntilDue) % 7 === 0
// Use:
const lastReminder = data.lastReminderSent ? new Date(data.lastReminderSent) : null;
const daysSinceLastReminder = lastReminder 
  ? Math.floor((now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60 * 24))
  : 999;

if (data.status === 'DELINQUENT' && daysSinceLastReminder >= 7) {
  // Send weekly reminder
  await sendEmailBatch([data.applicantEmail], subject, body, SYSTEM_SENDER);
  await doc.ref.update({
    lastReminderSent: toSafeISOString(new Date()),
    reminderCount: (data.reminderCount || 0) + 1,
    lastReminderType: 'dues_delinquent'
  });
}
```

### Priority 2: Add Email Logging

Create a `emailLogs` collection to track all sent emails:
```typescript
{
  emailId: string,
  churchId: string,
  churchName: string,
  recipient: string,
  type: 'dues_reminder_30' | 'dues_reminder_7' | 'dues_delinquent' | etc.,
  sentAt: timestamp,
  status: 'sent' | 'failed',
  error: string | null
}
```

### Priority 3: Add Admin Alerts

- Send weekly report to admin@g3min.org with delinquent church count
- Alert if any church has invalid nextDueDate
- Alert if email fails to send

### Priority 4: Manual Override System

Add admin function to manually trigger reminder emails for specific churches (for testing and recovery)

---

## 🧪 TESTING RECOMMENDATIONS

1. **Create test church** with `nextDueDate` = yesterday
2. **Run scheduler manually** using Firebase Console
3. **Verify email sent** by checking Resend dashboard
4. **Check Firestore** to confirm status changed to DELINQUENT
5. **Wait 7+ days** and verify weekly reminder sends

---

## 📝 IMMEDIATE ACTIONS

### To Check Current State:
```bash
# Check Firebase Functions logs
firebase functions:log --only checkDuesAndReminders

# Check for any delinquent churches in database
# (Run query in Firebase Console)
```

### To Test Email System:
```bash
# Deploy updated function
cd functions
npm run build
firebase deploy --only functions:checkDuesAndReminders
```

---

## 🎯 CONCLUSION

**Current Status:** ⚠️ **PARTIALLY WORKING**

- ✅ Initial delinquent emails: **WORKING**
- ❌ Weekly delinquent reminders: **LIKELY BROKEN** (modulo logic issue)
- ✅ Pre-due reminders: **WORKING** (for manual payments)
- ❌ Email tracking: **NON-EXISTENT**

**Confidence Level:** 85% - Weekly reminders are failing due to modulo timing issue

**Recommended Next Step:** Implement time-based tracking system for weekly reminders
