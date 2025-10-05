'use client';

import type { UIMessage } from 'ai';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useState } from 'react';
import type { Vote } from '@/lib/db/schema';
import type { Citation } from '@/lib/types';
import { DocumentToolCall, DocumentToolResult } from './document';
import { PencilEditIcon, SparklesIcon } from './icons';
import { Markdown } from './markdown';
import { MarkdownWithCitations } from './markdown-with-citations';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import { Weather } from './weather';
import equal from 'fast-deep-equal';
import { cn, sanitizeText } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from './message-editor';
import { DocumentPreview } from './document-preview';
import { MessageReasoning } from './message-reasoning';
import { SourcesDisplay } from './sources-display';
import { CitationsDisplay } from './citations-display';
import { useSources } from '@/hooks/use-sources';
import { ImageGeneration } from './image-generation';
import { ToolCallIndicator } from './tool-call-indicator';

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  reload,
  isReadonly,
  requiresScrollPadding,
}: {
  chatId: string;
  message: UIMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: (
    messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[]),
  ) => void;
  reload: () => void;
  isReadonly: boolean;
  requiresScrollPadding: boolean;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [highlightedCitationId, setHighlightedCitationId] = useState<
    string | undefined
  >();
  const { sources, citations } = useSources({ chatId });

  const handleCitationClick = (citation: Citation) => {
    setHighlightedCitationId(citation.id);
    // Clear highlight after 3 seconds
    setTimeout(() => setHighlightedCitationId(undefined), 3000);
  };

  const attachmentsFromMessage =
    message.parts?.filter((part: any) => part.type === 'file') || [];

  return (
    <AnimatePresence>
      <motion.div
        data-testid={`message-${message.role}`}
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
            {
              'w-full': mode === 'edit',
              'group-data-[role=user]/message:w-fit': mode !== 'edit',
            },
          )}
        >
          {message.role === 'assistant' && (
            <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <SparklesIcon size={14} />
              </div>
            </div>
          )}

          <div
            className={cn('flex flex-col gap-4 w-full', {
              'min-h-96': message.role === 'assistant' && requiresScrollPadding,
            })}
          >
            {attachmentsFromMessage.length > 0 && (
              <div
                data-testid={`message-attachments`}
                className="flex flex-row justify-end gap-2"
              >
                {attachmentsFromMessage.map((attachment: any) => (
                  <PreviewAttachment
                    key={attachment.url}
                    attachment={{
                      url: attachment.url,
                      name: attachment.name || 'file',
                      contentType: attachment.mediaType,
                    }}
                  />
                ))}
              </div>
            )}

            {message.parts?.map((part, index) => {
              const { type } = part;
              const key = `message-${message.id}-part-${index}`;

              if (
                type === 'reasoning' &&
                (part as any).text?.trim().length > 0
              ) {
                return (
                  <MessageReasoning
                    key={key}
                    isLoading={isLoading}
                    reasoning={(part as any).text}
                  />
                );
              }

              if (type === 'text') {
                if (mode === 'view') {
                  return (
                    <div key={key} className="flex flex-row gap-2 items-start">
                      {message.role === 'user' && !isReadonly && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              data-testid="message-edit-button"
                              variant="ghost"
                              className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                              onClick={() => {
                                setMode('edit');
                              }}
                            >
                              <PencilEditIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit message</TooltipContent>
                        </Tooltip>
                      )}

                      <div
                        data-testid="message-content"
                        className={cn('flex flex-col gap-4', {
                          'bg-primary text-primary-foreground px-3 py-2 rounded-xl':
                            message.role === 'user',
                        })}
                      >
                        {message.role === 'assistant' &&
                        citations.length > 0 ? (
                          <MarkdownWithCitations
                            citations={citations}
                            onCitationClick={handleCitationClick}
                          >
                            {sanitizeText(part.text)}
                          </MarkdownWithCitations>
                        ) : (
                          <Markdown>{sanitizeText(part.text)}</Markdown>
                        )}
                      </div>
                    </div>
                  );
                }

                if (mode === 'edit') {
                  return (
                    <div key={key} className="flex flex-row gap-2 items-start">
                      <div className="size-8" />

                      <MessageEditor
                        key={message.id}
                        message={message}
                        setMode={setMode}
                        setMessages={setMessages}
                        reload={reload}
                      />
                    </div>
                  );
                }
              }

              if (type.startsWith('tool-') || type === 'tool-call') {
                const partWithToolData = part as any;
                const toolName =
                  type === 'tool-call'
                    ? partWithToolData.toolName || 'unknown'
                    : type.replace('tool-', ''); // Extract tool name from type
                const { toolCallId, state } = partWithToolData;

                if (
                  state === 'call' ||
                  state === 'partial-call' ||
                  state === 'input-available' ||
                  state === 'executing'
                ) {
                  const { args } = partWithToolData;

                  return (
                    <div
                      key={toolCallId}
                      className={cx({
                        skeleton: ['getWeather', 'generateImage'].includes(
                          toolName,
                        ),
                      })}
                    >
                      {toolName === 'getWeather' ? (
                        <>
                          <ToolCallIndicator toolName={toolName} args={args} />
                          <Weather />
                        </>
                      ) : toolName === 'createDocument' ? (
                        <DocumentPreview isReadonly={isReadonly} args={args} />
                      ) : toolName === 'updateDocument' ? (
                        <>
                          <ToolCallIndicator toolName={toolName} args={args} />
                          <DocumentToolCall
                            type="update"
                            args={args}
                            isReadonly={isReadonly}
                          />
                        </>
                      ) : toolName === 'requestSuggestions' ? (
                        <>
                          <ToolCallIndicator toolName={toolName} args={args} />
                          <DocumentToolCall
                            type="request-suggestions"
                            args={args}
                            isReadonly={isReadonly}
                          />
                        </>
                      ) : toolName === 'generateImage' ? (
                        <>
                          <ToolCallIndicator toolName={toolName} args={args} />
                          <ImageGeneration
                            isGenerating={true}
                            prompt={args?.prompt}
                          />
                        </>
                      ) : (
                        <ToolCallIndicator toolName={toolName} args={args} />
                      )}
                    </div>
                  );
                }

                if (state === 'result' || state === 'output-available') {
                  const { result, output } = partWithToolData;
                  const toolResult = result || output;

                  return (
                    <div key={toolCallId}>
                      {/* Show completed tool indicator for better UX */}
                      <ToolCallIndicator
                        toolName={toolName}
                        args={partWithToolData.args || result || output}
                        isCompleted={true}
                        className="mb-3"
                      />

                      {toolName === 'getWeather' ? (
                        <Weather weatherAtLocation={toolResult} />
                      ) : toolName === 'createDocument' ? (
                        <DocumentPreview
                          isReadonly={isReadonly}
                          result={toolResult}
                        />
                      ) : toolName === 'updateDocument' ? (
                        <DocumentToolResult
                          type="update"
                          result={toolResult}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'requestSuggestions' ? (
                        <DocumentToolResult
                          type="request-suggestions"
                          result={toolResult}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'generateImage' ? (
                        <ImageGeneration
                          isGenerating={false}
                          imageData={toolResult?.imageData}
                          prompt={toolResult?.prompt}
                          error={toolResult?.error}
                        />
                      ) : toolName === 'calculate' ? (
                        // Don't show raw output for calculate - let AI interpret the result
                        null
                      ) : (
                        <pre>{JSON.stringify(toolResult, null, 2)}</pre>
                      )}
                    </div>
                  );
                }
              }
            })}

            {message.role === 'assistant' && !isLoading && (
              <>
                {citations.length > 0 && (
                  <CitationsDisplay
                    citations={citations}
                    highlightedCitationId={highlightedCitationId}
                  />
                )}
                {sources.length > 0 && citations.length === 0 && (
                  <SourcesDisplay sources={sources} />
                )}
              </>
            )}

            {!isReadonly && (
              <MessageActions
                key={`action-${message.id}`}
                chatId={chatId}
                message={message}
                vote={vote}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.requiresScrollPadding !== nextProps.requiresScrollPadding)
      return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;
    if (!equal(prevProps.vote, nextProps.vote)) return false;

    return true;
  },
);

export const ThinkingMessage = () => {
  const role = 'assistant';

  return (
    <motion.div
      data-testid="message-assistant-loading"
      className="w-full mx-auto max-w-3xl px-4 group/message min-h-96"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cx(
          'flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl',
          {
            'group-data-[role=user]/message:bg-muted': true,
          },
        )}
      >
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-4 text-muted-foreground">
            Hmm...
          </div>
        </div>
      </div>
    </motion.div>
  );
};
