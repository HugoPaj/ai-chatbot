# Azure AD Platform Configuration Fix

## The Problem
You're getting the error: `JWTInvalid: JWTs must use Compact JWS serialization, JWT must be a string`

This happens when Azure AD is configured with **"Single-page application" (SPA)** platform instead of **"Web"** platform.

## The Solution - Step by Step

### 1. Open Azure Portal
- Go to: https://portal.azure.com
- Sign in with your admin account

### 2. Navigate to Your App
- Click on **Azure Active Directory**
- Click on **App registrations**
- Click on your app (e.g., "AI Chatbot Dev")

### 3. Go to Authentication
- In the left sidebar, click on **Authentication**

### 4. Check Your Current Platform

You will see one of these:

#### ❌ WRONG Configuration (causes the JWT error):
```
Platform configurations
└── Single-page application
    └── Redirect URIs: http://localhost:3000/api/auth/callback/microsoft-entra-id
```

#### ✅ CORRECT Configuration:
```
Platform configurations
└── Web
    └── Redirect URIs:
        - http://localhost:3000/api/auth/callback/microsoft-entra-id
        - https://comillas.vercel.app/api/auth/callback/microsoft-entra-id
```

### 5. Fix the Configuration

#### If you have "Single-page application":
1. Click on the **Single-page application** section
2. Click the **Delete** button (trash icon)
3. Confirm deletion
4. Click **+ Add a platform**
5. Choose **Web** (⚠️ NOT "Single-page application")
6. Enter redirect URI: `http://localhost:3000/api/auth/callback/microsoft-entra-id`
7. DO NOT check any of the token checkboxes
8. Click **Configure**

#### If you have "Web" but still getting errors:
1. Click on the **Web** section
2. Verify redirect URIs are correct
3. Under **Implicit grant and hybrid flows**:
   - ❌ UNCHECK "Access tokens (used for implicit flows)"
   - ❌ UNCHECK "ID tokens (used for implicit and hybrid flows)"
4. Click **Save**

### 6. Add Production URL (Optional)
1. In the Web platform configuration
2. Click **Add URI**
3. Add: `https://comillas.vercel.app/api/auth/callback/microsoft-entra-id`
4. Click **Save**

### 7. Clear Everything and Test
1. Clear browser cookies for localhost:3000
2. Restart your dev server: `pnpm dev`
3. Go to http://localhost:3000
4. Click "Sign in with Microsoft"
5. It should work now!

## Why This Happens

- **SPA Platform**: Sends tokens in a format designed for client-side JavaScript apps
- **Web Platform**: Sends tokens in standard OAuth2/OpenID Connect format that NextAuth expects
- NextAuth runs on the server, so it needs the "Web" platform format

## Quick Checklist

✅ Platform type is "Web" (not SPA)
✅ Redirect URIs are correct
✅ Implicit grant tokens are UNCHECKED
✅ Client secret is configured
✅ API permissions include: openid, profile, email, User.Read

## Still Not Working?

If you've made these changes and it's still not working:

1. Wait 5 minutes (Azure AD can take time to propagate changes)
2. Try in an incognito/private browser window
3. Check that your .env.local has:
   - `NEXTAUTH_URL=http://localhost:3000` (not an IP address)
   - All Microsoft credentials are correct
4. Restart your development server completely