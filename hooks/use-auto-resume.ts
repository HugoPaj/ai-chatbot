'use client';

import { useEffect } from 'react';
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
  useEffect(() => {
    if (!autoResume) return;

    // Wait for messages to be properly loaded
    if (!initialMessages || initialMessages.length === 0) {
      return;
    }

    const mostRecentMessage = initialMessages.at(-1);

    if (mostRecentMessage?.role === 'user') {
      // Add a small delay to ensure the messages state is fully initialized
      const timeoutId = setTimeout(() => {
        void resumeStream();
      }, 100);

      return () => clearTimeout(timeoutId);
    }

    // we intentionally run this once per message array change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResume, initialMessages.length]);
}
