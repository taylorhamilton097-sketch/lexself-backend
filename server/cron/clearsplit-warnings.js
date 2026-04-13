'use strict';

/**
 * ClearSplit Expiry Warning Cron
 * 
 * Sends a 14-day warning email to both parties when a ClearSplit
 * agreement is approaching its active_until date.
 * 
 * Run this daily via setInterval on server startup (see server/index.js)
 * or hook into Railway's cron if available.
 * 
 * Tracks sent warnings in the database to avoid duplicates.
 */

const { db } = require('../db');
const { sendClearSplitExpiryWarningEmail } = require('../utils/email');

// Ensure warning tracking column exists
function ensureWarningColumn() {
  try {
    db.exec(`ALTER TABLE clearsplit_agreements ADD COLUMN warning_sent_at DATETIME DEFAULT NULL`);
  } catch(e) {
    // Column already exists — ignore
  }
}

/**
 * Check all active agreements and send 14-day warnings where needed.
 * Safe to run multiple times — only sends once per agreement.
 */
async function runExpiryWarnings() {
  ensureWarningColumn();

  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const in15Days = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

  // Find agreements expiring in the next 14 days that haven't had a warning sent
  const agreements = db.prepare(`
    SELECT a.*,
      u1.name  AS party1_name,  u1.email AS party1_email,
      u2.name  AS party2_name,  u2.email AS party2_email
    FROM clearsplit_agreements a
    LEFT JOIN users u1 ON u1.id = a.party1_user_id
    LEFT JOIN users u2 ON u2.id = a.party2_user_id
    WHERE a.warning_sent_at IS NULL
      AND a.status != 'expired'
      AND (
        (a.extension_until IS NULL     AND a.active_until     BETWEEN ? AND ?)
        OR
        (a.extension_until IS NOT NULL AND a.extension_until BETWEEN ? AND ?)
      )
  `).all(
    now.toISOString(), in15Days.toISOString(),
    now.toISOString(), in15Days.toISOString()
  );

  if (agreements.length === 0) {
    console.log('[ClearSplit Cron] No expiry warnings to send');
    return;
  }

  console.log(`[ClearSplit Cron] Sending ${agreements.length} expiry warning(s)`);

  for (const agreement of agreements) {
    const activeUntil = agreement.extension_until || agreement.active_until;

    try {
      // Send to Party 1
      if (agreement.party1_email) {
        await sendClearSplitExpiryWarningEmail({
          email:      agreement.party1_email,
          firstName:  agreement.party1_name?.split(' ')[0] || 'there',
          activeUntil,
        });
      }

      // Send to Party 2 if they've joined
      if (agreement.party2_email) {
        await sendClearSplitExpiryWarningEmail({
          email:      agreement.party2_email,
          firstName:  agreement.party2_name?.split(' ')[0] || 'there',
          activeUntil,
        });
      }

      // Mark warning as sent
      db.prepare(`UPDATE clearsplit_agreements SET warning_sent_at = ? WHERE id = ?`)
        .run(now.toISOString(), agreement.id);

      console.log(`[ClearSplit Cron] Warning sent for agreement ${agreement.code} (expires ${activeUntil})`);

    } catch(e) {
      console.error(`[ClearSplit Cron] Failed to send warning for agreement ${agreement.code}:`, e.message);
    }
  }
}

/**
 * Also mark expired agreements as 'expired' in the database.
 * Keeps status accurate for workspace state checks.
 */
function markExpiredAgreements() {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE clearsplit_agreements
    SET status = 'expired'
    WHERE status = 'active'
      AND extension_until IS NULL
      AND active_until < ?
  `).run(now);

  const result2 = db.prepare(`
    UPDATE clearsplit_agreements
    SET status = 'expired'
    WHERE status IN ('active', 'extended')
      AND extension_until IS NOT NULL
      AND extension_until < ?
  `).run(now);

  const total = result.changes + result2.changes;
  if (total > 0) {
    console.log(`[ClearSplit Cron] Marked ${total} agreement(s) as expired`);
  }
}

/**
 * Start the daily cron — runs once on startup then every 24 hours.
 */
function startClearSplitCron() {
  console.log('[ClearSplit Cron] Starting daily expiry check');

  const run = async () => {
    try {
      markExpiredAgreements();
      await runExpiryWarnings();
    } catch(e) {
      console.error('[ClearSplit Cron] Error:', e.message);
    }
  };

  // Run immediately on startup
  run();

  // Then every 24 hours
  setInterval(run, 24 * 60 * 60 * 1000);
}

module.exports = { startClearSplitCron, runExpiryWarnings, markExpiredAgreements };
