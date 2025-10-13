# Microsoft SSO Troubleshooting Guide

## JWT Serialization Error Fix

If you encounter the error:
```
CallbackRouteError: JWTs must use Compact JWS serialization, JWT must be a string
```

### Root Cause

This error occurs when the Azure AD app registration is configured with "SPA" (Single Page Application) as the platform type instead of "Web". The JWT tokens sent by SPA platform are in a different format that NextAuth cannot process.

### Solution

**In Azure Portal:**
1. Go to your App Registration in Azure AD
2. Navigate to "Authentication" section
3. Check your platform configuration:
   - ❌ **WRONG:** Platform type is "SPA"
   - ✅ **CORRECT:** Platform type is "Web"
4. If you have "SPA", delete it and add a new "Web" platform with the same redirect URI

### Code Changes Applied

The following changes have been made to fix this issue:

1. **Updated Cookie Configuration**: Modified cookie settings to use appropriate secure settings based on environment (production vs development)

2. **Enhanced JWT Callback**:
   - Added proper email extraction from both user and profile objects
   - Improved error handling for missing email addresses
   - Ensured proper token object return structure

3. **Microsoft Entra ID Provider Configuration**:
   - Added explicit authorization parameters (response_type, response_mode)
   - Configured token endpoint authentication method
   - Added PKCE and state checks for security

4. **Cookie Settings**:
   - Using `lax` sameSite policy instead of `none` for better compatibility
   - Conditional secure cookies based on environment

## Environment Variables Required

Ensure these are set in your Vercel environment:

```bash
# Required
AUTH_SECRET=your-random-32-character-string
MICROSOFT_CLIENT_ID=your-application-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret-value
MICROSOFT_TENANT_ID=your-directory-tenant-id

# Enable SSO in UI
NEXT_PUBLIC_MICROSOFT_SSO_ENABLED=true
```

## Generating AUTH_SECRET

If you don't have an AUTH_SECRET, generate one:

```bash
openssl rand -base64 32
```

Or using Node.js:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Vercel Deployment Checklist

1. **Environment Variables**: All variables set in Vercel dashboard
2. **Redirect URI**: Add production URL to Azure AD app:
   - `https://comillas.vercel.app/api/auth/callback/microsoft-entra-id`
3. **AUTH_SECRET**: Must be the same across all deployments
4. **Domain**: Ensure your domain is added to Vercel project settings

## Common Issues and Solutions

### Issue 1: Redirect URI Mismatch
**Solution**: Ensure the redirect URI in Azure AD matches exactly (no trailing slash):
- Production: `https://comillas.vercel.app/api/auth/callback/microsoft-entra-id`
- Local: `http://localhost:3000/api/auth/callback/microsoft-entra-id`

**Important for Local Development:**
- Always use `http://localhost:3000` to access your dev server, NOT your IP address (like `http://172.31.192.1:3000`)
- Set `NEXTAUTH_URL=http://localhost:3000` in your `.env.local` file
- If you see an error with an IP address in the redirect URI, it means NEXTAUTH_URL is misconfigured
- The redirect URI in Azure AD must match exactly what's in NEXTAUTH_URL

### Issue 2: User Not Found
**Solution**: The system now auto-provisions SSO users if their domain is verified in the organization table.

### Issue 3: Cookie Issues
**Solution**: The updated configuration uses appropriate cookie settings for production environments.

### Issue 4: Token/Session Issues
**Solution**: The JWT callback now properly handles token creation and ensures all required fields are present.

## Debug Mode

To enable detailed logging, the auth.ts file includes console.log statements in the JWT and session callbacks. Check your Vercel function logs for details.

## Testing the Fix

1. Clear browser cookies for your domain
2. Navigate to the login page
3. Click "Sign in with Microsoft"
4. Authenticate with your Microsoft account
5. You should be redirected back and logged in successfully

## Additional Notes

- The system now supports auto-provisioning of SSO users from verified organization domains
- Admin users are determined by the isAdminEmail function
- Non-admin users must belong to a verified organization to access the system