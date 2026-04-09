'use strict';

const nodemailer = require('nodemailer');

async function sendWelcomeEmail(user) {
  const { email, name } = user;

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || 'ClearStand <hello@clearstand.ca>';

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log(`[Welcome email not sent — SMTP not configured] To: ${email}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

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

  console.log(`Welcome email sent to ${email}`);
}

module.exports = { sendWelcomeEmail };
