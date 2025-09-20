import { customProvider } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { xai } from '@ai-sdk/xai';

export const myProvider = customProvider({
  languageModels: {
    // Use widely available Claude 3.5 Sonnet for general chat + vision
    'chat-model': anthropic('claude-3-5-sonnet-20241022'),
    'chat-model-reasoning': anthropic('claude-3-7-sonnet-20250219'),
    'chat-model-vision': anthropic('claude-3-5-sonnet-20241022'), // For prompts with images
    'title-model': anthropic('claude-3-5-sonnet-20241022'),
    'artifact-model': anthropic('claude-3-5-sonnet-20241022'),
  },
  imageModels: {
    // Keep existing image generation capability via xAI image model
    'small-model': xai.image('grok-2-image-1212'),
  },
});
