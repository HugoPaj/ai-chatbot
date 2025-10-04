export const DEFAULT_CHAT_MODEL: string = 'chat-model1';

/**
 * Get the default chat model for a user based on their entitlements
 * Falls back to the first available model in their entitlement list
 */
export function getDefaultChatModelForUser(
  userType: string,
  entitlementsByUserType: any,
): string {
  // Get available models for this user type
  const userEntitlements = entitlementsByUserType[userType];
  if (!userEntitlements || !userEntitlements.availableChatModelIds?.length) {
    // Fallback to default model if user type not found
    return DEFAULT_CHAT_MODEL;
  }

  // Return the first available model for this user type
  return userEntitlements.availableChatModelIds[0];
}

export interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'chat-model1',
    name: 'Claude 4 Sonnet',
    description: 'Primary Anthropic model',
  },
  {
    id: 'chat-model2',
    name: 'Claude Opus 4',
    description: 'Most powerful Anthropic model',
  },
  {
    id: 'chat-model3',
    name: 'Claude 3.5 Haiku',
    description: 'Fastest Anthropic model',
  },
  {
    id: 'chat-model4',
    name: 'Grok 4',
    description: 'Most powerful xAI model',
  },
  {
    id: 'chat-model5',
    name: 'GPT-4o',
    description: 'Most advanced OpenAI model',
  },
  {
    id: 'chat-model-reasoning',
    name: 'GPT-5 Reasoning',
    description: 'Advanced reasoning OpenAI model',
  },
];
