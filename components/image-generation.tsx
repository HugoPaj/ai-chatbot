'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface ImageGenerationProps {
  isGenerating?: boolean;
  imageData?: string;
  prompt?: string;
  error?: string;
}

export function ImageGeneration({
  isGenerating = false,
  imageData,
  prompt,
  error,
}: ImageGenerationProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!isGenerating) return;

    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev.length >= 3) return '';
        return `${prev}.`;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isGenerating]);

  if (error) {
    return (
      <div className="border rounded-lg p-4 bg-red-50 border-red-200">
        <div className="flex items-center gap-2 text-red-700">
          <div className="size-2 bg-red-500 rounded-full" />
          <span className="font-medium">Image generation failed</span>
        </div>
        <p className="text-red-600 text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (isGenerating) {
    return (
      <motion.div
        className="border rounded-lg p-4 bg-blue-50 border-blue-200"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center gap-2 text-blue-700">
          <div className="flex gap-1">
            <motion.div
              className="size-2 bg-blue-500 rounded-full"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Number.POSITIVE_INFINITY,
                delay: 0,
              }}
            />
            <motion.div
              className="size-2 bg-blue-500 rounded-full"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Number.POSITIVE_INFINITY,
                delay: 0.2,
              }}
            />
            <motion.div
              className="size-2 bg-blue-500 rounded-full"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Number.POSITIVE_INFINITY,
                delay: 0.4,
              }}
            />
          </div>
          <span className="font-medium">Generating image{dots}</span>
        </div>
        {prompt && (
          <p className="text-blue-600 text-sm mt-2">&quot;{prompt}&quot;</p>
        )}
      </motion.div>
    );
  }

  if (imageData) {
    return (
      <motion.div
        className="border rounded-lg overflow-hidden bg-white"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        {prompt && (
          <div className="px-3 py-2 bg-gray-50 border-b">
            <p className="text-sm text-gray-600">&quot;{prompt}&quot;</p>
          </div>
        )}
        <div className="p-2">
          <Image
            src={`data:image/png;base64,${imageData}`}
            alt={prompt || 'Generated image'}
            width={512}
            height={512}
            className="w-full h-auto rounded"
            style={{ maxHeight: '512px', objectFit: 'contain' }}
          />
        </div>
      </motion.div>
    );
  }

  return null;
}

export function ImageGenerationSkeleton() {
  return (
    <div className="border rounded-lg p-4 bg-gray-50 border-gray-200 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="size-2 bg-gray-300 rounded-full" />
        <div className="h-4 bg-gray-300 rounded w-32" />
      </div>
      <div className="w-full h-64 bg-gray-200 rounded" />
    </div>
  );
}
