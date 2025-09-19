import { customProvider } from 'ai';
import { xai } from '@ai-sdk/xai';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        'chat-model': xai('grok-3-fast'),
        'chat-model-reasoning': xai('grok-3-mini'),
        'chat-model-vision': xai('grok-2-vision-1212'), // For prompts with images
        'title-model': xai('grok-3-fast'),
        'artifact-model': xai('grok-3-fast'),
      },
      imageModels: {
        'small-model': xai.image('grok-2-image-1212'),
      },
    });
