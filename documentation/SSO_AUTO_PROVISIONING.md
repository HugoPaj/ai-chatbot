# SSO Auto-Provisioning Guide

## How It Works

This application supports automatic user provisioning for Microsoft Entra ID (Azure AD) SSO authentication. When a user logs in via SSO, the system automatically creates their account if they belong to a verified organization.

## Setup Process

### 1. Add Organization to Database

Before users from an organization can log in, you must add their domain to the `Org` table.

**Using Drizzle Studio:**
```bash
npx drizzle-kit studio
```

Then add a new row to the `Org` table:
- **name**: Organization name (e.g., "Acme Corporation")
- **domain**: Email domain (e.g., "acme.com" or "acme.onmicrosoft.com")
- **type**: `company` or `university`
- **isActive**: `true`
- **maxUsersPerDay**: `-1` (unlimited) or a specific number

**Using SQL:**
```sql
INSERT INTO "Org" (name, domain, type, "isActive", "maxUsersPerDay")
VALUES ('Acme Corporation', 'acme.com', 'company', true, '-1');
```

### 2. Configure Microsoft Entra ID

Set the following environment variables in `.env`:
```
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_TENANT_ID=your-tenant-id
AUTH_SECRET=your-auth-secret
```

### 3. User Login Flow

When a user logs in via Microsoft SSO:

1. **Microsoft Authentication**: User authenticates with Microsoft Entra ID
2. **Domain Check**: System extracts email domain (e.g., `user@acme.com` → `acme.com`)
3. **Organization Verification**: Checks if domain exists in `Org` table with `isActive: true`
4. **Auto-Provisioning**:
   - ✅ **Domain verified**: Automatically creates user account in database
   - ❌ **Domain not verified**: Rejects login
5. **Login Success**: User can now access the application

### 4. Subsequent Logins

After the first login, the user account exists in the database, so they can log in immediately without any provisioning step.

## Enterprise Deployment

### For Each New Customer:

1. **Add their organization**:
   ```sql
   INSERT INTO "Org" (name, domain, type, "isActive")
   VALUES ('Customer Name', 'customer.com', 'company', true);
   ```

2. **Configure their SSO**: Provide them with your app's callback URL for their Microsoft Entra ID configuration

3. **Done!** All employees with `@customer.com` email addresses can now log in automatically

## Security Features

- **Domain Whitelisting**: Only users from verified organizations can create accounts
- **No Manual User Management**: Scales to thousands of users without manual setup
- **Verified by Default**: SSO users are automatically marked as verified
- **No Password Storage**: SSO users authenticate via Microsoft, no passwords stored

## Code Implementation

The auto-provisioning logic is implemented in:
- **Authentication**: `app/(auth)/auth.ts` (lines 113-138)
- **User Creation**: `lib/db/queries.ts` (`createSSOUser` function)
- **Domain Verification**: `lib/db/queries.ts` (`getOrgByDomain` function)

## Troubleshooting

**Login fails with JWT error:**
- Ensure the organization's domain is added to the `Org` table
- Check that `isActive` is set to `true`
- Verify the email domain matches exactly (case-insensitive)

**User not being created:**
- Check server logs for "Auto-provisioning SSO user" or "SSO user from unverified domain"
- Verify `POSTGRES_URL` environment variable is set correctly
- Ensure database migrations have been run
