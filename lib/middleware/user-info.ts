import type { NextRequest } from 'next/server';
import type { UserType } from '@/app/(auth)/auth';

export interface MiddlewareUserInfo {
  id: string;
  type: UserType;
  email: string;
}

/**
 * Extract user information from middleware headers
 * This is useful in API routes where we need user info without re-authenticating
 */
export function getUserInfoFromHeaders(
  request: NextRequest,
): MiddlewareUserInfo | null {
  const userId = request.headers.get('x-user-id');
  const userType = request.headers.get('x-user-type') as UserType;
  const userEmail = request.headers.get('x-user-email');

  if (!userId || !userType || !userEmail) {
    return null;
  }

  return {
    id: userId,
    type: userType,
    email: userEmail,
  };
}

/**
 * Check if the request is from an admin user based on middleware headers
 */
export function isAdminFromHeaders(request: NextRequest): boolean {
  const userInfo = getUserInfoFromHeaders(request);
  return userInfo?.type === 'admin';
}


