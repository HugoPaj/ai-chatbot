import type { Session } from 'next-auth';

/**
 * List of admin email addresses
 * Add your admin emails here
 */
const ADMIN_EMAILS = [
  // Add admin email addresses here
  // 'admin@example.com',
  // 'another-admin@example.com',
];

/**
 * Check if a user is an admin based on their email
 */
export function isAdmin(session: Session | null): boolean {
  if (!session?.user?.email) {
    return false;
  }

  return ADMIN_EMAILS.includes(session.user.email);
}

/**
 * Check if a user email is an admin
 */
export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email);
}
