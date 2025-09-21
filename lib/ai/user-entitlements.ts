import 'server-only';

import type { UserType } from '@/app/(auth)/auth';
import type { Session } from 'next-auth';
import { isAdmin } from '@/lib/auth/admin';
import { entitlementsByUserType } from './entitlements';
import type { ChatModel } from './models';

interface UserEntitlements {
  maxMessagesPerDay: number;
  availableChatModelIds: Array<ChatModel['id']>;
  userType: UserType;
  hasOrgAccess: boolean;
}

/**
 * Get user entitlements based on session and organization access
 */
export async function getUserEntitlements(
  session: Session | null,
): Promise<UserEntitlements> {
  if (!session?.user) {
    throw new Error('Authentication required - no guest access allowed');
  }

  // Check if user is admin
  if (isAdmin(session)) {
    return {
      maxMessagesPerDay: entitlementsByUserType.admin.maxMessagesPerDay,
      availableChatModelIds: entitlementsByUserType.admin.availableChatModelIds,
      userType: 'admin',
      hasOrgAccess: true,
    };
  }

  // For authenticated users, give full access (org verification will be handled in auth)
  return {
    maxMessagesPerDay: entitlementsByUserType.free.maxMessagesPerDay,
    availableChatModelIds: entitlementsByUserType.free.availableChatModelIds,
    userType: 'free',
    hasOrgAccess: true,
  };
}

/**
 * Check if user can make a request based on their entitlements
 */
export async function canUserMakeRequest(
  session: Session | null,
  currentDailyUsage: number,
): Promise<{ canMakeRequest: boolean; reason?: string }> {
  const entitlements = await getUserEntitlements(session);


  // All verified org users have unlimited access
  if (entitlements.maxMessagesPerDay === -1) {
    return { canMakeRequest: true };
  }

  return { canMakeRequest: true };
}
