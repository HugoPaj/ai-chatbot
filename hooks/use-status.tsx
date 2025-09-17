'use client';

import { useState, useEffect } from 'react';
import type { DataStreamDelta } from '@/components/data-stream-handler';

interface UseStatusParams {
  dataStream: any[] | undefined;
}

export function useStatus({ dataStream }: UseStatusParams) {
  const [currentStatus, setCurrentStatus] = useState<string>('');

  useEffect(() => {
    if (!dataStream?.length) return;

    console.log(
      '[useStatus] Processing dataStream:',
      dataStream.length,
      'entries',
    );

    // Process the latest data stream entries for status updates
    const statusDeltas = dataStream.filter((delta) => {
      const typedDelta = delta as DataStreamDelta;
      return typedDelta.type === 'status';
    }) as DataStreamDelta[];

    console.log('[useStatus] Found status deltas:', statusDeltas.length);

    // Get the latest status update
    const latestStatusDelta = statusDeltas.at(-1);
    if (latestStatusDelta) {
      console.log('[useStatus] Setting status:', latestStatusDelta.content);
      setCurrentStatus(latestStatusDelta.content as string);
    }
  }, [dataStream]);

  const clearStatus = () => {
    setCurrentStatus('');
  };

  return {
    currentStatus,
    clearStatus,
  };
}
