'use strict';

async function sendWelcomeEmail(user) {
  const { email, name } = user;
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[Email] RESEND_API_KEY not set — skipping');
    return;
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'ClearStand <send.hello@clearstand.ca>',
        to: email,
        subject: 'Welcome to ClearStand — Your account is ready',
        text: `Hi ${name},

Your ClearStand account is ready.

GETTING STARTED:
Criminal Defence — clearstand.ca/criminal-app
Family Law — clearstand.ca/family

YOUR FREE PLAN INCLUDES:
- 1 Crown disclosure analysis
- 10 AI chat messages
- All charge modules
- PDF export

UPGRADE ANYTIME:
Essential — $29/month
Complete — $79/month
Counsel — $159/month (unlimited + premium features)

ClearStand is a legal preparation tool, not legal advice.
For serious matters contact Legal Aid Ontario: 1-800-668-8258

Your rights. Your case. Your ground.
ClearStand — clearstand.ca`,
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

module.exports = { sendWelcomeEmail };
