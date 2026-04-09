'use strict';

// Welcome email sender
// Uses fetch to call a simple email API or logs to console if not configured
// Set SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM in Railway variables to enable

async function sendWelcomeEmail(user) {
  const { email, name, plan = 'free' } = user;

  const subject = 'Welcome to ClearStand — Your account is ready';

  const body = `Hi ${name},

Your ClearStand account is ready. You now have access to Canada's most advanced legal preparation tools for self-represented litigants.

YOUR FREE PLAN INCLUDES:
→ 1 Crown disclosure analysis
→ 10 AI chat messages
→ All charge modules (Criminal Code coverage)
→ PDF export

GETTING STARTED:
Criminal Defence — clearstand.ca/criminal-app
Family Law — clearstand.ca/family

Start by uploading your Crown disclosure for a five-pass analysis, or ask the AI assistant about your charge or rights.

WHEN YOU'RE READY TO UPGRADE:
Essential — $29/month — 3 analyses, 50 chats/day
Complete — $79/month — 5 analyses, 100 chats/day, Criminal & Family
Counsel — $159/month — Unlimited + voice dictation, affidavit builder, cross-examination prep

IMPORTANT: ClearStand is a legal preparation tool, not legal advice. For serious matters, contact duty counsel or Legal Aid Ontario at 1-800-668-8258.

Your rights. Your case. Your ground.

ClearStand
clearstand.ca

---
You're receiving this because you created an account at clearstand.ca.
`;

  // Try to send via nodemailer if configured
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || 'ClearStand <hello@clearstand.ca>';

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: smtpUser, pass: smtpPass },
      });
      await transporter.sendMail({
        from: smtpFrom,
        to: email,
        subject,
        text: body,
      });
      console.log(`Welcome email sent to ${email}`);
    } catch(err) {
      console.error('Welcome email failed:', err.message);
    }
  } else {
    // Log to console until SMTP is configured
    console.log(`[WELCOME EMAIL - not sent, SMTP not configured]`);
    console.log(`To: ${email}`);
    console.log(`Subject: ${subject}`);
  }
}

module.exports = { sendWelcomeEmail };
