import type { UserType } from '@/app/(auth)/auth';
import type { ChatModel } from './models';

interface Entitlements {
  maxMessagesPerDay: number;
  availableChatModelIds: Array<ChatModel['id']>;
}

export const entitlementsByUserType: Record<UserType, Entitlements> = {

  /*
   * For users with verified organization accounts
   */
  free: {
    maxMessagesPerDay: -1, // Unlimited for org users
    availableChatModelIds: [
      'chat-model1',
      'chat-model2',
      'chat-model3',
      'chat-model4',
      'chat-model5',
      'chat-model6',
      'chat-model-reasoning',
    ],
  },


  /*
   * For admin users - unlimited access
   */
  admin: {
    maxMessagesPerDay: -1, // Unlimited
    availableChatModelIds: [
      'chat-model1',
      'chat-model2',
      'chat-model3',
      'chat-model4',
      'chat-model-reasoning',
      // OpenAI models available to admin users
      'chat-model5',
      'chat-model6',
    ],
  },
};
