'use strict';

async function sendWelcomeEmail(user) {
  const { email, name } = user;

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || 'ClearStand <hello@clearstand.ca>';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');

  console.log(`[Email] Attempting to send welcome email to ${email}`);
  console.log(`[Email] SMTP_HOST: ${smtpHost || 'NOT SET'}`);
  console.log(`[Email] SMTP_USER: ${smtpUser || 'NOT SET'}`);
  console.log(`[Email] SMTP_PASS: ${smtpPass ? 'SET (' + smtpPass.length + ' chars)' : 'NOT SET'}`);
  console.log(`[Email] SMTP_PORT: ${smtpPort}`);

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('[Email] SMTP not configured — skipping');
    return;
  }

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.verify();
    console.log('[Email] SMTP connection verified successfully');

    await transporter.sendMail({
      from: smtpFrom,
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
    });

    console.log(`[Email] Welcome email sent successfully to ${email}`);
  } catch(err) {
    console.error(`[Email] Failed to send to ${email}: ${err.message}`);
    console.error(`[Email] Error code: ${err.code}`);
    console.error(`[Email] Response: ${err.response}`);
  }
}

module.exports = { sendWelcomeEmail };
