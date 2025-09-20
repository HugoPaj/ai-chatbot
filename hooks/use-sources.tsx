'use client';

import { useState, useCallback, useEffect } from 'react';

interface UseSourcesParams {
  chatId: string;
}

// Global storage for sources per chat
const globalSources: Record<string, string[]> = {};

// Function to set sources globally (called from API or other places)
export function setGlobalSources(chatId: string, sources: string[]) {
  globalSources[chatId] = sources;
  // Trigger a custom event to notify hooks
  window.dispatchEvent(
    new CustomEvent('sourcesUpdated', { detail: { chatId, sources } }),
  );
}

export function useSources({ chatId }: UseSourcesParams) {
  const [sources, setSources] = useState<string[]>(
    () => globalSources[chatId] || [],
  );

  useEffect(() => {
    const handleSourcesUpdate = (event: CustomEvent) => {
      if (event.detail.chatId === chatId) {
        setSources(event.detail.sources);
      }
    };

    window.addEventListener(
      'sourcesUpdated',
      handleSourcesUpdate as EventListener,
    );

    // Also check for any existing sources
    if (globalSources[chatId]) {
      setSources(globalSources[chatId]);
    }

    return () => {
      window.removeEventListener(
        'sourcesUpdated',
        handleSourcesUpdate as EventListener,
      );
    };
  }, [chatId]);

  const handleSourceData = useCallback(
    (dataPart: any) => {
      // Handle sources data from AI SDK v5 streaming
      if (
        dataPart?.type === 'data-sources' &&
        dataPart?.data?.type === 'sources' &&
        Array.isArray(dataPart.data.sources)
      ) {
        setGlobalSources(chatId, dataPart.data.sources);
      }
    },
    [chatId],
  );

  const getSourcesForMessage = (messageId?: string): string[] => {
    return sources;
  };

  const clearSources = () => {
    setGlobalSources(chatId, []);
  };

  return {
    sources,
    getSourcesForMessage,
    clearSources,
    handleSourceData,
  };
}
