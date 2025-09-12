# Stripe Integration Setup Guide

## Environment Variables Required

Add these variables to your `.env.local` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PREMIUM_PRICE_ID=price_...

# App URL (required for Stripe redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Stripe Dashboard Setup

### 1. Create Stripe Account
1. Go to [https://stripe.com](https://stripe.com)
2. Create an account or sign in
3. Switch to **Test mode** for development

### 2. Get API Keys
1. Go to **Developers** → **API Keys**
2. Copy your **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
3. Copy your **Secret key** → `STRIPE_SECRET_KEY`

### 3. Create Product and Price
1. Go to **Products** → **Add Product**
2. Product details:
   - **Name**: Premium Monthly
   - **Description**: Unlimited requests and premium support
3. Pricing:
   - **Pricing model**: Standard pricing
   - **Price**: $9.99 USD
   - **Billing period**: Monthly
4. Save the product
5. Copy the **Price ID** (starts with `price_`) → `STRIPE_PREMIUM_PRICE_ID`

### 4. Set Up Webhooks
1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Endpoint URL: `http://localhost:3000/api/stripe/webhook` (for local dev)
4. Select events to send:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Save the endpoint
6. Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`

## Production Setup

For production deployment:

1. Switch to **Live mode** in Stripe dashboard
2. Get live API keys and update environment variables
3. Update webhook endpoint URL to your production domain
4. Update `NEXT_PUBLIC_APP_URL` to your production URL

## Testing the Integration

### Local Development
1. Install Stripe CLI: `brew install stripe/stripe-cli/stripe` (macOS) or download from Stripe
2. Login: `stripe login`
3. Forward webhooks: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
4. Use the webhook signing secret from the CLI output

### Test Cards
Use these test card numbers in development:
- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- **3D Secure**: 4000 0025 0000 3155

## Current Implementation Features

✅ **Completed**:
- Stripe checkout session creation
- Webhook handling for subscription events
- Customer portal for subscription management
- Database sync with Stripe data
- Subscription dashboard UI
- Paywall integration with Stripe checkout

🚧 **In Progress**:
- Admin subscription management
- Advanced billing features
- Usage-based billing (future enhancement)

## Commands

```bash
# Seed subscription plans (run after setting up Stripe)
npx tsx scripts/seed-subscription-plans.ts

# Generate new migration (if needed)
npx drizzle-kit generate

# Run migrations
npx tsx lib/db/migrate.ts
```

## Support

If you encounter issues:
1. Check Stripe webhook logs in dashboard
2. Verify environment variables are set correctly
3. Ensure webhook endpoint is accessible
4. Check application logs for error details
