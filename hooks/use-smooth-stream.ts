'use client';

import { useEffect, useRef, useState } from 'react';

interface UseSmoothStreamOptions {
  content: string;
  isStreaming: boolean;
  speed?: number; // characters per second
}

export function useSmoothStream({
  content,
  isStreaming,
  speed = 200, // 200 chars/second for optimal reading
}: UseSmoothStreamOptions) {
  const [displayedContent, setDisplayedContent] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const targetContentRef = useRef(content);
  const currentIndexRef = useRef(0);

  // Update target content when new content arrives
  useEffect(() => {
    targetContentRef.current = content;
  }, [content]);

  // Smooth streaming animation
  useEffect(() => {
    if (!isStreaming) {
      // If not streaming, display content immediately
      setDisplayedContent(content);
      currentIndexRef.current = content.length;
      return;
    }

    const targetLength = targetContentRef.current.length;
    const currentIndex = currentIndexRef.current;

    if (currentIndex >= targetLength) {
      return; // Already caught up
    }

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Start new smooth streaming interval
    intervalRef.current = setInterval(() => {
      const target = targetContentRef.current;
      const currentIdx = currentIndexRef.current;

      if (currentIdx >= target.length) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      // Increment index and update displayed content
      currentIndexRef.current = currentIdx + 1;
      setDisplayedContent(target.slice(0, currentIdx + 1));
    }, 1000 / speed); // Convert speed to interval

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [content, isStreaming, speed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return displayedContent;
}