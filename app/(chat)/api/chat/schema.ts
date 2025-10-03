import { z } from 'zod/v3';

const textPartSchema = z.object({
  text: z.string().min(1).max(2000),
  type: z.enum(['text']),
});

const filePartSchema = z.object({
  type: z.enum(['file']),
  url: z.string().url(),
  name: z.string().min(1).max(100),
  mediaType: z.string(), // e.g., 'image/png', 'image/jpeg'
  data: z.string().optional(), // base64 or data URL (optional)
});

const partSchema = z.union([textPartSchema, filePartSchema]);

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    createdAt: z.coerce.date(),
    role: z.enum(['user']),
    content: z.string().min(1).max(2000),
    parts: z.array(partSchema),
  }),
  selectedChatModel: z.enum([
    'chat-model1',
    'chat-model2',
    'chat-model3',
    'chat-model4',
    'chat-model5',
    'chat-model6',
    'chat-model-reasoning',
    'chat-model-vision',
  ]),
  selectedVisibilityType: z.enum(['public', 'private']),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
