# Microsoft SSO Setup Guide

## Step 1: Get Free Azure AD Test Tenant

1. **Go to:** https://developer.microsoft.com/microsoft-365/dev-program
2. **Sign in** with a Microsoft account (or create one)
3. **Join the program** (instant approval, completely free)
4. **Set up E5 subscription** - you'll get:
   - A dev tenant like: `yourname.onmicrosoft.com`
   - Admin account: `admin@yourname.onmicrosoft.com`
   - 25 test user licenses

## Step 2: Register App in Azure AD

1. **Go to:** https://portal.azure.com
2. **Navigate to:** Azure Active Directory → App registrations
3. **Click:** "New registration"
4. **Configure:**
   - **Name:** `AI Chatbot Dev`
   - **Supported account types:** "Accounts in this organizational directory only (Single tenant)"
   - **Redirect URI:**
     - Platform: `Web` ⚠️ **CRITICAL: Must be "Web", NOT "SPA"!** ⚠️
     - URL: `http://localhost:3000/api/auth/callback/microsoft-entra-id`
     - **Note:** If your dev server runs on port 3001, use `http://localhost:3001/api/auth/callback/microsoft-entra-id`
5. **Click:** Register

> **⚠️ IMPORTANT:** The platform MUST be configured as "Web" not "SPA" (Single Page Application). Choosing "SPA" will cause a "JWTs must use Compact JWS serialization" error. This is because Web and SPA platforms send different token formats.

### Get Your Credentials

6. **On the Overview page, copy:**
   - **Application (client) ID** → This is your `MICROSOFT_CLIENT_ID`
   - **Directory (tenant) ID** → This is your `MICROSOFT_TENANT_ID`

7. **Create a client secret:**
   - Go to: **Certificates & secrets** → Client secrets
   - Click: **New client secret**
   - Description: `Dev Secret`
   - Expires: 24 months
   - Click: **Add**
   - **⚠️ Copy the secret VALUE immediately** → This is your `MICROSOFT_CLIENT_SECRET`

8. **Configure API permissions:**
   - Go to: **API permissions**
   - Should have `User.Read` by default (if not, add it)
   - Click: **Grant admin consent** (green checkmark)

## Step 3: Configure Your Local Environment

1. **Copy your `.env.example` to `.env.local`** (if you haven't already):
   ```bash
   cp .env.example .env.local
   ```

2. **Add the credentials to `.env.local`:**
   ```bash
   MICROSOFT_CLIENT_ID=your-application-client-id
   MICROSOFT_CLIENT_SECRET=your-client-secret-value
   MICROSOFT_TENANT_ID=your-directory-tenant-id

   # Enable the SSO button in the UI
   NEXT_PUBLIC_MICROSOFT_SSO_ENABLED=true
   ```

## Step 4: Create Test Users in Azure AD

1. **Go to:** Azure Portal → Azure Active Directory → Users
2. **Click:** New user → Create new user
3. **Create test users:**
   - Username: `testuser1@yourname.onmicrosoft.com`
   - Display name: `Test User 1`
   - Auto-generate password (copy it!)
4. **Repeat** for additional test users

## Step 5: Add Test Users to Your Database

Before SSO users can sign in, they need to exist in your database:

```sql
-- Add test user to your database
INSERT INTO users (id, email, password, created_at)
VALUES (
  gen_random_uuid(),
  'testuser1@yourname.onmicrosoft.com',
  NULL,  -- No password needed for SSO users
  NOW()
);
```

## Step 6: Test the SSO Flow

1. **Start your dev server:**
   ```bash
   pnpm dev
   ```

2. **Navigate to your sign-in page**

3. **You should see:**
   - "Sign in with Microsoft" button (with Windows logo)
   - Divider: "Or continue with email"
   - Email/password form below

4. **Click "Sign in with Microsoft":**
   - Redirects to Microsoft login
   - Enter: `testuser1@yourname.onmicrosoft.com` + password
   - Approves permissions
   - Redirects back to your app
   - User is signed in!

## Troubleshooting

### SSO button doesn't appear
- Check that `NEXT_PUBLIC_MICROSOFT_SSO_ENABLED=true` in `.env.local`
- Restart your dev server (Next.js needs restart for env var changes)

### "Redirect URI mismatch" error
- Ensure redirect URI in Azure AD matches exactly: `http://localhost:3001/api/auth/callback/microsoft-entra-id` (use your actual port)
- No trailing slashes!
- Check your dev server port - it might be 3001 instead of 3000

### User exists but can't sign in
- Make sure the user email in your database matches exactly (lowercase)
- Check that the user has no password set (or set it to NULL)

### For production deployment
1. In Azure AD, add production redirect URI: `https://yourdomain.com/api/auth/callback/microsoft-entra-id`
2. Update environment variables in production
3. For customer deployments: each customer provides their own Azure AD credentials

## Customer Deployment (Single-Tenant)

When deploying for a real customer:

1. **Customer's IT team:**
   - Registers app in **their** Azure AD
   - Provides you: Client ID, Client Secret, Tenant ID

2. **You:**
   - Create separate deployment for customer
   - Use their Azure AD credentials in env vars
   - Point to customer-specific database

3. **Customer's users:**
   - Sign in with their work Microsoft accounts
   - Auto-provisioned on first login (or pre-created in DB)
