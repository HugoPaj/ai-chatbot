import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from 'ai';
import { auth } from '@/app/(auth)/auth';
import {
  type RequestHints,
  systemPrompt,
} from '@/lib/ai/prompts';
import { DocumentRetrievalService } from '@/lib/ai/document-retrieval-service';
import {
  deleteChatById,
  getChatById,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  getDailyUsage,
  incrementDailyUsage,
} from '@/lib/db/queries';
import { canUserMakeRequest } from '@/lib/ai/user-entitlements';
import { generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { generateImage } from '@/lib/ai/tools/generate-image';
import { calculate } from '@/lib/ai/tools/calculate';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import { ChatSDKError } from '@/lib/errors';

export const maxDuration = 300;

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

    // Increment daily usage tracking
    await incrementDailyUsage({
      userId: session.user.id,
      date: today,
    });

    // Save the user message immediately before streaming
    try {
      await saveMessages({
        messages: [
          {
            id: message.id,
            chatId: id,
            role: message.role,
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
      console.log('Saved user message to database');
    } catch (error) {
      console.error('Failed to save user message:', error);
    }

    // Define citations at higher scope so it's accessible in onFinish callback
    let citations: any[] = [];

    const stream = createUIMessageStream<UIMessage>({
      generateId: generateUUID,
      execute: async ({ writer }) => {
        // Start streaming immediately while preparing context in background
        let documentContext = '';
        let documentSources: string[] = [];

        // Get document context using the document retrieval service
        const documentRetrievalService = new DocumentRetrievalService();
        await documentRetrievalService.initialize();

        const ragResult = await documentRetrievalService.getDocumentContext(message);
        documentContext = ragResult.documentContext;
        documentSources = ragResult.documentSources;
        citations = ragResult.citations;

        console.log(`[RAG] Query type: ${ragResult.queryType}`);
        console.log(`[RAG] Full document loaded: ${ragResult.fullDocumentLoaded}`);

        // Build enhanced system prompt with retrieved documents
        const basePrompt = systemPrompt({
          selectedChatModel,
          requestHints,
        });

        // Build system prompt with document context
        const systemPromptWithContext = documentRetrievalService.enhanceSystemPrompt(
          basePrompt,
          ragResult,
        );

        // Decide whether to use a vision-capable model based on file parts
        const hasImageAttachment = Boolean(
          message.parts.some(
            (part: any) =>
              part.type === 'file' && part.mediaType?.startsWith('image/'),
          ),
        );

        const resolvedModelId = hasImageAttachment
          ? ('chat-model-vision' as const)
          : selectedChatModel;

        // Convert UIMessages to ModelMessages for AI SDK v5 compatibility
        let modelMessages = convertToModelMessages(messages);

        // For full document loading with caching, inject the document as a cached user message
        if (ragResult.fullDocumentLoaded && ragResult.cachedSystemMessage) {
          console.log('[RAG] Injecting cached document into message history');

          // Extract the document content from cached system message
          const docContent = Array.isArray(ragResult.cachedSystemMessage)
            ? ragResult.cachedSystemMessage
                .map((part: any) => (part.type === 'text' ? part.text : ''))
                .filter(Boolean)
                .join('\n\n')
            : '';

          // Inject a user message with the full document BEFORE the actual messages
          // This gets cached by Anthropic
          modelMessages = [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Here is the full document for context:\n\n${docContent}`,
                  providerOptions: {
                    anthropic: { cacheControl: { type: 'ephemeral' } },
                  },
                },
              ],
            },
            {
              role: 'assistant',
              content: 'I have read and understood the full document. I am ready to answer questions about it.',
            },
            ...modelMessages,
          ];

          console.log('[RAG] ✅ Document injected with cache control enabled');
        }

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
          system: systemPromptWithContext,
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
                  'calculate',
                ],

          experimental_transform: smoothStream({
            chunking: 'word',
            delayInMs: 5, // Smooth streaming at 200 chars/second
          }),

          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream: writer }),
            updateDocument: updateDocument({ session, dataStream: writer }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream: writer,
            }),
            generateImage: generateImage({ session }),
            calculate,
          },

          // Enable reasoning summaries for reasoning model
          ...(selectedChatModel === 'chat-model-reasoning' && {
            providerOptions: {
              openai: {
                reasoningSummary: 'auto',
              },
            },
          }),

          onFinish: async (result) => {
            // Log cache metrics from Anthropic
            if (result.providerMetadata?.anthropic) {
              const cacheMetrics = result.providerMetadata.anthropic;
              console.log('[Cache Metrics]', JSON.stringify(cacheMetrics, null, 2));

              if (cacheMetrics.cacheCreationInputTokens) {
                console.log(`[Cache] ✍️  Cache WRITE: ${cacheMetrics.cacheCreationInputTokens} tokens cached`);
              }
              if (cacheMetrics.cacheReadInputTokens) {
                console.log(`[Cache] ✅ Cache READ: ${cacheMetrics.cacheReadInputTokens} tokens read from cache`);
                console.log(`[Cache] 💰 Cost savings: ~90% on cached tokens`);
              }
            }

            // Send citations data after the response is complete
            if (citations.length > 0) {
              console.log(
                '[DEBUG] Sending citations data after response:',
                citations.length,
                'citations',
              );
              writer.write({
                type: 'data-citations',
                data: {
                  type: 'citations',
                  citations: citations,
                },
              });
            }
          },

          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        // Consume the stream first, then merge into UI message stream
        result.consumeStream();
        writer.merge(result.toUIMessageStream({ sendReasoning: true }));
      },
      onFinish: async ({ messages: allMessages }) => {
        // Save only ASSISTANT messages to database (user message already saved)
        if (session.user?.id) {
          try {
            // Filter to only save assistant messages (user message was saved before stream)
            const assistantMessages = allMessages.filter(
              (msg: any) => msg.role === 'assistant',
            );

            const messagesToSave = assistantMessages.map((msg: any) => {
              let parts: Array<any>;

              // Handle parts based on message structure
              if (msg.parts && Array.isArray(msg.parts)) {
                parts = msg.parts;
              } else if (msg.content) {
                // Fallback to content if parts not available
                if (typeof msg.content === 'string') {
                  parts = [{ type: 'text', text: msg.content }];
                } else if (Array.isArray(msg.content)) {
                  parts = msg.content;
                } else {
                  parts = [{ type: 'text', text: '' }];
                }
              } else {
                parts = [{ type: 'text', text: '' }];
              }

              // Add citations to assistant messages if available
              if (citations.length > 0) {
                parts = [
                  ...parts,
                  {
                    type: 'data',
                    data: {
                      type: 'citations',
                      citations: citations,
                    },
                  },
                ];
              }

              return {
                id: msg.id,
                chatId: id,
                role: msg.role,
                parts,
                attachments: msg.attachments || [],
                createdAt: new Date(),
              };
            });

            if (messagesToSave.length > 0) {
              await saveMessages({ messages: messagesToSave });
              console.log(
                `Saved ${messagesToSave.length} assistant message(s) to database`,
              );
            }
          } catch (error) {
            console.error('Failed to save assistant messages:', error);
          }
        }
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });

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

  if (!chat || chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
