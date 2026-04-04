# LexSelf — Stripe + Deployment Setup Guide

## Step 1: Create Stripe Products and Prices

Go to https://dashboard.stripe.com → Products

Create these 8 products (all monthly recurring, CAD currency):

| Product Name                    | Price    | Env Variable                    |
|---------------------------------|----------|---------------------------------|
| LexSelf Criminal Essential      | $24.99   | STRIPE_PRICE_CRIMINAL_ESSENTIAL |
| LexSelf Criminal Complete       | $44.99   | STRIPE_PRICE_CRIMINAL_COMPLETE  |
| LexSelf Family Essential        | $24.99   | STRIPE_PRICE_FAMILY_ESSENTIAL   |
| LexSelf Family Complete         | $44.99   | STRIPE_PRICE_FAMILY_COMPLETE    |
| LexSelf Both Essential          | $39.99   | STRIPE_PRICE_BOTH_ESSENTIAL     |
| LexSelf Both Complete           | $59.99   | STRIPE_PRICE_BOTH_COMPLETE      |

One-time products (handled dynamically in code — no Price ID needed):
- LexSelf Criminal Analysis — $49 CAD
- LexSelf Family Analysis   — $49 CAD

## Step 2: Set Up Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: https://yourdomain.com/api/billing/webhook
3. Events to listen for:
   - checkout.session.completed
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
   - invoice.payment_failed
4. Copy the Signing Secret → set as STRIPE_WEBHOOK_SECRET

## Step 3: Set Up Customer Portal

1. Go to Stripe Dashboard → Settings → Billing → Customer Portal
2. Enable: Cancel subscriptions, Update payment methods, Invoice history
3. Set return URL: https://yourdomain.com/

## Step 4: Railway Deployment

### Option A: Single Server (both products)
1. Create GitHub repo → push lexself-shared/
2. Railway → New Project → Deploy from GitHub
3. Set all environment variables (see .env.example)
4. Railway gives you: yourapp.up.railway.app

### Option B: Separate Deployments (recommended for separate domains)
1. Deploy Criminal: push lexself-criminal-v3/ → criminal.lexself.ca
2. Deploy Family:   point to same shared backend → family.lexself.ca
3. Both apps share same database and auth

## Step 5: Custom Domains

In Railway → Your project → Settings → Domains:
- lexself.ca          → Landing page
- criminal.lexself.ca → Criminal app
- family.lexself.ca   → Family app

In your domain registrar (Namecheap etc.):
- Add CNAME records pointing each subdomain to Railway URL
- SSL is automatic

## Step 6: Environment Variables Checklist

Copy .env.example to .env and fill in:

□ ANTHROPIC_API_KEY          — from console.anthropic.com
□ JWT_SECRET                 — random 32+ char string
□ STRIPE_SECRET_KEY          — from Stripe Dashboard → API Keys
□ STRIPE_WEBHOOK_SECRET      — from Stripe Dashboard → Webhooks
□ STRIPE_PRICE_CRIMINAL_ESSENTIAL
□ STRIPE_PRICE_CRIMINAL_COMPLETE
□ STRIPE_PRICE_FAMILY_ESSENTIAL
□ STRIPE_PRICE_FAMILY_COMPLETE
□ STRIPE_PRICE_BOTH_ESSENTIAL
□ STRIPE_PRICE_BOTH_COMPLETE
□ ADMIN_PASSWORD             — choose a strong password
□ APP_URL                    — https://criminal.lexself.ca
□ FAMILY_APP_URL             — https://family.lexself.ca

## Step 7: Test Checklist

□ Register a new account on Criminal app
□ Register a new account on Family app (same email — should log in to same account)
□ Test free limits: 10 chat messages, 1 analysis
□ Hit limit → paywall appears
□ Click upgrade → Stripe checkout opens
□ Use Stripe test card: 4242 4242 4242 4242
□ Payment succeeds → plan updates → limits reset
□ Test Customer Portal: click "Manage Billing"
□ Cancel subscription → reverts to free
□ Test Stripe webhook locally: stripe listen --forward-to localhost:3000/api/billing/webhook

## Revenue Tracking

Once live, check:
- Stripe Dashboard → Revenue overview
- Admin dashboard: yourdomain.com/admin
- Railway metrics for server health

## Support Email

Set up support@lexself.ca (Google Workspace or similar)
Add to footer links on landing page
