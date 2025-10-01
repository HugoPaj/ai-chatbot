'use client';

import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileTextIcon, ImageIcon, BookOpenIcon } from 'lucide-react';
import type { Citation } from '@/lib/types';
import { cn } from '@/lib/utils';

interface InlineCitationProps {
  citation: Citation;
  onCitationClick?: (citation: Citation) => void;
  className?: string;
}

const getFileIcon = (filename: string) => {
  const extension = filename.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'pdf':
      return <FileTextIcon className="size-3 text-red-500" />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
      return <ImageIcon className="size-3 text-blue-500" />;
    default:
      return <BookOpenIcon className="size-3 text-gray-500" />;
  }
};

const truncateText = (text: string, maxLength = 120) => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
};

export function InlineCitation({ citation, onCitationClick, className }: InlineCitationProps) {
  const [isClicked, setIsClicked] = useState(false);

  // Get the most relevant chunk (highest score)
  const primaryChunk = citation.chunks[0];

  const handleClick = () => {
    setIsClicked(true);
    setTimeout(() => setIsClicked(false), 200); // Quick flash effect
    onCitationClick?.(citation);

    // Open PDF if available
    if (primaryChunk.pdfUrl) {
      window.open(primaryChunk.pdfUrl, '_blank');
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          className={cn(
            'inline-flex items-center justify-center',
            'h-5 min-w-5 px-1 mx-0.5',
            'text-xs font-medium',
            'bg-blue-100 hover:bg-blue-200 text-blue-700',
            'dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300',
            'border border-blue-300 dark:border-blue-700',
            'rounded-full transition-all duration-150',
            'cursor-pointer hover:scale-105',
            {
              'bg-blue-300 dark:bg-blue-700 scale-110': isClicked,
            },
            className
          )}
          data-citation-id={citation.id}
        >
          {citation.number}
        </button>
      </TooltipTrigger>
      <TooltipContent
        className="max-w-sm p-0 border-0"
        side="top"
        align="center"
      >
        <Card className="border border-border bg-background/95 backdrop-blur-sm shadow-lg">
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              {getFileIcon(primaryChunk.filename)}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {primaryChunk.filename}
                </p>
                {primaryChunk.page && (
                  <p className="text-xs text-muted-foreground">
                    Page {primaryChunk.page}
                  </p>
                )}
              </div>
              <Badge variant="outline" className="text-xs">
                #{citation.number}
              </Badge>
            </div>

            <div className="text-xs text-muted-foreground border-l-2 border-border pl-2">
              &ldquo;{truncateText(citation.sourceText)}&rdquo;
            </div>

            {citation.chunks.length > 1 && (
              <p className="text-xs text-muted-foreground mt-2">
                +{citation.chunks.length - 1} more source{citation.chunks.length > 2 ? 's' : ''}
              </p>
            )}

            {primaryChunk.pdfUrl ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(primaryChunk.pdfUrl, '_blank');
                }}
                className="w-full mt-2 px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors border border-blue-200 dark:border-blue-800"
              >
                Click to view full source →
              </button>
            ) : (
              <p className="text-xs text-muted-foreground/70 mt-2 italic">
                Re-upload document to enable PDF links
              </p>
            )}
          </div>
        </Card>
      </TooltipContent>
    </Tooltip>
  );
}