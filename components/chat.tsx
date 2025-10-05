'use client';

import type { UIMessage } from 'ai';
import type { Attachment } from '@/lib/types';
import { useChat } from '@ai-sdk/react';
import { useCallback, useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, fetchWithErrorHandlers, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { toast } from './toast';
import type { Session } from 'next-auth';
import { useSearchParams } from 'next/navigation';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { useAutoResume } from '@/hooks/use-auto-resume';
import {
  useSources,
  setGlobalSources,
  setGlobalCitations,
} from '@/hooks/use-sources';
import { ChatSDKError } from '@/lib/errors';
import { usePerformanceMonitor } from '@/lib/performance-monitor';

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  session,
  autoResume,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session;
  autoResume: boolean;
}) {
  const { mutate } = useSWRConfig();

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { startRequest, recordFirstToken, recordStreamComplete, logMetrics } =
    usePerformanceMonitor();

  const { handleSourceData } = useSources({ chatId: id });

  // Custom fetch function to intercept sources
  const customFetch = async (url: string, options: any) => {
    const response = await fetchWithErrorHandlers(url, options);

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const readableStream = new ReadableStream({
        start(controller) {
          function pump(): any {
            return reader.read().then(({ done, value }) => {
              if (done) {
                controller.close();
                return;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              // Look for sources data in the stream
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'data-sources' && data.data?.sources) {
                      setGlobalSources(id, data.data.sources);
                    }
                    if (
                      data.type === 'data-citations' &&
                      data.data?.citations
                    ) {
                      setGlobalCitations(id, data.data.citations);
                    }
                  } catch (e) {
                    // Ignore parsing errors
                  }
                }
              }

              controller.enqueue(value);
              return pump();
            });
          }
          return pump();
        },
      });

      return new Response(readableStream, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    }

    return response;
  };

  const { messages, setMessages, status, stop, sendMessage, regenerate } =
    useChat({
      id,
      messages: initialMessages, // Load initial messages from database
      experimental_throttle: 16, // No throttling for fastest streaming
      generateId: generateUUID,
      // Dynamically import to avoid ESM type issues
      transport: new (require('ai').DefaultChatTransport)({
        api: '/api/chat',
        fetch: customFetch,
        prepareSendMessagesRequest: ({
          id: chatId,
          messages: msgs,
        }: { id: string; messages: UIMessage[] }) => ({
          api: '/api/chat',
          body: {
            id: chatId,
            message: msgs.at(-1),
            selectedChatModel: initialChatModel,
            selectedVisibilityType: visibilityType,
          },
        }),
      }),
      onData: (dataPart) => {
        handleSourceData(dataPart);
      },
      onFinish: () => {
        recordStreamComplete(id);
        logMetrics(id);
        setTimeout(() => {
          mutate(unstable_serialize(getChatHistoryPaginationKey));
        }, 0);
      },
      onError: (error) => {
        if (error instanceof ChatSDKError) {
          toast({ type: 'error', description: error.message });
        }
      },
    });

  const [input, setInput] = useState('');
  const append = useCallback(
    (m: { role: 'user'; content: string }, attachments?: Array<Attachment>) => {
      setInput('');

      const parts: Array<any> = [];

      // Add file parts first (if any)
      if (attachments && attachments.length > 0) {
        parts.push(
          ...attachments.map((att) => ({
            type: 'file',
            url: att.url,
            name: att.name,
            mediaType: att.contentType,
          })),
        );
      }

      // Add text part
      parts.push({
        type: 'text',
        text: m.content,
      });

      void sendMessage({
        role: 'user' as const,
        parts,
      });
    },
    [sendMessage],
  );
  const handleSubmit = (params?: { attachments?: Array<Attachment> }) => {
    if (!input.trim()) return;
    append({ role: 'user', content: input }, params?.attachments);
  };

  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      append({
        role: 'user',
        content: query,
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, '', `/chat/${id}`);
    }
  }, [query, append, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useAutoResume({
    autoResume,
    initialMessages: messages, // Use current messages state instead of initialMessages
    resumeStream: () => regenerate(),
    setMessages,
  });

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedModelId={initialChatModel}
          selectedVisibilityType={initialVisibilityType}
          isReadonly={isReadonly}
          session={session}
        />

        <Messages
          chatId={id}
          status={status}
          votes={votes}
          messages={messages}
          initialMessages={initialMessages}
          setMessages={setMessages}
          reload={() => regenerate()}
          isReadonly={isReadonly}
          isArtifactVisible={isArtifactVisible}
        />

        <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              status={status}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              initialMessages={initialMessages}
              setMessages={setMessages}
              append={append}
              onSubmit={handleSubmit}
              selectedVisibilityType={visibilityType}
            />
          )}
        </form>
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        status={status}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={() => regenerate()}
        votes={votes}
        isReadonly={isReadonly}
        selectedVisibilityType={visibilityType}
      />
    </>
  );
}
