'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CheckIcon, Loader2 } from 'lucide-react';

interface ToolCallIndicatorProps {
  toolName: string;
  args?: any;
  className?: string;
  isCompleted?: boolean;
}

const getToolDisplayName = (toolName: string, isCompleted = false): string => {
  if (isCompleted) {
    switch (toolName) {
      case 'getWeather':
        return 'Weather information retrieved';
      case 'createDocument':
        return 'Document created';
      case 'updateDocument':
        return 'Document updated';
      case 'generateImage':
        return 'Image generated';
      case 'requestSuggestions':
        return 'Suggestions provided';
      default:
        return `${toolName} completed`;
    }
  }

  switch (toolName) {
    case 'getWeather':
      return 'Getting weather information';
    case 'createDocument':
      return 'Creating document';
    case 'updateDocument':
      return 'Updating document';
    case 'generateImage':
      return 'Generating image';
    case 'requestSuggestions':
      return 'Getting suggestions';
    default:
      return `Using ${toolName}`;
  }
};

const getToolDescription = (toolName: string, args?: any): string => {
  switch (toolName) {
    case 'getWeather':
      if (args?.latitude && args?.longitude) {
        return `for coordinates ${args.latitude}, ${args.longitude}`;
      }
      return 'for your location';
    case 'createDocument':
      if (args?.title) {
        return `"${args.title}"`;
      }
      return '';
    case 'updateDocument':
      return 'with your changes';
    case 'generateImage':
      if (args?.prompt) {
        return `"${args.prompt.substring(0, 50)}${args.prompt.length > 50 ? '...' : ''}"`;
      }
      return '';
    case 'requestSuggestions':
      return 'for improvements';
    default:
      return '';
  }
};

export function ToolCallIndicator({
  toolName,
  args,
  className,
  isCompleted = false,
}: ToolCallIndicatorProps) {
  const displayName = getToolDisplayName(toolName, isCompleted);
  const description = getToolDescription(toolName, args);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'border rounded-lg p-4 bg-muted/30 border-border',
        isCompleted && 'bg-accent/50 border-accent/20',
        className,
      )}
    >
      <div className="flex items-center gap-3 text-muted-foreground">
        {isCompleted ? (
          <div className="text-emerald-600 dark:text-emerald-400">
            <CheckIcon size={14} />
          </div>
        ) : (
          <div className="text-primary">
            <Loader2 size={16} className="animate-spin" />
          </div>
        )}

        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-medium text-sm">{displayName}</span>
          {description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
