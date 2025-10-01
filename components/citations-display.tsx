'use client';

import { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  ImageIcon,
  BookOpenIcon,
  ExternalLinkIcon,
  MapPinIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { Citation } from '@/lib/types';

interface CitationsDisplayProps {
  citations: Citation[];
  highlightedCitationId?: string;
  className?: string;
}

const getFileIcon = (filename: string) => {
  const extension = filename.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'pdf':
      return <FileTextIcon className="size-4 text-red-500" />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
      return <ImageIcon className="size-4 text-blue-500" />;
    default:
      return <BookOpenIcon className="size-4 text-gray-500" />;
  }
};

const extractDisplayName = (filename: string) => {
  let name = filename.replace(/\.(pdf|jpg|jpeg|png|gif|doc|docx)$/i, '');
  const parts = name.split(/[-_]/);
  const meaningfulParts = parts.filter((part) => {
    if (/^\d+$/.test(part)) return false;
    if (/^[a-f0-9]+$/i.test(part)) return false;
    if (part.length < 2) return false;
    return /[a-z]/i.test(part);
  });

  if (meaningfulParts.length > 0) {
    name = meaningfulParts.join(' ');
  } else {
    name = filename.replace(/\.(pdf|jpg|jpeg|png|gif|doc|docx)$/i, '');
  }

  name = name.replace(/\s+/g, ' ').trim();
  if (name.length < 3) {
    name = filename.replace(/\.(pdf|jpg|jpeg|png|gif|doc|docx)$/i, '');
  }

  return name.replace(/\b\w/g, (l) => l.toUpperCase());
};

interface CitationItemProps {
  citation: Citation;
  isHighlighted?: boolean;
}

function CitationItem({ citation, isHighlighted }: CitationItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const primaryChunk = citation.chunks[0];

  // Get unique pages from all chunks
  const uniquePages = Array.from(
    new Set(citation.chunks.map((c) => c.page).filter(Boolean))
  ).sort((a, b) => (a ?? 0) - (b ?? 0)) as number[];
  const pageDisplay = uniquePages.length > 0
    ? uniquePages.length === 1
      ? `p.${uniquePages[0]}`
      : uniquePages.length === 2
        ? `p.${uniquePages[0]}, ${uniquePages[1]}`
        : `p.${uniquePages[0]}-${uniquePages[uniquePages.length - 1]}`
    : null;

  // Handler to open PDF in new tab
  const handleOpenPDF = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent expanding/collapsing
    if (primaryChunk.pdfUrl) {
      window.open(primaryChunk.pdfUrl, '_blank');
    }
  };

  return (
    <div
      className={cn(
        'border border-border/50 rounded-lg transition-all duration-200',
        {
          'border-blue-400 bg-blue-50/50 dark:border-blue-600 dark:bg-blue-950/30': isHighlighted,
          'hover:border-border': !isHighlighted,
        }
      )}
    >
      <Button
        variant="ghost"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-between p-4 h-auto font-normal hover:bg-transparent"
      >
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="shrink-0">
            {citation.number}
          </Badge>
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={handleOpenPDF}
              disabled={!primaryChunk.pdfUrl}
              className={cn(
                "flex-shrink-0",
                primaryChunk.pdfUrl &&
                  'cursor-pointer hover:opacity-70 transition-opacity'
              )}
              title={primaryChunk.pdfUrl ? 'Open PDF' : 'PDF not available'}
            >
              {getFileIcon(primaryChunk.filename)}
            </button>
            <div className="text-left min-w-0">
              <button
                type="button"
                onClick={handleOpenPDF}
                disabled={!primaryChunk.pdfUrl}
                className={cn(
                  'text-left w-full',
                  primaryChunk.pdfUrl && 'cursor-pointer hover:underline'
                )}
                title={primaryChunk.pdfUrl ? 'Open PDF' : undefined}
              >
                <p className="text-sm font-medium text-foreground truncate">
                  {extractDisplayName(primaryChunk.filename)}
                </p>
              </button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {pageDisplay && (
                  <>
                    <span>{pageDisplay}</span>
                    {primaryChunk.section && <span>•</span>}
                  </>
                )}
                {primaryChunk.section && <span>{primaryChunk.section}</span>}
                {citation.chunks.length > 1 && (
                  <>
                    <span>•</span>
                    <span>{citation.chunks.length} chunks</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {Math.round(primaryChunk.score * 100)}%
          </Badge>
          {isExpanded ? (
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          )}
        </div>
      </Button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          <Separator />

          {/* Primary source text */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Source Quote
            </p>
            <blockquote className="text-sm text-foreground border-l-3 border-border pl-3 py-2 bg-muted/30 rounded-r">
              &ldquo;{citation.sourceText}&rdquo;
            </blockquote>
          </div>

          {/* Additional chunks if any */}
          {citation.chunks.length > 1 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Related Sources ({citation.chunks.length - 1})
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {citation.chunks.slice(1).map((chunk, index) => (
                  <div key={chunk.id} className="text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      {getFileIcon(chunk.filename)}
                      <span className="font-medium">{extractDisplayName(chunk.filename)}</span>
                      {chunk.page && (
                        <Badge variant="outline" className="text-xs">
                          p.{chunk.page}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {Math.round(chunk.score * 100)}%
                      </Badge>
                    </div>
                    <p className="text-muted-foreground ml-6 italic">
                      &ldquo;{chunk.content.slice(0, 100)}...&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/50">
            <div className="flex items-center gap-1">
              <MapPinIcon className="size-3" />
              <span>{primaryChunk.filename}</span>
            </div>
            {primaryChunk.coordinates && (
              <div className="flex items-center gap-1">
                <span>Position: {Math.round(primaryChunk.coordinates.x)}, {Math.round(primaryChunk.coordinates.y)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CitationsDisplay({ citations, highlightedCitationId, className }: CitationsDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div className={cn('mt-4', className)}>
      <Card className="border border-border/50 bg-muted/30">
        <Button
          variant="ghost"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full justify-between p-4 h-auto font-normal hover:bg-transparent"
        >
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {isExpanded ? (
                <ChevronDownIcon className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              )}
              <ExternalLinkIcon className="size-4 text-muted-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">Citations</span>
            <Badge variant="secondary" className="ml-2 text-xs">
              {citations.length}
            </Badge>
          </div>
        </Button>

        {isExpanded && (
          <div className="px-4 pb-4 space-y-3">
            <Separator />
            {citations.map((citation) => (
              <CitationItem
                key={citation.id}
                citation={citation}
                isHighlighted={citation.id === highlightedCitationId}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}