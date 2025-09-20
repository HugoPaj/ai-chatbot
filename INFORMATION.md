
# Delete Content of r2 bucket
aws s3 rm s3://ragchatbot --endpoint-url https://86bfcd7c34b2294a200ff75184056984.r2.cloudflarestorage.com --recursive

# Paywall System Implementation

## ✅ Completed Features

### 1. Global Paywall Toggle
- **Admin Control**: As an admin, you can enable/disable the paywall system with a single click
- **Location**: Admin toggle appears in the sidebar (only visible to admins)
- **Behavior**: 
  - When **disabled**: All users get unlimited access
  - When **enabled**: Non-premium users limited to 5 requests/day

### 2. User Types & Entitlements
- **Guest**: 5 requests/day (no account)
- **Free**: 5 requests/day (registered account)
- **Premium**: Unlimited requests (with subscription)
- **Admin**: Unlimited requests (always bypass paywall)

### 3. Daily Usage Tracking
- Tracks requests per user per day
- Automatic increment on each chat request
- Persisted in database for accurate counting

### 4. Enhanced Authentication
- Automatic user type detection based on admin status
- Admin users identified by email in `lib/auth/admin.ts`
- Subscription status checking for premium users

### 5. Database Schema
- **AppSettings**: Global configuration storage
- **SubscriptionPlan**: Subscription plan definitions
- **UserSubscription**: User subscription tracking
- **DailyUsage**: Daily request usage tracking

## 🎛️ Admin Controls

### Paywall Toggle
1. Log in as an admin (your email: Hugo.Paja05@gmail.com)
2. Look for the paywall toggle in the sidebar
3. Click the toggle to enable/disable the paywall
4. Confirmation dialog will explain the impact

### API Endpoints
- `GET /api/admin/paywall` - Get current paywall status
- `POST /api/admin/paywall` - Toggle paywall on/off

## 🔧 How It Works

### Request Flow
1. User makes a chat request
2. System checks if paywall is enabled globally
3. If disabled → Allow unlimited access for everyone
4. If enabled → Check user type and subscription
5. Track daily usage and enforce limits
6. Show paywall modal when limits exceeded

### Admin Bypass
- Admins always get unlimited access regardless of paywall status
- Admin status determined by email in `ADMIN_EMAILS` array

## 🚀 Quick Test

1. **Enable Paywall**: Use the admin toggle in sidebar
2. **Test Limits**: Create a test account and make 6 requests
3. **Disable Paywall**: Toggle it off and test unlimited access
4. **Admin Access**: Switch to admin account for unlimited access

## 🎯 Usage Limits

| User Type | Paywall Enabled | Paywall Disabled |
|-----------|-----------------|------------------|
| Guest     | 5/day           | Unlimited        |
| Free      | 5/day           | Unlimited        |
| Premium   | Unlimited       | Unlimited        |
| Admin     | Unlimited       | Unlimited        |

## 💳 Stripe Payment Integration

### ✅ Completed Features
- **Stripe Checkout**: Full subscription checkout flow
- **Webhook Handling**: Real-time subscription sync with database
- **Customer Portal**: Users can manage subscriptions via Stripe portal
- **Subscription Dashboard**: In-app subscription management UI
- **Payment Processing**: Secure payment handling via Stripe
- **Database Sync**: Automatic subscription status updates

### 🛠️ Setup Required
1. **Stripe Account**: Create account and get API keys
2. **Environment Variables**: Configure Stripe keys (see `STRIPE_SETUP.md`)
3. **Product Setup**: Create Premium Monthly product in Stripe ($9.99/month)
4. **Webhook Configuration**: Set up webhook endpoint for subscription events

### 🔄 Payment Flow
1. User clicks "Upgrade to Premium"
2. Stripe checkout session created
3. User completes payment on Stripe
4. Webhook receives subscription event
5. Database updated with subscription status
6. User gets unlimited access immediately

## 📋 Remaining Features (Future)

- Advanced billing features (usage-based, multiple plans)
- Subscription analytics and reporting
- Promotional codes and discounts
- Annual subscription options

## 🛠️ Files Modified/Created

### Core Logic
- `lib/db/schema.ts` - Database schema
- `lib/ai/user-entitlements.ts` - Entitlements logic
- `lib/db/queries.ts` - Database queries
- `app/(auth)/auth.ts` - User type system
- `app/(chat)/api/chat/route.ts` - Request handling

### Admin Features
- `app/api/admin/paywall/route.ts` - Admin API
- `components/admin-paywall-toggle.tsx` - Toggle component
- `components/app-sidebar.tsx` - Sidebar integration

### Stripe Integration
- `lib/stripe/config.ts` - Stripe configuration
- `lib/stripe/client.ts` - Client-side Stripe utilities
- `lib/stripe/subscription.ts` - Subscription management
- `app/api/stripe/webhook/route.ts` - Webhook handler
- `app/api/stripe/create-checkout/route.ts` - Checkout API
- `app/api/stripe/customer-portal/route.ts` - Customer portal API

### UI Components
- `components/paywall-modal.tsx` - Limit reached modal (with Stripe integration)
- `components/subscription-dashboard.tsx` - User subscription management
- `app/dashboard/page.tsx` - Dashboard page

### Scripts & Documentation
- `scripts/seed-subscription-plans.ts` - Database seeding
- `STRIPE_SETUP.md` - Complete Stripe setup guide

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

# Multi-Model Chat System

## 🧠 Overview

The application supports multiple AI models with user-type-based access control. Each user type has access to different models based on their subscription tier, ensuring appropriate model access while providing fallback mechanisms for invalid configurations.

## 🤖 Available Models

### Model Configuration (`lib/ai/models.ts`)

| Model ID | Model Name | Description | Provider | Use Case |
|----------|------------|-------------|----------|----------|
| `chat-model1` | Claude 4 Sonnet | Primary model | Anthropic | General conversations (Premium users) |
| `chat-model2` | Claude Opus 4 | Most powerful model and slowest | Anthropic | Complex reasoning tasks |
| `chat-model3` | Claude 3.5 Haiku | Fastest model | Anthropic | Quick responses (Guest default) |
| `chat-model4` | Grok 4 | Grok 4 | xAI | Alternative perspective |
| `chat-model-reasoning` | Reasoning Model | Uses advanced reasoning | Anthropic | Complex problem solving |
| `chat-model-vision` | Claude 4 Sonnet | For prompts with images | Anthropic | Image analysis (auto-selected) |

### Specialized Models
- **`title-model`**: Claude 3.5 Haiku - Used for generating chat titles
- **`artifact-model`**: Claude 3.5 Sonnet - Used for creating documents/artifacts

## 👥 User Access Matrix

### Model Entitlements (`lib/ai/entitlements.ts`)

| User Type | Available Models | Default Model | Max Requests/Day |
|-----------|------------------|---------------|------------------|
| **Guest** | `chat-model3`, `chat-model-reasoning` | `chat-model3` | 5 |
| **Free** | All models | `chat-model1` | 5 |
| **Premium** | `chat-model1`, `chat-model-reasoning` | `chat-model1` | Unlimited |
| **Admin** | `chat-model1`, `chat-model-reasoning` | `chat-model1` | Unlimited |

## 🔄 Model Selection Flow

### 1. Cookie-Based Model Persistence

```typescript
// User's model preference is stored in browser cookie
cookieStore.set('chat-model', selectedModelId);
```

### 2. Smart Default Selection (`getDefaultChatModelForUser`)

The system intelligently selects appropriate default models:

```typescript
export function getDefaultChatModelForUser(
  userType: string,
  entitlementsByUserType: any,
): string {
  // Returns first available model from user's entitlement list
  const userEntitlements = entitlementsByUserType[userType];
  return userEntitlements.availableChatModelIds[0];
}
```

**Results:**
- 🔹 **Guest users** → `chat-model3` (Claude 3.5 Haiku)
- 🔹 **Free users** → `chat-model1` (Claude 4 Sonnet)  
- 🔹 **Premium users** → `chat-model1` (Claude 4 Sonnet)
- 🔹 **Admin users** → `chat-model1` (Claude 4 Sonnet)

### 3. Cookie Validation Process

The system performs **3-layer validation** before using a saved model:

```typescript
// 1. Valid model ID exists in system
const validModelIds = chatModels.map((m) => m.id);

// 2. User has permission to access this model
const userAvailableModels = entitlementsByUserType[userType]?.availableChatModelIds || [];

// 3. All conditions met
const isValidModelId =
  modelIdFromCookie?.value &&
  validModelIds.includes(modelIdFromCookie.value) &&
  userAvailableModels.includes(modelIdFromCookie.value);
```

## 🛡️ Security & Access Control

### Permission Enforcement

1. **Frontend**: Model selector only shows models user has access to
2. **Backend**: API validates selected model against user entitlements
3. **Cookie**: Invalid/unauthorized models trigger fallback to user's default

### Fallback Mechanisms

| Scenario | Fallback Action |
|----------|-----------------|
| No cookie set | Use user-type default model |
| Invalid model ID | Use user-type default model |
| User lacks permission | Use user-type default model |
| Unknown user type | Use guest default (`chat-model3`) |

## 🔧 Implementation Details

### Files Modified for Multi-Model Support

#### Core Logic
- **`lib/ai/models.ts`**: Model definitions and default selection logic
- **`lib/ai/providers.ts`**: AI provider configuration with model mappings
- **`lib/ai/entitlements.ts`**: User-type access control matrix
- **`app/(chat)/actions.ts`**: Model validation in cookie saving

#### Pages & Routes
- **`app/(chat)/page.tsx`**: New chat model validation
- **`app/(chat)/chat/[id]/page.tsx`**: Existing chat model validation  
- **`app/(chat)/api/chat/route.ts`**: Backend model selection and validation
- **`app/(chat)/api/chat/schema.ts`**: API request validation schema

#### UI Components
- **`components/model-selector.tsx`**: Model selection dropdown
- **`components/chat-header.tsx`**: Model display in header

### Model Resolution in Chat API

```typescript
// 1. Validate selected model against user entitlements
const userType = session?.user?.type || 'guest';
const { availableChatModelIds } = entitlementsByUserType[userType];

// 2. Auto-select vision model for image attachments
const resolvedModelId = hasImageAttachment
  ? 'chat-model-vision'
  : selectedChatModel;

// 3. Use resolved model in AI provider
const result = streamText({
  model: myProvider.languageModel(resolvedModelId),
  // ... other options
});
```

## 🎯 Special Features

### 1. Automatic Vision Model Selection
When users upload images, the system automatically switches to `chat-model-vision` regardless of their selected model.

### 2. Reasoning Model Limitations
The `chat-model-reasoning` model has specific limitations:
- No access to tools (weather, documents, etc.)
- Optimized for pure reasoning tasks

### 3. Context-Aware Model Usage
- **Title Generation**: Always uses `title-model` (Claude 3.5 Haiku) for efficiency
- **Document Creation**: Uses `artifact-model` (Claude 3.5 Sonnet) for structured content

## 🚀 Migration Guide

### Upgrading from Single Model

If upgrading from a single-model setup:

1. **Update Model IDs**: Change `'chat-model'` to `'chat-model1'` in:
   - `lib/ai/models.ts` (DEFAULT_CHAT_MODEL)
   - `lib/ai/entitlements.ts` (all user type configurations)
   - `app/(chat)/api/chat/schema.ts` (validation schema)

2. **Add Validation**: Implement cookie validation in chat pages
3. **Update Components**: Ensure model selector uses entitlement-based filtering

### Adding New Models

1. **Add to Provider** (`lib/ai/providers.ts`):
   ```typescript
   'new-model-id': anthropic('claude-new-model'),
   ```

2. **Add to Models List** (`lib/ai/models.ts`):
   ```typescript
   {
     id: 'new-model-id',
     name: 'New Model Name', 
     description: 'Model description',
   }
   ```

3. **Update Entitlements** (`lib/ai/entitlements.ts`):
   ```typescript
   availableChatModelIds: ['existing-models', 'new-model-id'],
   ```

4. **Update API Schema** (`app/(chat)/api/chat/schema.ts`):
   ```typescript
   selectedChatModel: z.enum([
     'existing-models',
     'new-model-id',
   ]),
   ```

## 🐛 Troubleshooting

### Common Issues

1. **Model Name Not Showing**: 
   - Clear browser cookies to reset invalid model IDs
   - Check user has access to the selected model

2. **Access Denied Errors**:
   - Verify user type is correctly set in session
   - Check entitlements configuration matches user type

3. **Default Model Issues**:
   - Ensure `getDefaultChatModelForUser` returns valid model for user type
   - Verify fallback logic handles edge cases

### Debug Commands

```bash
# Check current model configuration
grep -r "chat-model" lib/ai/

# Verify entitlements setup  
cat lib/ai/entitlements.ts

# Test model validation
npx tsx scripts/test-model-validation.ts
```

This multi-model system provides a robust, scalable foundation for serving different AI models to different user tiers while maintaining security and providing seamless fallback mechanisms.