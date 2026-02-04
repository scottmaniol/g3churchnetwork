const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
db.settings({ databaseId: 'g3network' });

async function checkDelinquentEmails() {
  console.log('====================================');
  console.log('DELINQUENT CHURCHES EMAIL ANALYSIS');
  console.log('====================================\n');

  const now = new Date();
  console.log(`Current Date: ${now.toISOString()}\n`);

  try {
    // Get all APPROVED and DELINQUENT churches
    const snapshot = await db.collection('applications')
      .where('status', 'in', ['APPROVED', 'DELINQUENT'])
      .get();

    console.log(`Total churches checked: ${snapshot.size}\n`);

    const results = {
      delinquent: [],
      nearDue: [],
      manual: [],
      recurring: [],
      issues: []
    };

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const churchId = doc.id;

      // Skip if no nextDueDate
      if (!data.nextDueDate) {
        results.issues.push({
          churchId,
          churchName: data.churchName,
          issue: 'No nextDueDate set'
        });
        continue;
      }

      const dueDate = new Date(data.nextDueDate);
      
      // Check for invalid dates
      if (isNaN(dueDate.getTime())) {
        results.issues.push({
          churchId,
          churchName: data.churchName,
          issue: `Invalid nextDueDate: ${data.nextDueDate}`
        });
        continue;
      }

      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isManual = data.paymentFrequency === 'one_time' || !data.paymentFrequency;
      
      const churchInfo = {
        churchId,
        churchName: data.churchName,
        email: data.applicantEmail,
        status: data.status,
        nextDueDate: dueDate.toISOString().split('T')[0],
        daysUntilDue,
        paymentFrequency: data.paymentFrequency || 'not set',
        isManual,
        lastPaymentDate: data.lastPaymentDate || 'not set',
        stripeSubscriptionId: data.stripeSubscriptionId || 'none'
      };

      // Categorize churches
      if (data.status === 'DELINQUENT') {
        churchInfo.daysOverdue = Math.abs(daysUntilDue);
        churchInfo.weeklyReminderDue = Math.abs(daysUntilDue) % 7 === 0;
        results.delinquent.push(churchInfo);
      } else if (daysUntilDue < 0) {
        churchInfo.shouldBeDelinquent = true;
        churchInfo.daysOverdue = Math.abs(daysUntilDue);
        results.issues.push({
          churchId,
          churchName: data.churchName,
          issue: `Status is APPROVED but ${Math.abs(daysUntilDue)} days overdue`
        });
      } else if (daysUntilDue <= 30) {
        results.nearDue.push(churchInfo);
      }

      // Track payment types
      if (isManual) {
        results.manual.push(churchInfo);
      } else {
        results.recurring.push(churchInfo);
      }
    }

    // Print Results
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('CRITICAL ISSUES FOUND');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (results.issues.length === 0) {
      console.log('✓ No critical issues detected\n');
    } else {
      results.issues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue.churchName} (${issue.churchId})`);
        console.log(`   Issue: ${issue.issue}\n`);
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('DELINQUENT CHURCHES (Should receive emails)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (results.delinquent.length === 0) {
      console.log('✓ No delinquent churches found\n');
    } else {
      results.delinquent.forEach((church, i) => {
        console.log(`${i + 1}. ${church.churchName}`);
        console.log(`   Church ID: ${church.churchId}`);
        console.log(`   Email: ${church.email}`);
        console.log(`   Days Overdue: ${church.daysOverdue}`);
        console.log(`   Payment Type: ${church.paymentFrequency}`);
        console.log(`   Next Due Date: ${church.nextDueDate}`);
        console.log(`   Weekly Reminder Due TODAY: ${church.weeklyReminderDue ? 'YES ⚠️' : 'NO'}`);
        console.log(`   (Weekly reminders send on days: 7, 14, 21, 28, etc.)\n`);
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('CHURCHES NEAR DUE DATE (30 days or less)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (results.nearDue.length === 0) {
      console.log('✓ No churches near their due date\n');
    } else {
      results.nearDue.forEach((church, i) => {
        console.log(`${i + 1}. ${church.churchName}`);
        console.log(`   Days Until Due: ${church.daysUntilDue}`);
        console.log(`   Payment Type: ${church.paymentFrequency}`);
        console.log(`   Will receive reminder: ${church.isManual && [30, 7, 0].includes(church.daysUntilDue) ? 'YES' : 'NO'}\n`);
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Churches: ${snapshot.size}`);
    console.log(`Delinquent: ${results.delinquent.length}`);
    console.log(`Near Due (30 days): ${results.nearDue.length}`);
    console.log(`Manual Payment: ${results.manual.length}`);
    console.log(`Recurring Payment: ${results.recurring.length}`);
    console.log(`Issues Found: ${results.issues.length}`);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('POTENTIAL PROBLEMS WITH THE EMAIL SYSTEM');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  Weekly delinquent reminders only send on EXACT 7-day intervals');
    console.log('    (7, 14, 21, 28 days overdue)');
    console.log('    If the scheduler runs at different times, it may MISS these days!');
    console.log('\n💡 RECOMMENDATION:');
    console.log('    Add lastReminderSent tracking to ensure weekly emails are sent');
    console.log('    regardless of exact day calculation.');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    admin.app().delete();
  }
}

checkDelinquentEmails();
