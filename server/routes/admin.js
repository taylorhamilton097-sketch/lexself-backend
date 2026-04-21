'use strict';

/**
 * Admin dashboard — server-rendered HTML, gated by HTTP Basic auth.
 *
 * Credentials:
 *   username:  ADMIN_EMAIL   (env var — already present)
 *   password:  ADMIN_PASSWORD (env var — already rotated this session)
 *
 * Routes:
 *   GET  /api/admin/usage   — dashboard page
 *   GET  /api/admin/usage.json — JSON version for automation / uptime checks
 *
 * Intentionally minimal. No SPA, no charts, no email alerts. Email alerting
 * lives in a later session.
 */

const express = require('express');
const router  = express.Router();

const {
  getHighUsageUsers,
  getIpFlaggedUsers,
  getCounselSoftWarnUsers,
  getTopChatUsers,
  getUsersWithMultipleSessions,
  IP_FLAG_THRESHOLD,
  torontoDateString,
  // Session 5
  getRecentStripeEvents,
} = require('../db');

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

/**
 * HTTP Basic auth middleware. Constant-time compare to avoid timing leaks.
 */
function requireAdmin(req, res, next) {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    return res.status(503).type('text/plain').send(
      'Admin dashboard disabled: ADMIN_EMAIL and ADMIN_PASSWORD must be set.'
    );
  }

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="ClearStand Admin", charset="UTF-8"');
    return res.status(401).type('text/plain').send('Authentication required.');
  }

  let decoded = '';
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    res.set('WWW-Authenticate', 'Basic realm="ClearStand Admin", charset="UTF-8"');
    return res.status(401).type('text/plain').send('Invalid credentials.');
  }
  const idx = decoded.indexOf(':');
  const user = idx >= 0 ? decoded.slice(0, idx) : decoded;
  const pass = idx >= 0 ? decoded.slice(idx + 1) : '';

  const crypto = require('crypto');
  const safeEq = (a, b) => {
    const ab = Buffer.from(a || '', 'utf8');
    const bb = Buffer.from(b || '', 'utf8');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  };

  if (!safeEq(user.toLowerCase(), ADMIN_EMAIL.toLowerCase()) || !safeEq(pass, ADMIN_PASSWORD)) {
    res.set('WWW-Authenticate', 'Basic realm="ClearStand Admin", charset="UTF-8"');
    return res.status(401).type('text/plain').send('Invalid credentials.');
  }
  next();
}

// ── HTML helpers ──
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function renderRows(rows, cols) {
  if (!rows.length) {
    return `<tr><td colspan="${cols.length}" class="empty">No records.</td></tr>`;
  }
  return rows.map((r) =>
    '<tr>' + cols.map((c) => `<td>${esc(c.render ? c.render(r) : r[c.key])}</td>`).join('') + '</tr>'
  ).join('');
}

function section(title, note, cols, rows) {
  return `
    <section>
      <h2>${esc(title)}</h2>
      ${note ? `<p class="note">${esc(note)}</p>` : ''}
      <table>
        <thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${renderRows(rows, cols)}</tbody>
      </table>
    </section>
  `;
}

const fmtUnix = (s) => s ? new Date(s * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '';

// ── Data assembly — shared by HTML and JSON routes ──
function collectData() {
  const today = torontoDateString();
  const highUsage      = getHighUsageUsers({ chatMin: 100, analysisMin: 5, limit: 50 });
  const ipFlagged      = getIpFlaggedUsers({ limit: 50 });
  const counselWarn    = getCounselSoftWarnUsers({ threshold: 150, limit: 50 });
  const topChat        = getTopChatUsers({ days: 7, limit: 20 });
  const multiSession   = getUsersWithMultipleSessions();
  const flaggedCount   = ipFlagged.length + counselWarn.length + highUsage.length;
  return { today, highUsage, ipFlagged, counselWarn, topChat, multiSession, flaggedCount };
}

// ── GET /api/admin/usage (HTML) ──
router.get('/usage', requireAdmin, (req, res) => {
  const d = collectData();

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ClearStand Admin — Usage</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --navy:#0D1B2A; --steel:#2E86C1; --warn:#d97706; --ok:#065f46; --bg:#f7f7f5; --border:#e3e3df; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:var(--navy); background:var(--bg); }
  header { background:var(--navy); color:#fff; padding:16px 24px; }
  header h1 { margin:0; font-size:20px; font-weight:600; }
  header .sub { color:#a7b5c2; font-size:13px; margin-top:4px; }
  main { max-width:1200px; margin:0 auto; padding:24px; }
  .flags { display:flex; gap:12px; margin:16px 0 24px; flex-wrap:wrap; }
  .flag { background:#fff; border:1px solid var(--border); border-radius:6px; padding:12px 16px; min-width:160px; }
  .flag .n { font-size:24px; font-weight:700; color:var(--navy); }
  .flag .l { font-size:12px; color:#666; text-transform:uppercase; letter-spacing:.04em; }
  .flag.warn .n { color:var(--warn); }
  section { background:#fff; border:1px solid var(--border); border-radius:6px; margin:16px 0; padding:16px 20px; }
  section h2 { margin:0 0 6px; font-size:16px; color:var(--steel); font-weight:600; }
  section .note { margin:0 0 12px; font-size:13px; color:#666; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--border); }
  th { background:#fafaf8; font-weight:600; color:#555; }
  td.empty { text-align:center; color:#999; padding:16px; }
  tr:last-child td { border-bottom:none; }
  .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  .pill-free { background:#eee; color:#555; }
  .pill-essential { background:#dbeafe; color:#1e40af; }
  .pill-complete { background:#c7f0d6; color:#065f46; }
  .pill-counsel { background:#fde68a; color:#92400e; }
  .pill-admin { background:#fecaca; color:#991b1b; }
  footer { text-align:center; font-size:12px; color:#888; padding:24px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; }
</style>
</head>
<body>
<header>
  <h1>ClearStand — Usage Dashboard</h1>
  <div class="sub">Toronto date: ${esc(d.today)} &middot; <a href="/api/admin/stripe-events" style="color:#a7b5c2;text-decoration:none;">Stripe events →</a></div>
</header>
<main>
  <div class="flags">
    <div class="flag ${d.ipFlagged.length ? 'warn' : ''}">
      <div class="n">${d.ipFlagged.length}</div><div class="l">IP-flagged users</div>
    </div>
    <div class="flag ${d.counselWarn.length ? 'warn' : ''}">
      <div class="n">${d.counselWarn.length}</div><div class="l">Counsel soft-warn today</div>
    </div>
    <div class="flag ${d.highUsage.length ? 'warn' : ''}">
      <div class="n">${d.highUsage.length}</div><div class="l">High-usage (24h)</div>
    </div>
    <div class="flag">
      <div class="n">${d.multiSession.length}</div><div class="l">Users w/ 2 sessions</div>
    </div>
  </div>

  ${section(
    'High usage in the last 24 hours',
    'Users with ≥100 chats or ≥5 analyses across today + yesterday (Toronto).',
    [
      { label:'Email', key:'email', render:(r)=>`<span class="mono">${esc(r.email)}</span>` },
      { label:'Name',  key:'name' },
      { label:'Plan',  key:'plan',  render:(r)=>`<span class="pill pill-${esc(r.plan)}">${esc(r.plan)}</span>` },
      { label:'Chats', key:'chat_count' },
      { label:'Analyses', key:'analysis_count' },
      { label:'Tokens', key:'token_count' },
    ],
    d.highUsage
  )}

  ${section(
    `IP-flagged users (≥${IP_FLAG_THRESHOLD} distinct IPs in 24h)`,
    'Log + surface only — no auto-suspend. Investigate manually.',
    [
      { label:'Email', key:'email', render:(r)=>`<span class="mono">${esc(r.email)}</span>` },
      { label:'Name',  key:'name' },
      { label:'Plan',  key:'plan',  render:(r)=>`<span class="pill pill-${esc(r.plan)}">${esc(r.plan)}</span>` },
      { label:'Distinct IPs', key:'distinct_ips' },
      { label:'Last seen',    key:'last_seen', render:(r)=>fmtUnix(r.last_seen) },
    ],
    d.ipFlagged
  )}

  ${section(
    'Counsel — soft warn (≥150 messages today)',
    'Hard block at 200. Reset at midnight Toronto.',
    [
      { label:'Email', key:'email', render:(r)=>`<span class="mono">${esc(r.email)}</span>` },
      { label:'Name',  key:'name' },
      { label:'Chats today',    key:'chat_count' },
      { label:'Analyses today', key:'analysis_count' },
      { label:'Tokens today',   key:'token_count' },
    ],
    d.counselWarn
  )}

  ${section(
    'Top chat users — last 7 days',
    'Ranked by chat volume (Toronto days).',
    [
      { label:'Email', key:'email', render:(r)=>`<span class="mono">${esc(r.email)}</span>` },
      { label:'Name',  key:'name' },
      { label:'Plan',  key:'plan',  render:(r)=>`<span class="pill pill-${esc(r.plan)}">${esc(r.plan)}</span>` },
      { label:'Chats (7d)',    key:'chat_count' },
      { label:'Analyses (7d)', key:'analysis_count' },
      { label:'Tokens (7d)',   key:'token_count' },
    ],
    d.topChat
  )}

  ${section(
    'Users with 2 active sessions',
    'Informational — the 2-device cap is working as intended for these accounts.',
    [
      { label:'Email', key:'email', render:(r)=>`<span class="mono">${esc(r.email)}</span>` },
      { label:'Name',  key:'name' },
      { label:'Plan',  key:'plan',  render:(r)=>`<span class="pill pill-${esc(r.plan)}">${esc(r.plan)}</span>` },
      { label:'Sessions',  key:'session_count' },
      { label:'Last seen', key:'last_seen_at', render:(r)=>fmtUnix(r.last_seen_at) },
    ],
    d.multiSession
  )}
</main>
<footer>ClearStand admin &middot; rendered ${esc(new Date().toISOString())}</footer>
</body>
</html>`;

  res.type('text/html').send(html);
});

// ── GET /api/admin/usage.json ──
router.get('/usage.json', requireAdmin, (req, res) => {
  res.json(collectData());
});

// ── GET /api/admin/test-ip-alert (Session 4) ──
// Fires a dummy IP flag alert email to ADMIN_EMAIL so you can verify that
// Resend is wired up end-to-end without needing to actually trip a real
// flag. Does NOT touch the ip_events or users tables.
//
// Optional query params:
//   ?urgent=1   → use the URGENT subject line template
router.get('/test-ip-alert', requireAdmin, async (req, res) => {
  const urgent = req.query.urgent === '1' || req.query.urgent === 'true';
  try {
    const { sendIpFlagAlert } = require('../utils/email');
    const now = Math.floor(Date.now() / 1000);
    await sendIpFlagAlert({
      user: {
        id: 0,
        email: 'test-user@example.com',
        name: 'Test User (dummy — no real account)',
        plan: 'essential',
      },
      distinctIps: urgent ? 6 : 3,
      recentIps: [
        { ip_address: '203.0.113.10', first_seen: now - 80000, last_seen: now - 300   },
        { ip_address: '198.51.100.5', first_seen: now - 40000, last_seen: now - 1200  },
        { ip_address: '192.0.2.42',   first_seen: now - 10000, last_seen: now - 60    },
      ],
      urgent,
    });
    res.json({ ok: true, sentTo: ADMIN_EMAIL, urgent });
  } catch(err) {
    console.error('[test-ip-alert]', err);
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// ── GET /api/admin/stripe-events (Session 5) ──
// Recent Stripe webhook events with processing status. Errors surface
// here for triage — status='error' means the handler threw while processing
// the event. The row stays so Stripe retries dedupe correctly (we don't
// want an infinite retry loop on application bugs); manual replay is a
// deliberate operator action.
router.get('/stripe-events', requireAdmin, (req, res) => {
  const events = getRecentStripeEvents({ limit: 100 });
  const errorCount = events.filter((e) => e.status === 'error').length;
  const rows = events.map((e) => ({
    event_id: e.event_id,
    type: e.type,
    livemode: e.livemode ? 'live' : 'test',
    received_at: e.received_at ? new Date(e.received_at * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '',
    status: e.status,
    error_message: e.error_message || '',
  }));

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ClearStand Admin — Stripe events</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --navy:#0D1B2A; --steel:#2E86C1; --warn:#d97706; --err:#991B1B; --ok:#065f46; --bg:#f7f7f5; --border:#e3e3df; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:var(--navy); background:var(--bg); }
  header { background:var(--navy); color:#fff; padding:16px 24px; }
  header h1 { margin:0; font-size:20px; font-weight:600; }
  header .sub { color:#a7b5c2; font-size:13px; margin-top:4px; }
  header a { color:#a7b5c2; text-decoration:none; font-size:12px; margin-right:16px; }
  header a:hover { color:#fff; }
  main { max-width:1200px; margin:0 auto; padding:24px; }
  .flags { display:flex; gap:12px; margin:16px 0 24px; flex-wrap:wrap; }
  .flag { background:#fff; border:1px solid var(--border); border-radius:6px; padding:12px 16px; min-width:160px; }
  .flag .n { font-size:24px; font-weight:700; color:var(--navy); }
  .flag .l { font-size:12px; color:#666; text-transform:uppercase; letter-spacing:.04em; }
  .flag.err .n { color:var(--err); }
  section { background:#fff; border:1px solid var(--border); border-radius:6px; margin:16px 0; padding:16px 20px; }
  section h2 { margin:0 0 6px; font-size:16px; color:var(--steel); font-weight:600; }
  section .note { margin:0 0 12px; font-size:13px; color:#666; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--border); vertical-align:top; }
  th { background:#fafaf8; font-weight:600; color:#555; }
  td.empty { text-align:center; color:#999; padding:16px; }
  tr:last-child td { border-bottom:none; }
  .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  .pill-ok { background:#c7f0d6; color:var(--ok); }
  .pill-error { background:#fecaca; color:var(--err); }
  .pill-live { background:#dbeafe; color:#1e40af; }
  .pill-test { background:#eee; color:#555; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; }
  .errmsg { color:var(--err); font-size:12px; white-space:pre-wrap; word-break:break-word; max-width:400px; }
  footer { text-align:center; font-size:12px; color:#888; padding:24px; }
</style>
</head>
<body>
<header>
  <h1>ClearStand — Stripe events</h1>
  <div class="sub"><a href="/api/admin/usage">← Usage dashboard</a> &middot; Session 5 webhook audit</div>
</header>
<main>
  <div class="flags">
    <div class="flag"><div class="n">${events.length}</div><div class="l">Recent events</div></div>
    <div class="flag ${errorCount ? 'err' : ''}"><div class="n">${errorCount}</div><div class="l">With errors</div></div>
  </div>
  <section>
    <h2>Last 100 Stripe webhook events</h2>
    <p class="note">Top-level idempotency is handled by the <code>stripe_events</code> primary key. Rows with status=error mean the handler threw while processing an event we'd already committed to dedupe. Check logs for the stack trace, fix, and if needed replay from the Stripe dashboard (Developers → Events → Resend).</p>
    <table>
      <thead>
        <tr>
          <th>Received</th>
          <th>Type</th>
          <th>Mode</th>
          <th>Event ID</th>
          <th>Status</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length
          ? rows.map((r) => `
            <tr>
              <td class="mono">${esc(r.received_at)}</td>
              <td class="mono">${esc(r.type)}</td>
              <td><span class="pill pill-${esc(r.livemode)}">${esc(r.livemode)}</span></td>
              <td class="mono">${esc(r.event_id)}</td>
              <td><span class="pill pill-${esc(r.status)}">${esc(r.status)}</span></td>
              <td class="errmsg">${esc(r.error_message)}</td>
            </tr>`).join('')
          : `<tr><td colspan="6" class="empty">No events recorded yet.</td></tr>`}
      </tbody>
    </table>
  </section>
</main>
<footer>ClearStand admin &middot; rendered ${esc(new Date().toISOString())}</footer>
</body>
</html>`;

  res.type('text/html').send(html);
});

// ── GET /api/admin/stripe-events.json ──
router.get('/stripe-events.json', requireAdmin, (req, res) => {
  res.json({ events: getRecentStripeEvents({ limit: 100 }) });
});

module.exports = router;
