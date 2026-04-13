'use strict';

function buildWelcomeHtml(firstName) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Welcome to ClearStand</title>
<style>
  @media only screen and (max-width: 600px) {
    .email-wrapper { padding: 0 !important; }
    .email-card { border-radius: 0 !important; }
    .product-card { display: block !important; width: 100% !important; margin-bottom: 12px !important; }
    .product-card-spacer { display: none !important; }
    .btn-full { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
    .hero-h1 { font-size: 26px !important; }
    .body-pad { padding: 28px 24px !important; }
    .hero-pad { padding: 32px 24px 40px 24px !important; }
    .cards-pad { padding: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F6F8;">
  <tr>
    <td align="center" class="email-wrapper" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;" class="email-card">

        <!-- HEADER -->
        <tr>
          <td align="center" style="background-color:#0D1B2A;padding:24px;border-radius:8px 8px 0 0;">
            <span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;letter-spacing:-0.01em;">
              <span style="color:#FFFFFF;">Clear</span><span style="color:#2E86C1;">Stand</span>
            </span>
          </td>
        </tr>

        <!-- HERO -->
        <tr>
          <td align="center" class="hero-pad" style="background-color:#0D1B2A;padding:40px 40px 48px 40px;">
            <p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.16em;color:#2E86C1;">Canadian Legal Preparation</p>
            <h1 class="hero-h1" style="margin:0 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:700;line-height:1.2;color:#FFFFFF;">You're in.<br>Let's get you ready.</h1>
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(244,246,248,0.65);max-width:420px;">Your ClearStand account is active. Here's everything you need to know to get started.</p>
          </td>
        </tr>

        <!-- GREETING -->
        <tr>
          <td class="body-pad" style="background-color:#FFFFFF;padding:40px;">
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#0D1B2A;">Hi ${firstName},</p>
            <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#0D1B2A;">Welcome to ClearStand. You now have access to AI-assisted legal preparation tools built specifically for self-represented Canadians.</p>
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#0D1B2A;">Your free account is active and ready to use &mdash; no credit card required.</p>
          </td>
        </tr>

        <!-- FREE PLAN -->
        <tr>
          <td class="body-pad" style="background-color:#FFFFFF;padding:0 40px 40px 40px;border-top:1px solid #EEF0F2;">
            <p style="margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.16em;color:#2E86C1;padding-top:32px;">Your Free Plan Includes</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="padding:9px 0;border-bottom:1px solid #F0F2F4;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="width:20px;vertical-align:top;"><span style="color:#2E86C1;font-size:16px;font-weight:700;line-height:1.5;">&#10003;</span></td>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0D1B2A;line-height:1.5;padding-left:10px;">1 Crown disclosure analysis</td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:9px 0;border-bottom:1px solid #F0F2F4;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="width:20px;vertical-align:top;"><span style="color:#2E86C1;font-size:16px;font-weight:700;line-height:1.5;">&#10003;</span></td>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0D1B2A;line-height:1.5;padding-left:10px;">10 AI chat messages</td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:9px 0;border-bottom:1px solid #F0F2F4;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="width:20px;vertical-align:top;"><span style="color:#2E86C1;font-size:16px;font-weight:700;line-height:1.5;">&#10003;</span></td>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0D1B2A;line-height:1.5;padding-left:10px;">All charge modules and court forms</td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:9px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="width:20px;vertical-align:top;"><span style="color:#2E86C1;font-size:16px;font-weight:700;line-height:1.5;">&#10003;</span></td>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0D1B2A;line-height:1.5;padding-left:10px;">PDF export on all documents</td>
                </tr></table>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- PRODUCT CARDS -->
        <tr>
          <td class="cards-pad" style="background-color:#F4F6F8;padding:40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="product-card" width="48%" valign="top" style="background-color:#0D1B2A;padding:28px 24px;border-radius:4px;">
                  <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.16em;color:#2E86C1;">Family Law</p>
                  <h2 style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;line-height:1.25;color:#FFFFFF;">Fight for what your family deserves.</h2>
                  <p style="margin:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:rgba(244,246,248,0.6);">Custody. Support. Separation. Document analysis and court-ready forms.</p>
                  <a href="https://clearstand.ca/family" style="display:inline-block;background-color:#2E86C1;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:3px;" class="btn-full">Open Family Law &#8594;</a>
                </td>
                <td class="product-card-spacer" width="4%"></td>
                <td class="product-card" width="48%" valign="top" style="background-color:#1a2f45;padding:28px 24px;border-radius:4px;">
                  <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.16em;color:#2E86C1;">Criminal Defence</p>
                  <h2 style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;line-height:1.25;color:#FFFFFF;">Know your rights. Use them.</h2>
                  <p style="margin:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:rgba(244,246,248,0.6);">Crown disclosure analysis. Charter rights. Cross-examination preparation.</p>
                  <a href="https://clearstand.ca/criminal-app" style="display:inline-block;background-color:#2E86C1;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:3px;" class="btn-full">Open Criminal Defence &#8594;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- UPGRADE NUDGE -->
        <tr>
          <td align="center" class="body-pad" style="background-color:#FFFFFF;padding:40px;">
            <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.16em;color:#2E86C1;">Want More?</p>
            <h2 style="margin:0 0 28px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#0D1B2A;line-height:1.3;">Upgrade anytime.<br>Cancel anytime.</h2>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;margin:0 auto 28px auto;text-align:left;">
              <tr><td style="padding:14px 0;border-bottom:1px solid #EEF0F2;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#0D1B2A;">Essential <span style="color:#2E86C1;">&#8212; $29/month</span></p>
                <p style="margin:4px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7A8D;">3 analyses &middot; 50 chats per day</p>
              </td></tr>
              <tr><td style="padding:14px 0;border-bottom:1px solid #EEF0F2;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#0D1B2A;">Complete <span style="color:#2E86C1;">&#8212; $79/month</span></p>
                <p style="margin:4px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7A8D;">5 analyses &middot; 100 chats &middot; Criminal &amp; Family</p>
              </td></tr>
              <tr><td style="padding:14px 0;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#0D1B2A;">Counsel <span style="color:#2E86C1;">&#8212; $159/month</span></p>
                <p style="margin:4px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7A8D;">Unlimited everything + premium features<br>Dictation &middot; Affidavit builder &middot; Cross-examination prep</p>
              </td></tr>
            </table>
            <a href="https://clearstand.ca/#pricing" style="display:inline-block;background-color:#2E86C1;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:3px;" class="btn-full">View All Plans</a>
          </td>
        </tr>

        <!-- SUPPORT -->
        <tr>
          <td align="center" style="background-color:#F4F6F8;padding:24px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7A8D;">Questions? We're here to help. &nbsp;<a href="mailto:support@clearstand.ca" style="color:#2E86C1;text-decoration:none;font-weight:600;">support@clearstand.ca</a></p>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td align="center" style="background-color:#0D1B2A;padding:32px 24px;border-radius:0 0 8px 8px;">
            <p style="margin:0 0 6px 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;">
              <span style="color:#FFFFFF;">Clear</span><span style="color:#2E86C1;">Stand</span>
            </p>
            <p style="margin:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:rgba(244,246,248,0.4);letter-spacing:0.04em;">Your rights. Your case. Your ground.</p>
            <p style="margin:0 0 20px 0;">
              <a href="https://clearstand.ca/privacy-policy" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#2E86C1;text-decoration:none;">Privacy Policy</a>
              <span style="color:rgba(244,246,248,0.2);margin:0 8px;">|</span>
              <a href="https://clearstand.ca/terms-of-use" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#2E86C1;text-decoration:none;">Terms of Use</a>
              <span style="color:rgba(244,246,248,0.2);margin:0 8px;">|</span>
              <a href="https://clearstand.ca/unsubscribe" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#2E86C1;text-decoration:none;">Unsubscribe</a>
            </p>
            <p style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:rgba(244,246,248,0.3);">ClearStand is a legal preparation tool, not a substitute for legal advice.</p>
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:rgba(244,246,248,0.3);">ClearStand &mdash; Ontario, Canada &nbsp;&middot;&nbsp; clearstand.ca</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}

function buildWelcomeText(firstName) {
  return `Hi ${firstName},

Welcome to ClearStand. Your account is active and ready to use — no credit card required.

YOUR FREE PLAN INCLUDES:
✓ 1 Crown disclosure analysis
✓ 10 AI chat messages
✓ All charge modules and court forms
✓ PDF export on all documents

GET STARTED:
Family Law — https://clearstand.ca/family
Criminal Defence — https://clearstand.ca/criminal-app

UPGRADE ANYTIME:
Essential — $29/month
3 analyses · 50 chats per day

Complete — $79/month
5 analyses · 100 chats · Criminal & Family

Counsel — $159/month
Unlimited everything + premium features
Dictation · Affidavit builder · Cross-examination prep

View all plans: https://clearstand.ca/#pricing

---
Questions? support@clearstand.ca

ClearStand — Ontario, Canada
Your rights. Your case. Your ground.
clearstand.ca

ClearStand is a legal preparation tool, not a substitute for legal advice.
To unsubscribe: https://clearstand.ca/unsubscribe`;
}

async function sendWelcomeEmail(user) {
  const { email, name } = user;
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[Email] RESEND_API_KEY not set — skipping');
    return;
  }

  const firstName = name ? name.trim().split(' ')[0] : 'there';

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'ClearStand <hello@clearstand.ca>',
        to: email,
        subject: "You're in. Let's get you ready.",
        html: buildWelcomeHtml(firstName),
        text: buildWelcomeText(firstName),
        headers: {
          'X-Entity-Ref-ID': `welcome-${Date.now()}`,
        },
      }),
    });

    const data = await resp.json();
    if (resp.ok) {
      console.log(`[Email] Welcome email sent to ${email} — ID: ${data.id}`);
    } else {
      console.error(`[Email] Resend error: ${JSON.stringify(data)}`);
    }
  } catch(err) {
    console.error(`[Email] Failed: ${err.message}`);
  }
}

module.exports = { sendWelcomeEmail, sendClearSplitPurchaseEmail, sendClearSplitExtensionEmail };

// ══════════════════════════════════════════════════
// CLEARSPLIT PURCHASE CONFIRMATION EMAIL
// ══════════════════════════════════════════════════
async function sendClearSplitPurchaseEmail({ email, code, expiresAt }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.log('[Email] RESEND_API_KEY not set — skipping ClearSplit email'); return; }

  const expiryStr = new Date(expiresAt).toLocaleDateString('en-CA', { year:'numeric', month:'long', day:'numeric' });
  const codeSpaced = code.split('').join(' ');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Your ClearSplit Access Code</title></head>
<body style="margin:0;padding:0;background-color:#F4F6F8;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F6F8;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;border-radius:8px;overflow:hidden;">

      <!-- HEADER -->
      <tr><td align="center" style="background:#0D1B2A;padding:24px;border-radius:8px 8px 0 0;">
        <span style="font-family:Georgia,serif;font-size:24px;font-weight:700;">
          <span style="color:#fff;">Clear</span><span style="color:#20B2AA;">Split</span>
        </span>
      </td></tr>

      <!-- CODE SECTION -->
      <tr><td align="center" style="background:#0D1B2A;padding:40px 40px 48px;">
        <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.18em;color:#20B2AA;">Your Access Code</p>
        <div style="background:rgba(32,178,170,.1);border:2px solid rgba(32,178,170,.4);padding:24px 32px;margin:0 auto 20px;display:inline-block;">
          <span style="font-family:Courier New,monospace;font-size:36px;font-weight:700;color:#fff;letter-spacing:0.3em;">${codeSpaced}</span>
        </div>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:1.65;color:rgba(244,246,248,0.7);">Share this code with the other party.<br>Both of you will use this same code to access your agreement.</p>
      </td></tr>

      <!-- HOW TO GET STARTED -->
      <tr><td style="background:#fff;padding:40px;">
        <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.16em;color:#2E86C1;">How to Get Started</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:10px 0;border-bottom:1px solid #F0F2F4;">
            <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#2E86C1;">Step 1</span>
            <span style="font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;padding-left:10px;">Share code <strong>${code}</strong> with the other party by text or email</span>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #F0F2F4;">
            <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#2E86C1;">Step 2</span>
            <span style="font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;padding-left:10px;">Both visit: <strong>clearstand.ca/clearsplit/access</strong></span>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #F0F2F4;">
            <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#2E86C1;">Step 3</span>
            <span style="font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;padding-left:10px;">Enter your code on your own device and work on the agreement together or separately</span>
          </td></tr>
          <tr><td style="padding:10px 0;">
            <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#2E86C1;">Step 4</span>
            <span style="font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;padding-left:10px;">When ready, export your final agreement as a PDF</span>
          </td></tr>
        </table>
      </td></tr>

      <!-- ACCESS DETAILS -->
      <tr><td style="background:#F4F6F8;padding:28px 40px;">
        <p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;color:#6B7A8D;">Access Details</p>
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;">Code: <strong style="font-family:Courier New,monospace;letter-spacing:0.1em;">${code}</strong></p>
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;">Access expires: <strong>${expiryStr}</strong></p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#6B7A8D;">Need more time? Extend for $74 at: clearstand.ca/clearsplit/extend</p>
      </td></tr>

      <!-- SUPPORT -->
      <tr><td align="center" style="background:#fff;padding:24px 40px;">
        <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#6B7A8D;">Questions? <a href="mailto:support@clearstand.ca" style="color:#20B2AA;text-decoration:none;font-weight:600;">support@clearstand.ca</a></p>
      </td></tr>

      <!-- FOOTER -->
      <tr><td align="center" style="background:#0D1B2A;padding:28px 24px;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:16px;font-weight:700;"><span style="color:#fff;">Clear</span><span style="color:#20B2AA;">Stand</span></p>
        <p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:11px;color:rgba(244,246,248,0.35);">Your rights. Your case. Your ground.</p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:rgba(244,246,248,0.25);">clearstand.ca &nbsp;·&nbsp; ClearStand — Ontario, Canada</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  const text = `Your ClearSplit Access Code: ${code}

Share this code with the other party. Both of you visit:
clearstand.ca/clearsplit/access

HOW TO GET STARTED:
1. Share code ${code} with the other party
2. Both visit: clearstand.ca/clearsplit/access
3. Enter your code on your own device
4. Export your final agreement as a PDF

ACCESS DETAILS:
Code: ${code}
Access expires: ${expiryStr}
Need more time? Extend for $74 at: clearstand.ca/clearsplit/extend

Questions? support@clearstand.ca
ClearStand — Ontario, Canada — clearstand.ca`;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'ClearStand <hello@clearstand.ca>',
        to: email,
        subject: `Your ClearSplit access code: ${code}`,
        html,
        text,
      }),
    });
    const data = await resp.json();
    if (resp.ok) console.log(`[Email] ClearSplit purchase email sent to ${email} — ID: ${data.id}`);
    else console.error(`[Email] ClearSplit email error: ${JSON.stringify(data)}`);
  } catch(err) {
    console.error(`[Email] ClearSplit email failed: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════
// CLEARSPLIT EXTENSION CONFIRMATION EMAIL
// ══════════════════════════════════════════════════
async function sendClearSplitExtensionEmail({ email, code, previousExpiry, newExpiry }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const fmt = (d) => new Date(d).toLocaleDateString('en-CA', { year:'numeric', month:'long', day:'numeric' });

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'ClearStand <hello@clearstand.ca>',
        to: email,
        subject: 'Your ClearSplit access has been extended',
        text: `Your ClearSplit access has been extended.

Code: ${code}
Previous expiry: ${fmt(previousExpiry)}
New expiry: ${fmt(newExpiry)}

Access your agreement at:
clearstand.ca/clearsplit/access

Questions? support@clearstand.ca
ClearStand — clearstand.ca`,
      }),
    });
    console.log(`[Email] ClearSplit extension email sent to ${email}`);
  } catch(err) {
    console.error(`[Email] Extension email failed: ${err.message}`);
  }
}
