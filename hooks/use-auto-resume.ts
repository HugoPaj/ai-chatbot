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

    const mostRecentMessage = initialMessages.at(-1);

    if (mostRecentMessage?.role === 'user') {
      // Attempt to resume a previously interrupted stream
      void resumeStream();
    }

    // we intentionally run this once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
