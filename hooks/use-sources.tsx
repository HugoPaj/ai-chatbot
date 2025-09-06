'use client';

import { useState, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import type { DataStreamDelta } from '@/components/data-stream-handler';

interface UseSourcesParams {
  chatId: string;
}

export function useSources({ chatId }: UseSourcesParams) {
  const [sources, setSources] = useState<Record<string, string[]>>({});
  const { data: dataStream } = useChat({ id: chatId });

  useEffect(() => {
    if (!dataStream?.length) return;

    // Process the latest data stream entries for sources
    const sourcesDeltas = dataStream.filter((delta) => {
      const typedDelta = delta as DataStreamDelta;
      return typedDelta.type === 'sources';
    }) as DataStreamDelta[];

    // Get the latest sources data
    const latestSourcesDelta = sourcesDeltas.at(-1);
    if (latestSourcesDelta) {
      try {
        const sourcesData = JSON.parse(
          latestSourcesDelta.content as string,
        ) as string[];
        // For now, we'll use a simple approach - store sources for the current chat
        // In a more sophisticated implementation, you might want to associate sources with specific messages
        setSources((prev) => ({
          ...prev,
          [chatId]: sourcesData,
        }));
      } catch (error) {
        console.error('Failed to parse sources data:', error);
      }
    }
  }, [dataStream, chatId]);

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
