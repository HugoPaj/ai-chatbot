'use client';

// import { useChat } from '@ai-sdk/react'; // Disabled for AI SDK v5 migration
import { useEffect, useRef } from 'react';
// import { artifactDefinitions, type ArtifactKind } from './artifact'; // Disabled for AI SDK v5 migration
import type { Suggestion } from '@/lib/db/schema';
// import { initialArtifactData, useArtifact } from '@/hooks/use-artifact'; // Disabled for AI SDK v5 migration

export type DataStreamDelta = {
  type:
    | 'text-delta'
    | 'code-delta'
    | 'sheet-delta'
    | 'image-delta'
    | 'latex-delta'
    | 'title'
    | 'id'
    | 'suggestion'
    | 'clear'
    | 'finish'
    | 'kind'
    | 'sources'
    | 'context';
  content: string | Suggestion;
};

export function DataStreamHandler({ id }: { id: string }) {
  // In AI SDK v5, data streaming is handled differently
  // Most data stream handling is now done in individual hooks like useSources
  // This component is kept minimal for potential future data stream handling
  // Citations are now extracted directly from message parts instead of global state
  const lastProcessedIndex = useRef(-1);

  useEffect(() => {
    // Data stream handling is now distributed to specific hooks
    // Sources are handled in useSources hook
    // Artifacts would be handled in useArtifact hook when re-enabled
    return;

    /* Original v4 code - needs migration:
    if (!dataStream?.length) return;

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
      const artifactDefinition = artifactDefinitions.find(
        (artifactDefinition) => artifactDefinition.kind === artifact.kind,
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          streamPart: delta,
          setArtifact,
          setMetadata,
        });
      }

      setArtifact((draftArtifact) => {
        if (!draftArtifact) {
          return { ...initialArtifactData, status: 'streaming' };
        }

        switch (delta.type) {
          case 'id':
            return {
              ...draftArtifact,
              documentId: delta.content as string,
              status: 'streaming',
            };

          case 'title':
            return {
              ...draftArtifact,
              title: delta.content as string,
              status: 'streaming',
            };

          case 'kind':
            return {
              ...draftArtifact,
              kind: delta.content as ArtifactKind,
              status: 'streaming',
            };

          case 'clear':
            return {
              ...draftArtifact,
              content: '',
              status: 'streaming',
            };

          case 'finish':
            return {
              ...draftArtifact,
              status: 'idle',
            };

          default:
            return draftArtifact;
        }
      });
    });
    */
  }, []); // Disabled dependencies for AI SDK v5 migration

  return null;
}
