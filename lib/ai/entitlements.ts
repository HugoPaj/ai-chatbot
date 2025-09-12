import type { UserType } from '@/app/(auth)/auth';
import type { ChatModel } from './models';

interface Entitlements {
  maxMessagesPerDay: number;
  availableChatModelIds: Array<ChatModel['id']>;
}

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  /*
   * For users without an account
   */
  guest: {
    maxMessagesPerDay: 5,
    availableChatModelIds: ['chat-model', 'chat-model-reasoning'],
  },

  /*
   * For users with an account but no subscription
   */
  free: {
    maxMessagesPerDay: 5,
    availableChatModelIds: ['chat-model', 'chat-model-reasoning'],
  },

  /*
   * For users with a paid subscription
   */
  premium: {
    maxMessagesPerDay: -1, // Unlimited
    availableChatModelIds: ['chat-model', 'chat-model-reasoning'],
  },

  /*
   * For admin users - unlimited access
   */
  admin: {
    maxMessagesPerDay: -1, // Unlimited
    availableChatModelIds: ['chat-model', 'chat-model-reasoning'],
  },
};
