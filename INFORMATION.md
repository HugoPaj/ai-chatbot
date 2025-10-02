# AI Chatbot - Standalone Client Setup

## 🏢 Overview

This AI chatbot platform is designed for standalone client deployments. Each fork/deployment serves a single organization (university or company) with unlimited access for verified users. The system includes admin controls for user management and knowledge base administration.

## ✨ Key Features

### 🎯 Business Model

- **No Individual Subscriptions**: Removed traditional paywall and subscription system
- **Single Organization Focus**: Each deployment serves one client organization
- **Unlimited Access**: All verified organization users get unlimited requests
- **Admin Control**: Platform admins manage users and knowledge base

### 🔐 Access Control

- **Organization Email Verification**: Users must sign in with verified org emails
- **No Guest Access**: Public registration disabled, access by invitation only
- **Single Organization**: Deployment configured for one specific organization
- **Role-Based Permissions**: Platform admins and regular users

### 📊 Admin Dashboard

- **Admin Panel**: Manage platform settings and view analytics
- **User Management**: Add/remove admin users
- **Knowledge Base**: Upload documents for RAG (Retrieval-Augmented Generation)
- **Platform Analytics**: Track usage and system metrics

## 🚀 Setup Guide

### Fresh Deployment Setup (Works Every Time)

This process works for completely new deployments from a fresh git clone:

#### 1. Setup Environment

```bash
# Clone the repository
git clone <your-repo-url>
cd ai-chatbot

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
```

#### 2. Configure Admin Access

Edit `lib/auth/admin.ts`:

```typescript
const ADMIN_EMAILS = [
  "your-email@domain.com", // Replace with YOUR email
];
```

#### 3. Setup Database Connection

Add your database URL to `.env.local`:

```env
# Use a fresh/empty database
POSTGRES_URL=postgresql://username:password@host:5432/fresh_database_name

# Other required environment variables
AUTH_SECRET=your-auth-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
ANTHROPIC_API_KEY=your-anthropic-key
# ... other API keys
```

#### 4. Run Migrations (Creates All Tables)

```bash
# This creates all tables including the Org table
npx tsx lib/db/migrate.ts
```

#### 5. Add Client Organization Domain

```sql
-- Add client's email domain for user access
INSERT INTO "Org" (name, domain, type, "isActive", "maxUsersPerDay") VALUES
('Stanford University', 'stanford.edu', 'university', true, '-1');
-- Replace with client's actual name and domain
```

#### 6. Test Setup

```bash
# Start the application
npm run dev

# Visit http://localhost:3000/login
# Sign in with your admin email (hugo.paja05@gmail.com)
# Password: admin123 (change this!)
# Access /dashboard to see admin panel
```

**✅ What You Should See:**

- Login page at `localhost:3000/login`
- Successful admin login
- Admin dashboard at `/dashboard` with:
  - User management panel
  - Document upload for knowledge base
  - Platform analytics
- Client users can sign in with their organization emails

## 🧹 Clean Start Workflow for Each Client

### When to Use This

- Setting up for a new client
- Starting fresh after testing/development
- Moving from development to production

### Complete Clean Start Steps

**1. Create Fresh Environment File**

```bash
# Copy your template and modify for new client
cp .env.local .env.stanford  # Example for Stanford
```

**2. Database - Choose One:**

**Option A: Brand New Database (Recommended)**

```sql
CREATE DATABASE stanford_ai_chatbot;
```

```env
POSTGRES_URL=postgresql://user:pass@host:5432/stanford_ai_chatbot
```

**Option B: Clear Existing Database**

```sql
-- Run these in order to clear all data
TRUNCATE TABLE "DailyUsage" CASCADE;
TRUNCATE TABLE "OrgAdmin" CASCADE;
TRUNCATE TABLE "Suggestion" CASCADE;
TRUNCATE TABLE "Vote_v2" CASCADE;
TRUNCATE TABLE "Message_v2" CASCADE;
TRUNCATE TABLE "Stream" CASCADE;
TRUNCATE TABLE "Chat" CASCADE;
TRUNCATE TABLE "User" CASCADE;
TRUNCATE TABLE "Org" CASCADE;
TRUNCATE TABLE "AppSettings" CASCADE;
TRUNCATE TABLE "Document" CASCADE;
```

**3. Redis - Choose One:**

**Option A: New Redis Database**

- Create new database on Redis Cloud/Upstash
- Update `REDIS_URL` in environment

**Option B: Clear Existing Redis**

```bash
redis-cli
SELECT 0  # or your database number
FLUSHDB
```

**4. R2 Storage - Choose One:**

**Option A: New Bucket**

```bash
aws s3 mb s3://stanford-ai-files --endpoint-url https://your-account.r2.cloudflarestorage.com
```

**Option B: Clear Existing Bucket**

```bash
aws s3 rm s3://your-existing-bucket --recursive --endpoint-url https://your-account.r2.cloudflarestorage.com

aws s3 rm s3://ragchatbot --recursive --endpoint-url https://86bfcd7c34b2294a200ff75184056984.r2.cloudflarestorage.com

```

**5. Run Migrations & Setup**

```bash
# Create all tables fresh
npx tsx lib/db/migrate.ts

# Add client organization
psql $POSTGRES_URL -c "
INSERT INTO \"Org\" (name, domain, type, \"isActive\", \"maxUsersPerDay\") VALUES
('Stanford University', 'stanford.edu', 'university', true, '-1'),
('Platform Admin', 'gmail.com', 'company', true, '-1');
"
```

**6. Test Clean Start**

```bash
# Start development server
npm run dev

# Visit localhost:3000
# Try signing in with admin email
# Check dashboard shows empty/clean state
```

### Per-Client Deployment Setup

When deploying for each new client (university/company), follow these steps:

#### 1. Environment Variables (CRITICAL - Change for Each Client)

Create a new `.env.local` file for each deployment:

```env
# ============================================
# DATABASE (UNIQUE PER CLIENT)
# ============================================
POSTGRES_URL=postgresql://username:password@your-client-db.com:5432/clientname_db

# ============================================
# AUTHENTICATION (UNIQUE PER CLIENT)
# ============================================
AUTH_SECRET=generate-new-secret-for-each-client
NEXT_PUBLIC_APP_URL=https://client-specific-domain.com

# ============================================
# AI PROVIDERS (CAN BE SHARED OR UNIQUE)
# ============================================
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
XAI_API_KEY=your-xai-key

# ============================================
# STORAGE - R2/S3 (UNIQUE PER CLIENT)
# ============================================
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_ACCESS_KEY_ID=unique-per-client-key
CLOUDFLARE_SECRET_ACCESS_KEY=unique-per-client-secret
CLOUDFLARE_BUCKET_NAME=client-specific-bucket-name
CLOUDFLARE_BUCKET_URL=https://client-bucket.r2.cloudflarestorage.com

# ============================================
# REDIS (UNIQUE PER CLIENT)
# ============================================
REDIS_URL=redis://client-specific-redis.com:6379

# ============================================
# OTHER SERVICES (OPTIONAL)
# ============================================
DOCLING_URL=http://localhost:8080  # If using document processing
```

#### 2. Database Setup (Per Client) - FRESH START

**Option A: Completely New Database (Recommended)**

```sql
-- Create a brand new database for each client
CREATE DATABASE stanford_ai_chatbot;
CREATE DATABASE mit_ai_chatbot;
CREATE DATABASE google_ai_chatbot;
```

**Option B: Same Database, Clear All Data**

```sql
-- If reusing the same database, clear all data first
TRUNCATE TABLE "DailyUsage" CASCADE;
TRUNCATE TABLE "OrgAdmin" CASCADE;
TRUNCATE TABLE "Org" CASCADE;
TRUNCATE TABLE "Vote_v2" CASCADE;
TRUNCATE TABLE "Message_v2" CASCADE;
TRUNCATE TABLE "Chat" CASCADE;
TRUNCATE TABLE "User" CASCADE;
TRUNCATE TABLE "AppSettings" CASCADE;
-- Add other tables as needed
```

**Step 2: Update Environment Variables**

```env
# Update POSTGRES_URL to point to new database
POSTGRES_URL=postgresql://username:password@host:5432/stanford_ai_chatbot
```

**Step 3: Run Migrations on Fresh Database**

```bash
# This will create all tables from scratch
npx tsx lib/db/migrate.ts
```

**Step 4: Add Client Organization**

```sql
-- Add the client's organization (this is the FIRST entry in fresh DB)
INSERT INTO "Org" (name, domain, type, "isActive", "maxUsersPerDay") VALUES
('Stanford University', 'stanford.edu', 'university', true, '-1');

-- Add multiple domains if needed
INSERT INTO "Org" (name, domain, type, "isActive", "maxUsersPerDay") VALUES
('Stanford Medical', 'med.stanford.edu', 'university', true, '-1');
```

**Step 5: Add Your Admin Access (Per Client)**

```sql
-- Add your admin domain so you can access this client's platform
INSERT INTO "Org" (name, domain, type, "isActive", "maxUsersPerDay") VALUES
('Platform Admin', 'gmail.com', 'company', true, '-1');
```

#### 3. Redis Setup (Per Client)

**Option A: Separate Redis Instance Per Client (Most Secure)**

```bash
# Create new Redis database for each client
# On Redis Cloud/Upstash - create new database
# Update environment variable:
REDIS_URL=redis://username:password@redis-stanford.upstash.io:6379
```

**Option B: Same Redis, Different Database Numbers**

```env
# Use different database numbers (0-15 available)
REDIS_URL=redis://username:password@your-redis.com:6379/0  # Client 1
REDIS_URL=redis://username:password@your-redis.com:6379/1  # Client 2
REDIS_URL=redis://username:password@your-redis.com:6379/2  # Client 3
```

**Option C: Clear Redis Data (If Reusing)**

```bash
# Connect to Redis and clear all data
redis-cli
FLUSHDB  # Clears current database
# or
FLUSHALL # Clears all databases (CAREFUL!)
```

#### 4. Storage Setup (Per Client)

**Create Unique R2 Bucket:**

```bash
# Create new bucket for each client
aws s3 mb s3://stanford-chatbot-files --endpoint-url https://your-account.r2.cloudflarestorage.com
aws s3 mb s3://mit-chatbot-files --endpoint-url https://your-account.r2.cloudflarestorage.com

# Set up CORS if needed
aws s3api put-bucket-cors --bucket stanford-chatbot-files --cors-configuration file://cors.json --endpoint-url https://your-account.r2.cloudflarestorage.com
```

**Clear Existing R2 Bucket (If Reusing):**

```bash
# Delete all content from existing bucket
aws s3 rm s3://your-bucket-name --recursive --endpoint-url https://your-account.r2.cloudflarestorage.com
```

#### 4. Domain/Deployment Setup (Per Client)

**Update App Configuration:**

- Deploy to client-specific domain: `https://ai.stanford.edu`
- Update `NEXT_PUBLIC_APP_URL` to match
- Configure SSL certificates for the domain

#### 5. Client-Specific Customization (Optional)

**Branding (if offering white-label):**

- Update logo in `public/` folder
- Modify colors in `tailwind.config.js`
- Update site title in `app/layout.tsx`

**Model Access (if different per client):**

- Modify `lib/ai/entitlements.ts` if client has specific model requirements
- Update API keys if client provides their own AI service accounts

### Quick Client Deployment Checklist

```markdown
## Pre-Deployment Checklist

### Infrastructure

- [ ] New database created and configured
- [ ] New R2 bucket created
- [ ] Redis instance configured (if separate)
- [ ] Domain/subdomain configured with SSL

### Environment Variables

- [ ] POSTGRES_URL updated for client database
- [ ] AUTH_SECRET generated (unique per client)
- [ ] NEXT_PUBLIC_APP_URL updated to client domain
- [ ] CLOUDFLARE_BUCKET_NAME updated to client bucket
- [ ] CLOUDFLARE_ACCESS_KEY_ID/SECRET updated

### Database Setup

- [ ] Migrations run successfully
- [ ] Client organization added to database
- [ ] Admin access organization added
- [ ] Test user sign-in with client email

### Testing

- [ ] Admin can sign in and access dashboard
- [ ] Client users can sign in with org email
- [ ] Chat functionality works
- [ ] File uploads work (if enabled)
- [ ] All AI models accessible

### Post-Deployment

- [ ] Provide client with platform URL
- [ ] Document client-specific access domains
- [ ] Set up monitoring/analytics (if needed)
```

### Super Admin Management Workflow

Once deployed for multiple clients:

1. **Multi-Client Access**: You can sign in to any client's platform using your admin email (as long as you've added your domain to their database)

2. **Organization Management**: Through each client's dashboard, you can:

   - Add/remove their organization domains
   - Monitor usage across their organization
   - Adjust settings per organization

3. **Centralized vs Distributed**:
   - **Distributed** (Recommended): Each client has their own database/deployment
   - **Centralized** (Alternative): Single database with multiple organizations (less secure, but easier to manage)

### Security Notes

⚠️ **CRITICAL**: Never share the same:

- Database between clients
- AUTH_SECRET between deployments
- R2 buckets between clients
- Environment variables between clients

✅ **OK to Share**:

- AI API keys (if you're paying for them)
- Your admin email domain (for access)
- Base application code

## 🏗️ Architecture

### User Types & Access

| User Type             | Access Level | Features                                  |
| --------------------- | ------------ | ----------------------------------------- |
| **Guest**             | None         | Must sign in with org email               |
| **Organization User** | Unlimited    | All AI models, unlimited requests         |
| **Super Admin**       | Full Control | Manage organizations, analytics, settings |

### Database Schema

- **`Org`**: Organization information (name, domain, type, settings)
- **`OrgAdmin`**: Organization administrators
- **`User`**: User accounts with organization association
- **`AppSettings`**: Global platform configuration

### Authentication Flow

1. User visits platform → Redirected to org sign-in page
2. User enters organization email address
3. System verifies email domain against registered organizations
4. If verified → Grant unlimited access
5. If not verified → Access denied

## 🎛️ Organization Management

### Adding Organizations

**Via Admin Dashboard:**

1. Sign in as super admin
2. Go to Dashboard → Organization Management
3. Click "Add Organization"
4. Fill in organization details:
   - Name (e.g., "Stanford University")
   - Domain (e.g., "stanford.edu")
   - Type (University or Company)
   - User limits (optional)

**Via Database:**

```sql
INSERT INTO "Org" (name, domain, type, "isActive", "maxUsersPerDay")
VALUES ('Stanford University', 'stanford.edu', 'university', true, '-1');
```

### Organization Settings

- **Name**: Display name for the organization
- **Domain**: Email domain for user verification (e.g., "stanford.edu")
- **Type**: University or Company (for categorization)
- **Status**: Active/Inactive (controls access)
- **User Limits**: Optional daily request limits per organization

## 🔧 Technical Implementation

### Key Files Modified/Created

#### Authentication & Access Control

- `app/(auth)/auth.ts` - Organization email verification
- `lib/db/queries.ts` - Organization lookup functions
- `lib/ai/user-entitlements.ts` - Unlimited access for org users
- `middleware.ts` - Removed subscription-related middleware

#### Database Schema

- `lib/db/schema.ts` - Organization and admin tables
- `lib/db/migrations/` - Database migration files

#### UI Components

- `components/org-signin-form.tsx` - Organization sign-in form
- `components/admin/org-management.tsx` - Admin organization management
- `app/dashboard/page.tsx` - Admin dashboard with org management

#### Removed Components (Paywall System)

- ~~`components/paywall-modal.tsx`~~ - Removed
- ~~`components/subscription-dashboard.tsx`~~ - Removed
- ~~`app/api/stripe/`~~ - All Stripe integration removed
- ~~`lib/stripe/`~~ - Stripe library removed

### Organization Verification Process

```typescript
// Check if email domain is from verified organization
export async function isVerifiedOrgEmail(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;

  const organization = await getOrgByDomain(domain);
  return organization?.isActive ?? false;
}
```

### Admin Permissions

```typescript
// Admin check in components/pages
const isAdmin = isAdminEmail(user.email);

if (isAdmin) {
  // Show admin dashboard with org management
} else {
  // Show regular user dashboard
}
```

## 🎯 User Experience

### For Organization Users

1. **Sign In**: Visit platform and sign in with organization email
2. **Immediate Access**: Get unlimited access to all AI models
3. **No Restrictions**: No daily limits or premium features
4. **Dashboard**: Simple dashboard showing account status

### For Super Admins

1. **Organization Management**: Add/remove organizations
2. **Analytics Dashboard**: View usage across all organizations
3. **User Management**: Monitor user activity and access
4. **Platform Settings**: Configure global platform settings

### For Organization Admins (Future)

- View their organization's usage analytics
- Manage organization-specific settings
- Add/remove organization users (planned feature)

## 🔄 Migration from Paywall System

### What Was Removed

- ✅ All Stripe payment integration
- ✅ Subscription plans and user subscriptions
- ✅ Paywall modal and limits
- ✅ Daily usage tracking enforcement
- ✅ Registration page (users must exist in organizations)

### What Was Added

- ✅ Organization database schema
- ✅ Email domain verification
- ✅ Admin organization management
- ✅ Organization-based authentication
- ✅ Super admin dashboard

### Database Changes

```sql
-- Added tables
CREATE TABLE "Org" (...);
CREATE TABLE "OrgAdmin" (...);

-- Modified tables
ALTER TABLE "User" ADD COLUMN "orgId" uuid REFERENCES "Org"(id);
ALTER TABLE "User" ADD COLUMN "isVerified" boolean DEFAULT false;

-- Removed tables
-- DROP TABLE "SubscriptionPlan"; -- (via migration)
-- DROP TABLE "UserSubscription"; -- (via migration)
```

## 🚀 Deployment Checklist

### Environment Variables

```env
# Database
POSTGRES_URL=postgresql://...

# Authentication
AUTH_SECRET=your-auth-secret
NEXT_PUBLIC_APP_URL=https://your-domain.com

# AI Providers
ANTHROPIC_API_KEY=your-anthropic-key
# ... other AI provider keys
```

### Pre-Deployment Steps

1. ✅ Configure super admin email in `lib/auth/admin.ts`
2. ✅ Run database migrations
3. ✅ Add initial organizations to database
4. ✅ Test organization email verification
5. ✅ Verify admin dashboard access

### Post-Deployment

1. Sign in as super admin
2. Add organizations via admin dashboard
3. Test user sign-in with organization emails
4. Monitor usage analytics
5. Configure organization-specific settings as needed

## 🎯 Business Benefits

### For Platform Owner

- **Predictable Revenue**: Annual organization licenses
- **Lower Support**: No individual billing issues
- **Scalable**: Easy to add new organizations
- **Enterprise Focus**: Target universities and companies

### For Organizations

- **Unlimited Access**: No per-user limits
- **Cost Effective**: One fee for entire organization
- **Easy Management**: Users sign in with existing email
- **No Individual Accounts**: No user management overhead

### For End Users

- **Seamless Access**: Sign in with work/school email
- **No Limits**: Unlimited requests and full features
- **No Billing**: No individual payment required
- **Instant Access**: Immediate access upon sign-in

This organization-based system provides a robust, scalable platform suitable for enterprise customers while eliminating the complexity of individual user subscriptions and billing.

# Multi-Model Chat System

## 🧠 Overview

The application supports multiple AI models with user-type-based access control. Each user type has access to different models based on their subscription tier, ensuring appropriate model access while providing fallback mechanisms for invalid configurations.

## 🤖 Available Models

### Model Configuration (`lib/ai/models.ts`)

| Model ID               | Model Name       | Description                     | Provider  | Use Case                              |
| ---------------------- | ---------------- | ------------------------------- | --------- | ------------------------------------- |
| `chat-model1`          | Claude 4 Sonnet  | Primary model                   | Anthropic | General conversations (Premium users) |
| `chat-model2`          | Claude Opus 4    | Most powerful model and slowest | Anthropic | Complex reasoning tasks               |
| `chat-model3`          | Claude 3.5 Haiku | Fastest model                   | Anthropic | Quick responses (Guest default)       |
| `chat-model4`          | Grok 4           | Grok 4                          | xAI       | Alternative perspective               |
| `chat-model-reasoning` | Reasoning Model  | Uses advanced reasoning         | Anthropic | Complex problem solving               |
| `chat-model-vision`    | Claude 4 Sonnet  | For prompts with images         | Anthropic | Image analysis (auto-selected)        |

### Specialized Models

- **`title-model`**: Claude 3.5 Haiku - Used for generating chat titles
- **`artifact-model`**: Claude 3.5 Sonnet - Used for creating documents/artifacts

## 👥 User Access Matrix

### Model Entitlements (`lib/ai/entitlements.ts`)

| User Type   | Available Models                      | Default Model | Max Requests/Day |
| ----------- | ------------------------------------- | ------------- | ---------------- |
| **Guest**   | `chat-model3`, `chat-model-reasoning` | `chat-model3` | 5                |
| **Free**    | All models                            | `chat-model1` | 5                |
| **Premium** | `chat-model1`, `chat-model-reasoning` | `chat-model1` | Unlimited        |
| **Admin**   | `chat-model1`, `chat-model-reasoning` | `chat-model1` | Unlimited        |

## 🔄 Model Selection Flow

### 1. Cookie-Based Model Persistence

```typescript
// User's model preference is stored in browser cookie
cookieStore.set("chat-model", selectedModelId);
```

### 2. Smart Default Selection (`getDefaultChatModelForUser`)

The system intelligently selects appropriate default models:

```typescript
export function getDefaultChatModelForUser(
  userType: string,
  entitlementsByUserType: any
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
const userAvailableModels =
  entitlementsByUserType[userType]?.availableChatModelIds || [];

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

| Scenario              | Fallback Action                   |
| --------------------- | --------------------------------- |
| No cookie set         | Use user-type default model       |
| Invalid model ID      | Use user-type default model       |
| User lacks permission | Use user-type default model       |
| Unknown user type     | Use guest default (`chat-model3`) |

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
const userType = session?.user?.type || "guest";
const { availableChatModelIds } = entitlementsByUserType[userType];

// 2. Auto-select vision model for image attachments
const resolvedModelId = hasImageAttachment
  ? "chat-model-vision"
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

## 🐳 Docker Build Guide - Docling Service

### Known Issue: BuildKit "invalid file request" Error

**Problem**: Docker BuildKit v0.27+ on Windows fails with:

```
ERROR: failed to solve: invalid file request requirements.txt
```

**Root Cause**: BuildKit bug when handling certain file patterns on Windows filesystem.

### Workaround (REQUIRED)

The `docling-service/Dockerfile` uses `requirements-copy.txt` instead of `requirements.txt` to bypass the BuildKit bug.

**Files in docling-service directory:**

- `requirements.txt` - Original requirements file (keep this)
- `requirements-copy.txt` - Copy used by Docker build (workaround)

**Important**: When updating Python dependencies:

1. Edit `requirements.txt` with your changes
2. Copy it to `requirements-copy.txt`:
   ```bash
   cp docling-service/requirements.txt docling-service/requirements-copy.txt
   ```
3. Build the Docker image

### Building the Docling Service

```bash
# From project root
docker compose build docling-service

# Or from docling-service directory
docker build -t docling-service .
```

### Running the Service

```bash
# Start the service
docker compose up docling-service -d

# Check status
docker compose ps

# View logs
docker compose logs -f docling-service
```

Service runs on port 8001 by default (configurable in `docker-compose.yml`).
