import { customProvider } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { xai } from '@ai-sdk/xai';

export const myProvider = customProvider({
  languageModels: {
    'chat-model1': anthropic('claude-sonnet-4-20250514'),
    'chat-model2': anthropic('claude-opus-4-20250514'),
    'chat-model3': anthropic('claude-3-5-haiku-20241022'),
    'chat-model4': xai('grok-4'),
    'chat-model-reasoning': anthropic('claude-3-7-sonnet-20250219'),
    'chat-model-vision': anthropic('claude-sonnet-4-20250514'), // For prompts with images
    'title-model': anthropic('claude-3-5-haiku-20241022'),
    'artifact-model': anthropic('claude-3-5-sonnet-20241022'),
  },
  imageModels: {
    // Keep existing image generation capability via xAI image model
    'small-model': xai.image('grok-2-image-1212'),
  },
});
