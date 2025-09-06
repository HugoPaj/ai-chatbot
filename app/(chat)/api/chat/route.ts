import {
  appendClientMessage,
  appendResponseMessages,
  createDataStream,
  smoothStream,
  streamText,
} from 'ai';
import type { SearchResult } from '@/lib/types';
import { auth, type UserType } from '@/app/(auth)/auth';
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
  getMessageCountByUserId,
  getMessagesByChatId,
  getStreamIdsByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID, getTrailingMessageId } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import type { Chat } from '@/lib/db/schema';
import { differenceInSeconds } from 'date-fns';
import { ChatSDKError } from '@/lib/errors';

export const maxDuration = 60;

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
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const { id, message, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    const chat = await getChatById({ id });

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

    const previousMessages = await getMessagesByChatId({ id });

    const messages = appendClientMessage({
      // @ts-expect-error: todo add type conversion from DBMessage[] to UIMessage[]
      messages: previousMessages,
      message,
    });

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: message.experimental_attachments ?? [],
          createdAt: new Date(),
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    const stream = createDataStream({
      execute: async (dataStream) => {
        // Initialize the vector store for document search
        const vectorStore = new VectorStore();

        // Ensure the Pinecone index exists and is correctly configured before searching
        // This is fast when the index already exists but guarantees that searchSimilar()
        // will not fail due to a missing index on fresh deployments.
        await vectorStore.initialize();

        // Search for relevant documents based on the user's message
        const userMessageText =
          message.parts.find((part) => part.type === 'text')?.text || '';
        let documentContext = '';
        let documentSources: string[] = [];

        try {
          console.log(
            '[VectorStore] Searching for documents similar to user query…',
          );

          // Attempt an image-based similarity search first if the user provided image attachments
          let similarDocs: SearchResult[] = [];

          if (
            message.experimental_attachments &&
            message.experimental_attachments.length > 0
          ) {
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
            similarDocs = await vectorStore.searchSimilar(userMessageText, 100);
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
            } else {
              console.log('[VectorStore] ❌ No images in final context');
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

        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: enhancedSystemPrompt,
          messages,
          maxSteps: 5,
          experimental_activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? []
              : [
                  'getWeather',
                  'createDocument',
                  'updateDocument',
                  'requestSuggestions',
                ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
          },
          onFinish: async ({ response }) => {
            if (session.user?.id) {
              try {
                const assistantId = getTrailingMessageId({
                  messages: response.messages.filter(
                    (message) => message.role === 'assistant',
                  ),
                });

                if (!assistantId) {
                  throw new Error('No assistant message found!');
                }

                const [, assistantMessage] = appendResponseMessages({
                  messages: [message],
                  responseMessages: response.messages,
                });

                await saveMessages({
                  messages: [
                    {
                      id: assistantId,
                      chatId: id,
                      role: assistantMessage.role,
                      parts: assistantMessage.parts,
                      attachments:
                        assistantMessage.experimental_attachments ?? [],
                      createdAt: new Date(),
                    },
                  ],
                });
              } catch (_) {
                console.error('Failed to save chat');
              }
            }
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });

    // Return direct stream response without Redis
    return new Response(stream);
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

  let chat: Chat;

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

  const emptyDataStream = createDataStream({
    execute: () => {},
  });

  if (!mostRecentMessage) {
    return new Response(emptyDataStream, { status: 200 });
  }

  if (mostRecentMessage.role !== 'assistant') {
    return new Response(emptyDataStream, { status: 200 });
  }

  const restoredStream = createDataStream({
    execute: (buffer) => {
      buffer.writeData({
        type: 'append-message',
        message: JSON.stringify(mostRecentMessage),
      });
    },
  });

  return new Response(restoredStream, { status: 200 });
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
