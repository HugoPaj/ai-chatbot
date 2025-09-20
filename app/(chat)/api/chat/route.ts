import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from 'ai';
import type { SearchResult } from '@/lib/types';
import { auth } from '@/app/(auth)/auth';
import {
  type RequestHints,
  systemPrompt,
  formatDocumentContext,
} from '@/lib/ai/prompts';
import { VectorStore } from '@/lib/ai/vectorStore';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  getDailyUsage,
  incrementDailyUsage,
} from '@/lib/db/queries';
import { canUserMakeRequest } from '@/lib/ai/user-entitlements';
import { generateUUID, getTrailingMessageId } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { generateImage } from '@/lib/ai/tools/generate-image';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import { ChatSDKError } from '@/lib/errors';

export const maxDuration = 300;

import redis from '@/lib/redis';

let globalStreamContext: ResumableStreamContext | null = null;

function getStreamContext() {
  if (!globalStreamContext) {
    try {
      const redisStorage = {
        async get(key: string) {
          const value = await redis.get(key);
          return value ? JSON.parse(value) : null;
        },
        async set(key: string, value: any) {
          await redis.set(key, JSON.stringify(value), 'EX', 3600); // 1 hour expiry
        },
        async delete(key: string) {
          await redis.del(key);
        },
      };

      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
        // @ts-ignore - storage is a valid option but types are not updated
        storage: redisStorage,
      });
    } catch (error: any) {
      console.error('Redis initialization error:', error);
      // Fallback to non-resumable stream
      return null;
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();

    // Preprocess for AI SDK v5 compatibility
    if (!json.message.createdAt) {
      json.message.createdAt = new Date().toISOString();
    }
    if (!json.message.content && json.message.parts?.length > 0) {
      json.message.content = json.message.parts
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join(' ');
    }

    requestBody = postRequestBodySchema.parse(json);
  } catch (error) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const { id, message, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    // Get current date for daily usage tracking
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Get daily usage for the user
    const dailyUsage = await getDailyUsage({
      userId: session.user.id,
      date: today,
    });

    // Check if user can make this request
    const { canMakeRequest, reason } = await canUserMakeRequest(
      session,
      dailyUsage,
    );

    if (!canMakeRequest) {
      const error = new ChatSDKError('rate_limit:chat');
      error.message = reason || 'Daily request limit exceeded';
      return error.toResponse();
    }

    // Run database operations in parallel for better performance
    const [chat, previousMessages] = await Promise.all([
      getChatById({ id }),
      getMessagesByChatId({ id }),
    ]);

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    const messages: UIMessage[] = [
      ...previousMessages.map((msg) => ({
        ...msg,
        role: msg.role as 'user' | 'assistant' | 'system',
        parts: msg.parts as any,
      })),
      message as unknown as UIMessage,
    ];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    // Run user message saving and stream setup in parallel
    const streamId = generateUUID();
    /* FIXME(@ai-sdk-upgrade-v5): The `experimental_attachments` property has been replaced with the parts array. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#attachments--file-parts */
    await Promise.all([
      saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: 'user',
            parts: message.parts || [
              { type: 'text', text: (message as any).content || '' },
            ],
            attachments: Array.isArray(
              (message as any).experimental_attachments,
            )
              ? (message as any).experimental_attachments
              : [],
            createdAt: new Date(),
          },
        ],
      }),
      incrementDailyUsage({
        userId: session.user.id,
        date: today,
      }),
      createStreamId({ streamId, chatId: id }),
    ]);

    const stream = createUIMessageStream<UIMessage>({
      execute: async ({ writer }) => {
        // Start streaming immediately while preparing context in background
        let documentContext = '';
        let documentSources: string[] = [];

        // Extract user message text for async processing
        const userMessageText =
          message.parts.find((part) => part.type === 'text')?.text || '';

        // Get document context before starting stream for better results
        try {
          const vectorStore = new VectorStore();
          await vectorStore.initialize();

          console.log(
            '[VectorStore] Searching for documents similar to user query…',
          );

          // Attempt an image-based similarity search first if the user provided image attachments
          let similarDocs: SearchResult[] = [];

          /* FIXME(@ai-sdk-upgrade-v5): The `experimental_attachments` property has been replaced with the parts array. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#attachments--file-parts */
          if (
            message.experimental_attachments &&
            message.experimental_attachments.length > 0
          ) {
            /* FIXME(@ai-sdk-upgrade-v5): The `experimental_attachments` property has been replaced with the parts array. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#attachments--file-parts */
            const firstImage = message.experimental_attachments.find((att) =>
              att.contentType.startsWith('image/'),
            );

            if (firstImage) {
              try {
                console.log(
                  `[VectorStore] Detected image attachment (${firstImage.name}). Performing image similarity search…`,
                );

                const imageResponse = await fetch(firstImage.url);

                if (!imageResponse.ok) {
                  throw new Error(
                    `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`,
                  );
                }

                const imageBuffer = Buffer.from(
                  await imageResponse.arrayBuffer(),
                );
                const imageBase64 = imageBuffer.toString('base64');

                similarDocs = await vectorStore.searchSimilarByImage(
                  imageBase64,
                  100,
                );

                console.log(
                  `[VectorStore] Retrieved ${similarDocs.length} document(s) from image search`,
                );
              } catch (error) {
                console.error(
                  '[VectorStore] Image similarity search failed, falling back to text search:',
                  error,
                );
              }
            }
          }

          // Fall back to text search if no results were returned from the image search
          if (similarDocs.length === 0) {
            // Check if user is asking specifically about images/figures/photos
            const isImageQuery =
              /\b(imagen|foto|figura|diagrama|gráfico|chart|image|picture|photo|figure|diagram|visual|fotos|imágenes|figuras|diagramas|gráficos|mostrar|enseñar|ver)/i.test(
                userMessageText,
              );

            if (isImageQuery) {
              console.log(
                '[VectorStore] Detected image query - searching with boosted image results',
              );
              // Search with higher limit and boost image results
              const allResults = await vectorStore.searchSimilar(
                userMessageText,
                100,
              );
              // Boost image results by adding a score bonus and prioritize them
              similarDocs = allResults
                .map((doc) => ({
                  ...doc,
                  score:
                    doc.metadata.contentType === 'image'
                      ? doc.score + 0.15
                      : doc.score,
                }))
                .sort((a, b) => b.score - a.score);
            } else {
              similarDocs = await vectorStore.searchSimilar(
                userMessageText,
                100,
              );
            }
          }

          console.log(
            `[VectorStore] Retrieved ${similarDocs.length} candidate document(s)`,
          );

          if (similarDocs.length > 0) {
            // Optional: log top results with score and filename for visibility
            console.log(
              '[VectorStore] Top matches:',
              similarDocs.slice(0, 5).map((doc) => ({
                score: doc.score.toFixed(3),
                file: doc.metadata.filename,
                page: doc.metadata.page ?? 'N/A',
                type: doc.metadata.contentType,
              })),
            );

            // Debug: Check for images in results
            const imageResults = similarDocs.filter(
              (doc) => doc.metadata.contentType === 'image',
            );
            const textResults = similarDocs.filter(
              (doc) => doc.metadata.contentType === 'text',
            );
            console.log(
              `[VectorStore] Content breakdown: ${textResults.length} text, ${imageResults.length} images`,
            );

            if (imageResults.length > 0) {
              console.log(
                '[VectorStore] Image results:',
                imageResults.slice(0, 3).map((doc) => ({
                  score: doc.score.toFixed(3),
                  file: doc.metadata.filename,
                  page: doc.metadata.page ?? 'N/A',
                  hasImageUrl: !!doc.metadata.imageUrl,
                  imageUrl: doc.metadata.imageUrl,
                })),
              );
            }

            // Create context from retrieved documents
            documentContext = formatDocumentContext(similarDocs);

            // Debug: Log if images are included in context
            if (documentContext.includes('![')) {
              console.log('[VectorStore] ✅ Images included in context');
              console.log(
                '[VectorStore] Context preview:',
                `${documentContext.substring(0, 500)}...`,
              );
            } else {
              console.log('[VectorStore] ❌ No images in final context');
              console.log(
                '[VectorStore] Available image results:',
                imageResults.length,
              );
              if (imageResults.length > 0) {
                console.log(
                  '[VectorStore] Image results details:',
                  imageResults.map((doc) => ({
                    score: doc.score,
                    hasUrl: !!doc.metadata.imageUrl,
                    content: doc.metadata.content?.substring(0, 100),
                  })),
                );
              }
            }

            // Extract unique source filenames
            documentSources = Array.from(
              new Set(
                similarDocs
                  .filter((doc) => doc.score > 0.3)
                  .map((doc) => doc.metadata.filename),
              ),
            );
          } else {
            console.log('[VectorStore] No relevant documents found for query.');
          }
        } catch (error) {
          console.error('Error retrieving similar documents:', error);
          // Continue without document context if there's an error
        }

        // Build enhanced system prompt with retrieved documents if available
        let enhancedSystemPrompt = systemPrompt({
          selectedChatModel,
          requestHints,
        });

        if (documentContext) {
          enhancedSystemPrompt += `\n\nRelevant engineering documents for reference:\n${documentContext}`;
        }

        // Decide whether to use a vision-capable model based on attachments
        /* FIXME(@ai-sdk-upgrade-v5): The `experimental_attachments` property has been replaced with the parts array. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#attachments--file-parts */
        const hasImageAttachment = Boolean(
          message.experimental_attachments?.some((att) =>
            att.contentType.startsWith('image/'),
          ),
        );

        const resolvedModelId = hasImageAttachment
          ? ('chat-model-vision' as const)
          : selectedChatModel;

        // Convert UIMessages to ModelMessages for AI SDK v5 compatibility
        const modelMessages = convertToModelMessages(messages);

        // Send sources data if available
        if (documentSources.length > 0) {
          console.log('[DEBUG] Sending sources data:', documentSources);
          writer.write({
            type: 'data-sources',
            data: {
              type: 'sources',
              sources: documentSources,
            },
          });
        }

        const result = streamText({
          model: myProvider.languageModel(resolvedModelId),
          system: enhancedSystemPrompt,
          messages: modelMessages,
          stopWhen: stepCountIs(5),

          experimental_activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? []
              : [
                  'getWeather',
                  'createDocument',
                  'updateDocument',
                  'requestSuggestions',
                  'generateImage',
                ],

          experimental_transform: smoothStream({
            chunking: 'word',
            delayInMs: 5, // Smooth streaming at 200 chars/second
          }),

          tools: {
            getWeather,
            // @ts-expect-error: dataStream API changed in v5, needs migration
            createDocument: createDocument({ session }),
            // @ts-expect-error: dataStream API changed in v5, needs migration
            updateDocument: updateDocument({ session }),
            // @ts-expect-error: dataStream API changed in v5, needs migration
            requestSuggestions: requestSuggestions({
              session,
            }),
            generateImage: generateImage({ session }),
          },

          onFinish: async ({ response }) => {
            // Save assistant response asynchronously without blocking
            if (session.user?.id) {
              setImmediate(async () => {
                try {
                  const assistantMessages = response.messages.filter(
                    (message) => message.role === 'assistant',
                  );

                  console.log(
                    'Assistant messages from response:',
                    assistantMessages,
                  );

                  let assistantId = getTrailingMessageId({
                    // @ts-expect-error: response.messages type mismatch with ResponseMessage[] in v5
                    messages: assistantMessages,
                  });

                  // Generate a new ID if one doesn't exist
                  if (!assistantId) {
                    assistantId = generateUUID();
                    console.log('Generated new assistant ID:', assistantId);
                  }

                  console.log('Using assistant ID:', assistantId);

                  const assistantMessage = response.messages.find(
                    (m) => m.role === 'assistant',
                  ) as UIMessage | undefined;

                  if (assistantMessage) {
                    console.log('Saving assistant message:', {
                      id: assistantId,
                      role: assistantMessage.role,
                      parts: assistantMessage.parts,
                      content: (assistantMessage as any).content,
                    });

                    // Handle AI SDK v5 content structure - content might be an array of parts
                    let messageParts: Array<{ type: string; text: string }>;
                    const rawContent = (assistantMessage as any).content;

                    if (
                      assistantMessage.parts &&
                      Array.isArray(assistantMessage.parts) &&
                      assistantMessage.parts.length > 0
                    ) {
                      // Use existing parts if available
                      messageParts = assistantMessage.parts;
                    } else if (Array.isArray(rawContent)) {
                      // Content is an array (AI SDK v5 format) - convert to parts
                      messageParts = rawContent.map((item: any) => ({
                        type: item.type || 'text',
                        text: item.text || '',
                      }));
                    } else if (typeof rawContent === 'string') {
                      // Content is a string - wrap in text part
                      messageParts = [{ type: 'text', text: rawContent }];
                    } else {
                      // Fallback for unknown format
                      messageParts = [{ type: 'text', text: '' }];
                    }

                    console.log('Processed message parts:', messageParts);

                    /* FIXME(@ai-sdk-upgrade-v5): The `experimental_attachments` property has been replaced with the parts array. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#attachments--file-parts */
                    await saveMessages({
                      messages: [
                        {
                          id: assistantId,
                          chatId: id,
                          role: assistantMessage.role,
                          parts: messageParts,
                          attachments: Array.isArray(
                            (assistantMessage as any).experimental_attachments,
                          )
                            ? (assistantMessage as any).experimental_attachments
                            : [],
                          createdAt: new Date(),
                        },
                      ],
                    });
                    console.log('Assistant message saved successfully');
                  }
                } catch (error) {
                  console.error('Failed to save assistant message:', error);
                }
              });
            }
          },

          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        // Properly merge the streamText result into the UI message stream
        writer.merge(result.toUIMessageStream());
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });

    // Return direct stream response
    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error('Unexpected error in chat route:', error);
    return Response.json(
      {
        code: '',
        message: 'Something went wrong. Please try again later.',
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  let chat: any;

  try {
    chat = await getChatById({ id: chatId });
  } catch {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (chat.visibility === 'private' && chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const messages = await getMessagesByChatId({ id: chatId });
  const mostRecentMessage = messages.at(-1);

  const emptyStream = createUIMessageStream<UIMessage>({
    execute: () => {},
  });
  const emptyDataStream = createUIMessageStreamResponse({
    stream: emptyStream,
  });

  if (!mostRecentMessage) {
    return emptyDataStream;
  }

  if (mostRecentMessage.role !== 'assistant') {
    // @ts-expect-error: Response constructor type mismatch in v5
    return new Response(emptyDataStream, { status: 200 });
  }

  const restored = createUIMessageStream<UIMessage>({
    execute: ({ writer }) => {
      writer.write({
        type: 'data-append-message',
        data: {
          type: 'append-message',
          message: JSON.stringify(mostRecentMessage),
        },
      });
    },
  });
  return createUIMessageStreamResponse({ stream: restored });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
