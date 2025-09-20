'use client';

import { useState, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import type { DataStreamDelta } from '@/components/data-stream-handler';

interface UseSourcesParams {
  chatId: string;
}

export function useSources({ chatId }: UseSourcesParams) {
  const [sources, setSources] = useState<Record<string, string[]>>({});
  // Note: In AI SDK v5, the 'data' property has been removed from useChat
  // This hook may need to be refactored to work with the new streaming system
  const { messages } = useChat({ id: chatId });

  useEffect(() => {
    // TODO: Implement source extraction from messages in AI SDK v5
    // The previous dataStream approach is no longer available
    // Sources might now be embedded in message parts or handled differently
    // For now, this hook is disabled until we implement the new approach
  }, [messages, chatId]);

  const getSourcesForMessage = (messageId?: string): string[] => {
    // For now, return the latest sources for the chat
    // Could be enhanced to return sources specific to a message ID
    return sources[chatId] || [];
  };

  const clearSources = () => {
    setSources((prev) => ({
      ...prev,
      [chatId]: [],
    }));
  };

  return {
    sources: sources[chatId] || [],
    getSourcesForMessage,
    clearSources,
  };
}
