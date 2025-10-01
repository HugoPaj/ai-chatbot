'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Citation } from '@/lib/types';

interface UseSourcesParams {
  chatId: string;
}

// Global storage for sources and citations per chat
const globalSources: Record<string, string[]> = {};
const globalCitations: Record<string, Citation[]> = {};

// Function to set sources globally (called from API or other places)
export function setGlobalSources(chatId: string, sources: string[]) {
  globalSources[chatId] = sources;
  // Trigger a custom event to notify hooks
  window.dispatchEvent(
    new CustomEvent('sourcesUpdated', { detail: { chatId, sources } }),
  );
}

// Function to set citations globally
export function setGlobalCitations(chatId: string, citations: Citation[]) {
  globalCitations[chatId] = citations;
  // Trigger a custom event to notify hooks
  window.dispatchEvent(
    new CustomEvent('citationsUpdated', { detail: { chatId, citations } }),
  );
}

export function useSources({ chatId }: UseSourcesParams) {
  const [sources, setSources] = useState<string[]>(
    () => globalSources[chatId] || [],
  );
  const [citations, setCitations] = useState<Citation[]>(
    () => globalCitations[chatId] || [],
  );

  useEffect(() => {
    const handleSourcesUpdate = (event: CustomEvent) => {
      if (event.detail.chatId === chatId) {
        setSources(event.detail.sources);
      }
    };

    const handleCitationsUpdate = (event: CustomEvent) => {
      if (event.detail.chatId === chatId) {
        setCitations(event.detail.citations);
      }
    };

    window.addEventListener(
      'sourcesUpdated',
      handleSourcesUpdate as EventListener,
    );
    window.addEventListener(
      'citationsUpdated',
      handleCitationsUpdate as EventListener,
    );

    // Also check for any existing sources and citations
    if (globalSources[chatId]) {
      setSources(globalSources[chatId]);
    }
    if (globalCitations[chatId]) {
      setCitations(globalCitations[chatId]);
    }

    return () => {
      window.removeEventListener(
        'sourcesUpdated',
        handleSourcesUpdate as EventListener,
      );
      window.removeEventListener(
        'citationsUpdated',
        handleCitationsUpdate as EventListener,
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

      // Handle citations data from AI SDK v5 streaming
      if (
        dataPart?.type === 'data-citations' &&
        dataPart?.data?.type === 'citations' &&
        Array.isArray(dataPart.data.citations)
      ) {
        setGlobalCitations(chatId, dataPart.data.citations);
      }
    },
    [chatId],
  );

  const getSourcesForMessage = (messageId?: string): string[] => {
    return sources;
  };

  const getCitationsForMessage = (messageId?: string): Citation[] => {
    return citations;
  };

  const clearSources = () => {
    setGlobalSources(chatId, []);
  };

  const clearCitations = () => {
    setGlobalCitations(chatId, []);
  };

  const clearAll = () => {
    clearSources();
    clearCitations();
  };

  return {
    sources,
    citations,
    getSourcesForMessage,
    getCitationsForMessage,
    clearSources,
    clearCitations,
    clearAll,
    handleSourceData,
  };
}
