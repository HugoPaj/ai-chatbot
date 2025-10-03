'use client';

import { useEffect, useRef } from 'react';
import type { UIMessage } from 'ai';

export interface UseAutoResumeParams {
  autoResume: boolean;
  initialMessages: UIMessage[];
  resumeStream: () => Promise<void> | void;
  setMessages: (
    messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[]),
  ) => void;
}

export function useAutoResume({
  autoResume,
  initialMessages,
  resumeStream,
  setMessages,
}: UseAutoResumeParams) {
  const hasResumed = useRef(false);

  useEffect(() => {
    // Only resume once per chat session
    if (!autoResume || hasResumed.current) return;

    // Wait for messages to be properly loaded
    if (!initialMessages || initialMessages.length === 0) {
      return;
    }

    // Resume stream after messages are loaded
    hasResumed.current = true;
    const timeoutId = setTimeout(() => {
      void resumeStream();
    }, 100);

    return () => clearTimeout(timeoutId);
    // Only run when autoResume flag changes (once per load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResume]);
}
