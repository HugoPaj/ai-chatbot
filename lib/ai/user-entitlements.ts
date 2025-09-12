import 'server-only';

import type { UserType } from '@/app/(auth)/auth';
import type { Session } from 'next-auth';
import { isAdmin } from '@/lib/auth/admin';
import { getUserSubscription, isPaywallEnabled } from '@/lib/db/queries';
import { entitlementsByUserType } from './entitlements';
import type { ChatModel } from './models';

interface UserEntitlements {
  maxMessagesPerDay: number;
  availableChatModelIds: Array<ChatModel['id']>;
  userType: UserType;
  hasActiveSubscription: boolean;
  isPaywallActive: boolean;
}

/**
 * Get user entitlements based on session, subscription status, and global paywall setting
 */
export async function getUserEntitlements(
  session: Session | null,
): Promise<UserEntitlements> {
  if (!session?.user) {
    return {
      maxMessagesPerDay: entitlementsByUserType.guest.maxMessagesPerDay,
      availableChatModelIds: entitlementsByUserType.guest.availableChatModelIds,
      userType: 'guest',
      hasActiveSubscription: false,
      isPaywallActive: await isPaywallEnabled(),
    };
  }

  // Check if user is admin
  if (isAdmin(session)) {
    return {
      maxMessagesPerDay: entitlementsByUserType.admin.maxMessagesPerDay,
      availableChatModelIds: entitlementsByUserType.admin.availableChatModelIds,
      userType: 'admin',
      hasActiveSubscription: false, // Admins don't need subscriptions
      isPaywallActive: false, // Paywall doesn't apply to admins
    };
  }

  // Check paywall status
  const paywallEnabled = await isPaywallEnabled();

  if (!paywallEnabled) {
    // If paywall is disabled, give everyone unlimited access
    return {
      maxMessagesPerDay: -1, // Unlimited
      availableChatModelIds:
        entitlementsByUserType.premium.availableChatModelIds,
      userType: 'free',
      hasActiveSubscription: false,
      isPaywallActive: false,
    };
  }

  // Check if user has active subscription
  const subscription = await getUserSubscription(session.user.id);
  const hasActiveSubscription = subscription !== null;

  if (hasActiveSubscription) {
    return {
      maxMessagesPerDay: entitlementsByUserType.premium.maxMessagesPerDay,
      availableChatModelIds:
        entitlementsByUserType.premium.availableChatModelIds,
      userType: 'premium',
      hasActiveSubscription: true,
      isPaywallActive: true,
    };
  }

  // Default to free user
  return {
    maxMessagesPerDay: entitlementsByUserType.free.maxMessagesPerDay,
    availableChatModelIds: entitlementsByUserType.free.availableChatModelIds,
    userType: 'free',
    hasActiveSubscription: false,
    isPaywallActive: true,
  };
}

/**
 * Check if user can make a request based on their daily usage and entitlements
 */
export async function canUserMakeRequest(
  session: Session | null,
  currentDailyUsage: number,
): Promise<{ canMakeRequest: boolean; reason?: string }> {
  const entitlements = await getUserEntitlements(session);

  // Unlimited access (admins or paywall disabled)
  if (entitlements.maxMessagesPerDay === -1) {
    return { canMakeRequest: true };
  }

  // Check if user has exceeded their daily limit
  if (currentDailyUsage >= entitlements.maxMessagesPerDay) {
    if (entitlements.userType === 'guest') {
      return {
        canMakeRequest: false,
        reason:
          'Guest users are limited to 5 requests per day. Please create an account for more access.',
      };
    } else if (entitlements.userType === 'free') {
      return {
        canMakeRequest: false,
        reason:
          'Free users are limited to 5 requests per day. Upgrade to premium for unlimited access.',
      };
    }
  }

  return { canMakeRequest: true };
}
