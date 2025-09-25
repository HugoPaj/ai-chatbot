import { compare } from 'bcrypt-ts';
import NextAuth, { type DefaultSession } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import { getUser, isVerifiedOrgEmail } from '@/lib/db/queries';
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
    } & DefaultSession['user'];
  }

  interface User {
    id?: string;
    email?: string | null;
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
  providers: [
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.type = user.type;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        // Fallback for existing sessions without type
        session.user.type =
          token.type ||
          (isAdminEmail(session.user.email || '') ? 'admin' : 'free');
      }

      return session;
    },
  },
});
