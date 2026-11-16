'use strict';

const { onValueWritten } = require('firebase-functions/v2/database');
const { onSchedule }     = require('firebase-functions/v2/scheduler');
const admin              = require('firebase-admin');
const twilio             = require('twilio');

admin.initializeApp();

const db = admin.database();

// ─────────────────────────────────────────────────────────────────────────────
// TWILIO CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const TWILIO_ACCOUNT_SID = 'REDACTED_NOT_IN_USE';
const TWILIO_AUTH_TOKEN  = 'REDACTED_NOT_IN_USE';
const TWILIO_FROM_NUMBER = '+16788418450';
const TWILIO_TO_CHRIS    = '+16789562334';

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY — SMS
// ─────────────────────────────────────────────────────────────────────────────

async function sendSMS(to, body) {
  var client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  try {
    var msg = await client.messages.create({
      body: body,
      from: TWILIO_FROM_NUMBER,
      to:   to
    });
    console.log('[SMS] Sent to', to, '— SID:', msg.sid);
  } catch (err) {
    console.log('[SMS] Send failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY — DATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getMonthKey() {
  var now    = new Date();
  var months = ['jan','feb','mar','apr','may','jun','jul','aug','sept','oct','nov','dec'];
  return months[now.getMonth()] + '_' + now.getFullYear();
}

function getMonthLabel() {
  var now    = new Date();
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];
  return months[now.getMonth()] + ' ' + now.getFullYear();
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: billPaidNotification
// Watches: budget/bills/{monthKey}/changes/{billId}
// The changes node stores {billId: true|false} — true = paid.
// Bill name is looked up from budget/bills/{monthKey}/billIndex/{billId}/name
// ─────────────────────────────────────────────────────────────────────────────

exports.billPaidNotification = onValueWritten(
  {
    ref:      'budget/bills/{monthKey}/changes/{billId}',
    region:   'us-central1',
    instance: 'mcdonald-budget-01-default-rtdb',
  },
  async (event) => {
    var paidBefore = event.data.before.val();
    var paidAfter  = event.data.after.val();

    // Only fire when transitioning to true (paid)
    if (paidAfter !== true || paidBefore === true) {
      console.log('[billPaidNotification] Skipping — not a paid transition. before:', paidBefore, 'after:', paidAfter);
      return null;
    }

    var monthKey   = event.params.monthKey;
    var billId     = event.params.billId;
    var monthLabel = getMonthLabel();

    // Try to get bill name from billIndex — fall back to billId if not found
    var nameSnap = await db.ref('budget/bills/' + monthKey + '/billIndex/' + billId + '/name').once('value');
    var billName = nameSnap.val() || billId;

    var body = '\u2705 Bill paid \u2014 ' + billName + ' marked as paid for ' + monthLabel;

    console.log('[billPaidNotification] Firing SMS for:', billName, '| Month:', monthKey);
    await sendSMS(TWILIO_TO_CHRIS, body);

    return null;
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2: weeklyBillSummary
// Scheduled — every Monday at 9 AM ET.
// Reads changes node to count paid/unpaid.
// ─────────────────────────────────────────────────────────────────────────────

exports.weeklyBillSummary = onSchedule(
  {
    schedule: '0 9 * * 1',
    timeZone: 'America/New_York',
    region:   'us-central1',
  },
  async (event) => {
    var monthKey   = getMonthKey();
    var monthLabel = getMonthLabel();

    var snap = await db.ref('budget/bills/' + monthKey + '/changes').once('value');
    var data = snap.val();

    if (!data) {
      console.log('[weeklyBillSummary] No changes node found for month:', monthKey);
      await sendSMS(TWILIO_TO_CHRIS, '\uD83D\uDCCB Bills ' + monthLabel + ': no data found. Open the tracker to sync.');
      return null;
    }

    var entries     = Object.values(data);
    var total       = entries.length;
    var paid        = entries.filter(function(v) { return v === true; }).length;
    var outstanding = total - paid;

    var body = '\uD83D\uDCCB Bills ' + monthLabel + ': ' + paid + ' of ' + total + ' paid. ' + outstanding + ' outstanding.';

    console.log('[weeklyBillSummary] Month:', monthKey, '| Paid:', paid, '| Total:', total);
    await sendSMS(TWILIO_TO_CHRIS, body);

    return null;
  }
);
