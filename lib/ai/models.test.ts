import { simulateReadableStream } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import { getResponseChunksByPrompt } from '@/tests/prompts/utils';

export const chatModel = new MockLanguageModelV2({
  doGenerate: async () => ({
    content: [{ type: 'text', text: 'Hello, world!' }],
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    warnings: [],
  }),
  // @ts-expect-error: doStream return type mismatch between V1 and V2 APIs
  doStream: async ({ prompt }) => ({
    stream: simulateReadableStream({
      chunkDelayInMs: 500,
      initialDelayInMs: 1000,
      // @ts-expect-error: V1/V2 stream part interface mismatch
      chunks: getResponseChunksByPrompt(prompt),
    }),
    rawCall: { rawPrompt: null, rawSettings: {} },
  }),
});

export const reasoningModel = new MockLanguageModelV2({
  doGenerate: async () => ({
    content: [{ type: 'text', text: 'Hello, world!' }],
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    warnings: [],
  }),
  // @ts-expect-error: doStream return type mismatch between V1 and V2 APIs
  doStream: async ({ prompt }) => ({
    stream: simulateReadableStream({
      chunkDelayInMs: 500,
      initialDelayInMs: 1000,
      // @ts-expect-error: V1/V2 stream part interface mismatch
      chunks: getResponseChunksByPrompt(prompt, true),
    }),
    rawCall: { rawPrompt: null, rawSettings: {} },
  }),
});

export const titleModel = new MockLanguageModelV2({
  doGenerate: async () => ({
    content: [{ type: 'text', text: 'This is a test title' }],
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    warnings: [],
  }),
  doStream: async () => ({
    stream: simulateReadableStream({
      chunkDelayInMs: 500,
      initialDelayInMs: 1000,
      chunks: [
        { type: 'text-delta', id: 'msg-1', delta: 'This is a test title' },
        {
          type: 'finish',
          finishReason: 'stop',
          logprobs: undefined,
          usage: { outputTokens: 10, inputTokens: 3, totalTokens: 13 },
        },
      ],
    }),
    rawCall: { rawPrompt: null, rawSettings: {} },
  }),
});

export const artifactModel = new MockLanguageModelV2({
  doGenerate: async () => ({
    content: [{ type: 'text', text: 'Hello, world!' }],
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    warnings: [],
  }),
  // @ts-expect-error: doStream return type mismatch between V1 and V2 APIs
  doStream: async ({ prompt }) => ({
    stream: simulateReadableStream({
      chunkDelayInMs: 50,
      initialDelayInMs: 100,
      // @ts-expect-error: V1/V2 stream part interface mismatch
      chunks: getResponseChunksByPrompt(prompt),
    }),
    rawCall: { rawPrompt: null, rawSettings: {} },
  }),
});
