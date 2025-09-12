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
        'chat-model': xai('grok-4-0709'),
        'chat-model-reasoning': xai('grok-4-0709'),
        'title-model': xai('grok-4-0709'),
        'artifact-model': xai('grok-4-0709'),
      },
      imageModels: {
        'small-model': xai.image('grok-2-image-1212'),
      },
    });
