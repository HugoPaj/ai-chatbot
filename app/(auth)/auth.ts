import { compare } from 'bcrypt-ts';
import NextAuth, { type DefaultSession } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import {
  getUser,
  isVerifiedOrgEmail,
  getOrgByDomain,
  createSSOUser,
} from '@/lib/db/queries';
import { authConfig } from './auth.config';
import { DUMMY_PASSWORD } from '@/lib/constants';
import { isAdminEmail } from '@/lib/auth/admin';
import type { DefaultJWT } from 'next-auth/jwt';

export type UserType = 'free' | 'admin';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
      name?: string | null;
    } & DefaultSession['user'];
  }

  interface User {
    id?: string;
    email?: string | null;
    name?: string | null;
    type: UserType;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  trustHost: true, // Required for Vercel/serverless deployments
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.AUTH_SECRET,
  providers: [
    // Microsoft SSO Provider (optional - only if env vars are set)
    ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
      ? [
          MicrosoftEntraID({
            clientId: process.env.MICROSOFT_CLIENT_ID,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
            issuer: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/v2.0`,
            authorization: {
              params: {
                scope: 'openid profile email offline_access',
                response_type: 'code',
              },
            },
          }),
        ]
      : []),
    // Credentials Provider (always available for testing/admin)
    {
      id: 'credentials',
      name: 'Credentials',
      type: 'credentials',
      credentials: {},
      async authorize({ email, password }: any) {
        const normalizedEmail =
          typeof email === 'string' ? email.trim().toLowerCase() : '';
        const users = await getUser(normalizedEmail);

        if (users.length === 0) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const [user] = users;

        if (!user.password) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const passwordsMatch = await compare(password, user.password);

        if (!passwordsMatch) return null;

        // Check if user has verified organization email (unless admin)
        const isAdmin = isAdminEmail(user.email);
        if (!isAdmin) {
          const hasVerifiedOrgEmail = await isVerifiedOrgEmail(user.email);
          if (!hasVerifiedOrgEmail) {
            return null; // Reject non-admin users without verified org email
          }
        }

        // Determine user type based on admin status
        const userType: UserType = isAdmin ? 'admin' : 'free';

        return { ...user, type: userType };
      },
    },
  ] as Provider[],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      // Handle initial sign in
      if (account?.provider === 'microsoft-entra-id') {
        const email =
          user?.email ||
          (profile as any)?.email ||
          (profile as any)?.preferred_username;

        if (!email) {
          throw new Error('No email address found in Microsoft account');
        }

        // Extract name from Microsoft profile
        const name =
          user?.name ||
          (profile as any)?.name ||
          (profile as any)?.displayName ||
          email.split('@')[0]; // Fallback to email prefix

        const normalizedEmail = email.trim().toLowerCase();
        const existingUsers = await getUser(normalizedEmail);

        if (existingUsers.length === 0) {
          // Check if user's domain is from a verified organization
          const domain = normalizedEmail.split('@')[1];
          const organization = await getOrgByDomain(domain);

          if (organization?.isActive) {
            // Auto-create user for verified organization domain
            const newUser = await createSSOUser(
              normalizedEmail,
              organization.id,
            );
            token.id = newUser.id;
            token.email = normalizedEmail; // Store email in token
            token.type = isAdminEmail(normalizedEmail) ? 'admin' : 'free';
            token.name = name; // Store name in token
          } else {
            // Domain not verified - reject login
            throw new Error('Access denied: Organization not verified');
          }
        } else {
          // Existing user
          token.id = existingUsers[0].id;
          token.email = normalizedEmail; // Store email in token
          token.type = isAdminEmail(normalizedEmail) ? 'admin' : 'free';
          token.name = name; // Store name in token
        }
      } else if (user) {
        // Handle credentials login
        token.id = user.id as string;
        token.email = user.email as string; // Store email in token
        token.type = user.type;
      }

      // Ensure token has required fields
      if (!token.id && token.sub) {
        // Fallback for subsequent requests
        token.id = token.sub;
      }

      // Ensure token.type has a value
      if (!token.type) {
        token.type =
          token.email && isAdminEmail(token.email as string) ? 'admin' : 'free';
      }

      // Ensure we return a proper JWT token object
      return {
        ...token,
        id: token.id || token.sub || '',
        email: token.email || null,
        type: token.type || 'free',
        name: token.name || null,
      };
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.email = token.email as string || session.user.email;
        session.user.name = token.name || token.email || null;
        // Fallback for existing sessions without type
        session.user.type =
          token.type ||
          (isAdminEmail(session.user.email || '') ? 'admin' : 'free');
      }

      return session;
    },
  },
});
