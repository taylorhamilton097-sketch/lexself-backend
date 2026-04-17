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
                <p style="margin:4px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7A8D;">5 analyses &middot; 100 chats per day</p>
              </td></tr>
              <tr><td style="padding:14px 0;border-bottom:1px solid #EEF0F2;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#0D1B2A;">Counsel <span style="color:#2E86C1;">&#8212; $159/month</span></p>
                <p style="margin:4px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7A8D;">Unlimited everything &middot; Dictation &middot; Affidavit builder &middot; Cross-examination prep</p>
              </td></tr>
              <tr><td style="padding:14px 0;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#0D1B2A;">Bundle Plans <span style="color:#2E86C1;">&#8212; from $49/month</span></p>
                <p style="margin:4px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6B7A8D;">Both Family Law + Criminal Defence &middot; Save up to $39/month</p>
              </td></tr>
            </table>
            <a href="https://clearstand.ca/pricing" style="display:inline-block;background-color:#2E86C1;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:3px;" class="btn-full">View All Plans</a>
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
5 analyses · 100 chats per day

Counsel — $159/month
Unlimited everything · Dictation · Affidavit builder · Cross-examination prep

Bundle Plans — from $49/month
Both Family Law + Criminal Defence · Save up to $39/month

View all plans: https://clearstand.ca/pricing

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

// ══════════════════════════════════════════════════
// SHARED EMAIL HELPERS
// ══════════════════════════════════════════════════
function emailHeader(title) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#F4F6F8;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F6F8;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;border-radius:8px;overflow:hidden;">
<tr><td align="center" style="background:#0D1B2A;padding:24px;border-radius:8px 8px 0 0;">
  <span style="font-family:Georgia,serif;font-size:24px;font-weight:700;"><span style="color:#fff;">Clear</span><span style="color:#2E86C1;">Stand</span></span>
</td></tr>`;
}

function emailFooter() {
  return `<tr><td align="center" style="background:#0D1B2A;padding:28px 24px;border-radius:0 0 8px 8px;">
  <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:16px;font-weight:700;"><span style="color:#fff;">Clear</span><span style="color:#2E86C1;">Stand</span></p>
  <p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:11px;color:rgba(244,246,248,0.35);">Your rights. Your case. Your ground.</p>
  <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:rgba(244,246,248,0.25);">ClearStand — Ontario, Canada &nbsp;·&nbsp; clearstand.ca</p>
</td></tr></table></td></tr></table></body></html>`;
}

function emailSupport() {
  return `<tr><td align="center" style="background:#fff;padding:20px 40px;">
  <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#6B7A8D;">Questions? <a href="mailto:support@clearstand.ca" style="color:#2E86C1;text-decoration:none;font-weight:600;">support@clearstand.ca</a></p>
</td></tr>`;
}

// ══════════════════════════════════════════════════
// EMAIL 1 — Purchase confirmation to Party 1
// ══════════════════════════════════════════════════
async function sendClearSplitPurchaseEmail({ email, code, activeUntil, sessionId }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.log('[Email] Skipping ClearSplit purchase email — no API key'); return; }

  const expiryStr = new Date(activeUntil).toLocaleDateString('en-CA', { year:'numeric', month:'long', day:'numeric' });
  const codeSpaced = code.split('').join(' ');
  const registerUrl = `${process.env.APP_URL || 'https://clearstand.ca'}/clearsplit/register?session_id=${sessionId || ''}&role=party1`;

  const html = emailHeader('Your ClearSplit Access Code') + `
<tr><td align="center" style="background:#0D1B2A;padding:40px 40px 48px;">
  <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.18em;color:#2E86C1;">Your Access Code</p>
  <div style="background:rgba(46,134,193,.12);border:2px solid rgba(46,134,193,.4);padding:24px 32px;display:inline-block;margin-bottom:20px;">
    <span style="font-family:'Courier New',monospace;font-size:36px;font-weight:700;color:#fff;letter-spacing:0.35em;">${codeSpaced}</span>
  </div>
  <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:1.65;color:rgba(244,246,248,0.7);">Share this code with the other party.<br>They visit <strong style="color:#fff;">clearstand.ca/clearsplit</strong> and enter this code to create their account.</p>
</td></tr>
<tr><td style="background:#fff;padding:40px;">
  <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;color:#2E86C1;">Next Steps</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:10px 0;border-bottom:1px solid #F0F2F4;"><span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#2E86C1;">Step 1</span><span style="font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;padding-left:10px;">Create your ClearSplit account to access your agreement</span></td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #F0F2F4;"><span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#2E86C1;">Step 2</span><span style="font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;padding-left:10px;">Share code <strong style="font-family:'Courier New',monospace;">${code}</strong> with the other party</span></td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #F0F2F4;"><span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#2E86C1;">Step 3</span><span style="font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;padding-left:10px;">They visit clearstand.ca/clearsplit and enter the code to join</span></td></tr>
    <tr><td style="padding:10px 0;"><span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#2E86C1;">Step 4</span><span style="font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;padding-left:10px;">Work on your agreement together — export your PDF when ready</span></td></tr>
  </table>
</td></tr>
<tr><td style="background:#F4F6F8;padding:28px 40px;">
  <p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6B7A8D;">Agreement Details</p>
  <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;">Code: <strong style="font-family:'Courier New',monospace;letter-spacing:0.1em;">${code}</strong></p>
  <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;">Active editing until: <strong>${expiryStr}</strong></p>
  <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#6B7A8D;">Your agreement is saved permanently — free to access forever.</p>
</td></tr>
${emailSupport()}${emailFooter()}`;

  const text = `Your ClearSplit Access Code: ${code}\n\nShare this code with the other party. They visit clearstand.ca/clearsplit and enter this code to create their account and join your agreement.\n\nAgreement Details:\nCode: ${code}\nActive editing until: ${expiryStr}\nYour agreement is saved permanently — free to access forever.\n\nQuestions? support@clearstand.ca\nClearStand — clearstand.ca`;

  await sendEmail({ to: email, subject: `Your ClearSplit code: ${code}`, html, text });
}

// ══════════════════════════════════════════════════
// EMAIL 2 — Welcome to Party 2
// ══════════════════════════════════════════════════
async function sendClearSplitParty2Email({ email, firstName, party1FirstName, activeUntil }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const expiryStr = new Date(activeUntil).toLocaleDateString('en-CA', { year:'numeric', month:'long', day:'numeric' });

  const html = emailHeader("You've joined the ClearSplit agreement") + `
<tr><td style="background:#0D1B2A;padding:40px 40px 48px;text-align:center;">
  <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#fff;line-height:1.2;">You're in.</h1>
  <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:rgba(244,246,248,0.65);line-height:1.65;">You now have access to your shared separation agreement with ${party1FirstName}.</p>
</td></tr>
<tr><td style="background:#fff;padding:40px;">
  <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:16px;color:#0D1B2A;">Hi ${firstName},</p>
  <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#0D1B2A;">Your ClearSplit account is ready. Sign in at any time to view, edit, and export your agreement.</p>
  <p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#0D1B2A;">Your agreement is saved permanently in your account — free to access and download forever.</p>
  <a href="${process.env.APP_URL || 'https://clearstand.ca'}/clearsplit/app" style="display:inline-block;background:#2E86C1;color:#fff;font-family:Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:3px;">Access My Agreement →</a>
</td></tr>
<tr><td style="background:#F4F6F8;padding:24px 40px;">
  <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;">Active editing until: <strong>${expiryStr}</strong></p>
  <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#6B7A8D;">Your agreement is saved permanently — free to access forever.</p>
</td></tr>
${emailSupport()}${emailFooter()}`;

  const text = `Hi ${firstName},\n\nYou now have access to your shared separation agreement with ${party1FirstName}.\n\nAccess your agreement at: clearstand.ca/clearsplit/app\n\nActive editing until: ${expiryStr}\nYour agreement is saved permanently — free to access forever.\n\nQuestions? support@clearstand.ca\nClearStand — clearstand.ca`;

  await sendEmail({ to: email, subject: "You've joined the ClearSplit agreement", html, text });
}

// ══════════════════════════════════════════════════
// EMAIL 3 — 14-day expiry warning (sent to both parties)
// ══════════════════════════════════════════════════
async function sendClearSplitExpiryWarningEmail({ email, firstName, activeUntil }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const expiryStr = new Date(activeUntil).toLocaleDateString('en-CA', { year:'numeric', month:'long', day:'numeric' });

  const html = emailHeader('Your ClearSplit agreement editing period ends soon') + `
<tr><td style="background:#0D1B2A;padding:40px;text-align:center;">
  <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:26px;color:#fff;line-height:1.2;">Your active editing period<br>ends in 14 days.</h1>
  <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:rgba(244,246,248,0.65);">Ends on: <strong style="color:#fff;">${expiryStr}</strong></p>
</td></tr>
<tr><td style="background:#fff;padding:40px;">
  <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:16px;color:#0D1B2A;">Hi ${firstName},</p>
  <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#0D1B2A;">After this date:</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
    <tr><td style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;"><span style="color:#2E86C1;margin-right:8px;">✓</span> Your agreement is saved permanently — free forever</td></tr>
    <tr><td style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;"><span style="color:#2E86C1;margin-right:8px;">✓</span> PDF download remains available always at no cost</td></tr>
    <tr><td style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;color:#6B7A8D;"><span style="color:#999;margin-right:8px;">✗</span> Active editing and AI assistance will no longer be available</td></tr>
  </table>
  <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#0D1B2A;">If you need more time to finalize your agreement:</p>
  <a href="${process.env.APP_URL || 'https://clearstand.ca'}/clearsplit/extend" style="display:inline-block;background:#2E86C1;color:#fff;font-family:Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:3px;">Extend My Access — $74 →</a>
</td></tr>
${emailSupport()}${emailFooter()}`;

  const text = `Hi ${firstName},\n\nYour ClearSplit active editing period ends on ${expiryStr}.\n\nAfter this date:\n✓ Your agreement is saved permanently — free forever\n✓ PDF download remains available always at no cost\n✗ Active editing and AI assistance will no longer be available\n\nNeed more time? Extend at: clearstand.ca/clearsplit/extend ($74)\n\nQuestions? support@clearstand.ca\nClearStand — clearstand.ca`;

  await sendEmail({ to: email, subject: `Your ClearSplit agreement editing period ends in 14 days`, html, text });
}

// ══════════════════════════════════════════════════
// EMAIL 4 — Extension confirmation (sent to both parties)
// ══════════════════════════════════════════════════
async function sendClearSplitExtensionEmail({ email, firstName, previousExpiry, newExpiry }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const fmt = d => new Date(d).toLocaleDateString('en-CA', { year:'numeric', month:'long', day:'numeric' });

  const html = emailHeader('Your ClearSplit access has been extended') + `
<tr><td style="background:#0D1B2A;padding:40px;text-align:center;">
  <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:26px;color:#fff;">Your access has been extended.</h1>
</td></tr>
<tr><td style="background:#fff;padding:40px;">
  <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:16px;color:#0D1B2A;">Hi ${firstName},</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
    <tr><td style="padding:10px 0;border-bottom:1px solid #F0F2F4;"><span style="font-family:Arial,sans-serif;font-size:14px;color:#6B7A8D;">Previous expiry</span></td><td style="padding:10px 0;border-bottom:1px solid #F0F2F4;text-align:right;font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;">${fmt(previousExpiry)}</td></tr>
    <tr><td style="padding:10px 0;"><span style="font-family:Arial,sans-serif;font-size:14px;color:#6B7A8D;">New expiry</span></td><td style="padding:10px 0;text-align:right;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#2E86C1;">${fmt(newExpiry)}</td></tr>
  </table>
  <a href="${process.env.APP_URL || 'https://clearstand.ca'}/clearsplit/app" style="display:inline-block;background:#2E86C1;color:#fff;font-family:Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:3px;">Access My Agreement →</a>
</td></tr>
${emailSupport()}${emailFooter()}`;

  const text = `Hi ${firstName},\n\nYour ClearSplit access has been extended.\n\nPrevious expiry: ${fmt(previousExpiry)}\nNew expiry: ${fmt(newExpiry)}\n\nAccess your agreement: clearstand.ca/clearsplit/app\n\nQuestions? support@clearstand.ca\nClearStand — clearstand.ca`;

  await sendEmail({ to: email, subject: 'Your ClearSplit access has been extended', html, text });
}

// ── Shared send helper ──
async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.log(`[Email] No API key — skipping: ${subject}`); return; }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'ClearStand <hello@clearstand.ca>', to, subject, html, text }),
    });
    const data = await resp.json();
    if (resp.ok) console.log(`[Email] Sent "${subject}" to ${to} — ID: ${data.id}`);
    else console.error(`[Email] Error: ${JSON.stringify(data)}`);
  } catch(err) {
    console.error(`[Email] Failed "${subject}": ${err.message}`);
  }
}

// ══════════════════════════════════════════════════
// EMAIL 5 — Spouse invitation from Party 1
// ══════════════════════════════════════════════════
async function sendClearSplitInviteEmail({ toEmail, party1FirstName, code, activeUntil }) {
  const expiryStr = new Date(activeUntil).toLocaleDateString('en-CA', { year:'numeric', month:'long', day:'numeric' });
  const codeSpaced = code.split('').join(' ');
  const joinUrl = `${process.env.APP_URL || 'https://clearstand.ca'}/clearsplit`;

  const html = emailHeader('You have been invited to a ClearSplit agreement') + `
<tr><td align="center" style="background:#0D1B2A;padding:40px 40px 48px;">
  <p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.18em;color:#2E86C1;">Separation Agreement</p>
  <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#fff;line-height:1.2;">${party1FirstName} has invited you<br>to a shared agreement.</h1>
  <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:rgba(244,246,248,0.65);line-height:1.65;">Use the code below to create your account and join the ClearSplit agreement.</p>
</td></tr>
<tr><td align="center" style="background:#162233;padding:32px 40px;">
  <p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.16em;color:#2E86C1;">Your Access Code</p>
  <div style="background:rgba(46,134,193,.12);border:2px solid rgba(46,134,193,.4);padding:20px 32px;display:inline-block;margin-bottom:20px;">
    <span style="font-family:'Courier New',monospace;font-size:36px;font-weight:700;color:#fff;letter-spacing:0.35em;">${codeSpaced}</span>
  </div>
  <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:rgba(244,246,248,0.55);">Active until: <strong style="color:#fff;">${expiryStr}</strong></p>
</td></tr>
<tr><td style="background:#fff;padding:40px;">
  <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.14em;color:#2E86C1;">How to get started</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
    <tr><td style="padding:10px 0;border-bottom:1px solid #F0F2F4;">
      <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#2E86C1;">Step 1</span>
      <span style="font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;padding-left:10px;">Visit <a href="${joinUrl}" style="color:#2E86C1;text-decoration:none;font-weight:600;">clearstand.ca/clearsplit</a></span>
    </td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #F0F2F4;">
      <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#2E86C1;">Step 2</span>
      <span style="font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;padding-left:10px;">Click <strong>"Join with Code"</strong> and enter your code</span>
    </td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #F0F2F4;">
      <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#2E86C1;">Step 3</span>
      <span style="font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;padding-left:10px;">Create your free account to access the shared agreement</span>
    </td></tr>
    <tr><td style="padding:10px 0;">
      <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#2E86C1;">Step 4</span>
      <span style="font-family:Arial,sans-serif;font-size:14px;color:#0D1B2A;padding-left:10px;">Work through the agreement together and export your PDF</span>
    </td></tr>
  </table>
  <a href="${joinUrl}" style="display:inline-block;background:#2E86C1;color:#fff;font-family:Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:3px;">Join the Agreement →</a>
</td></tr>
<tr><td style="background:#F4F6F8;padding:20px 40px;">
  <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#6B7A8D;line-height:1.6;">ClearSplit is a collaborative separation agreement tool built for uncontested separations. It does not provide legal advice. If you have any concerns, please consult a lawyer before proceeding.</p>
</td></tr>
${emailSupport()}${emailFooter()}`;

  const text = `${party1FirstName} has invited you to a shared ClearSplit separation agreement.

Your Access Code: ${code}

How to get started:
1. Visit clearstand.ca/clearsplit
2. Click "Join with Code" and enter: ${code}
3. Create your free account
4. Work through the agreement together

Active until: ${expiryStr}

Questions? support@clearstand.ca
ClearStand — clearstand.ca

ClearSplit does not provide legal advice. If you have concerns, consult a lawyer.`;

  await sendEmail({ to: toEmail, subject: `${party1FirstName} has invited you to a ClearSplit agreement`, html, text });
}

module.exports = {
  sendWelcomeEmail,
  sendClearSplitPurchaseEmail,
  sendClearSplitInviteEmail,
  sendClearSplitParty2Email,
  sendClearSplitExpiryWarningEmail,
  sendClearSplitExtensionEmail,
};
