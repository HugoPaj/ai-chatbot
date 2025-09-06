'use client';

import { useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  ImageIcon,
  BookOpenIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SourcesDisplayProps {
  sources: string[];
  className?: string;
}

const getFileIcon = (filename: string) => {
  const extension = filename.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'pdf':
      return <FileTextIcon className="h-4 w-4 text-red-500" />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
      return <ImageIcon className="h-4 w-4 text-blue-500" />;
    default:
      return <BookOpenIcon className="h-4 w-4 text-gray-500" />;
  }
};

const extractDisplayName = (filename: string) => {
  console.log('Original filename:', filename); // Debug log

  // Remove file extension first
  let name = filename.replace(/\.(pdf|jpg|jpeg|png|gif|doc|docx)$/i, '');

  // More aggressive approach: Look for meaningful text patterns
  // Try to find the last meaningful part that looks like a document title

  // Split by common separators and find meaningful parts
  const parts = name.split(/[-_]/);
  console.log('Split parts:', parts); // Debug log

  // Look for parts that contain words (not just hex/numbers)
  const meaningfulParts = parts.filter((part) => {
    // Skip if it's all numbers
    if (/^\d+$/.test(part)) return false;
    // Skip if it's all hex characters
    if (/^[a-f0-9]+$/i.test(part)) return false;
    // Skip if it's too short
    if (part.length < 2) return false;
    // Skip if it's a date pattern
    if (/^\d{1,2}[a-z]{2,4}$/.test(part)) return false;
    // Keep if it has letters and looks like words
    return /[a-z]/i.test(part);
  });

  console.log('Meaningful parts:', meaningfulParts); // Debug log

  if (meaningfulParts.length > 0) {
    // Take the meaningful parts and join them
    name = meaningfulParts.join(' ');
  } else {
    // Fallback: try to extract from the end of the filename (often the title)
    const lastParts = parts.slice(-3); // Take last 3 parts
    const cleanedParts = lastParts.filter(
      (part) => part.length > 1 && !/^[a-f0-9]+$/i.test(part),
    );

    if (cleanedParts.length > 0) {
      name = cleanedParts.join(' ');
    } else {
      // Last resort: just remove obvious junk from the beginning
      name = filename
        .replace(/\.(pdf|jpg|jpeg|png|gif|doc|docx)$/i, '')
        .replace(/^[a-f0-9]{4,}-?/gi, '') // Remove hex prefixes
        .replace(/^\d+-?\d*-?/g, '') // Remove number prefixes
        .trim();
    }
  }

  // Final cleanup
  name = name
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .trim();

  console.log('Final cleaned name:', name); // Debug log

  // If still empty or too short, use original without extension
  if (name.length < 3) {
    name = filename.replace(/\.(pdf|jpg|jpeg|png|gif|doc|docx)$/i, '');
  }

  // Capitalize first letter of each word
  return name.replace(/\b\w/g, (l) => l.toUpperCase());
};

export function SourcesDisplay({ sources, className }: SourcesDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0) {
    return null;
  }

  // Remove duplicates and sort alphabetically
  const uniqueSources = Array.from(new Set(sources)).sort();

  return (
    <div className={cn('mt-4', className)}>
      <Card className="border border-border/50 bg-muted/30 transition-all duration-200 hover:bg-muted/50">
        <Button
          variant="ghost"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full justify-between p-4 h-auto font-normal hover:bg-transparent"
        >
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {isExpanded ? (
                <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
              )}
              <BookOpenIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">Sources used</span>
            <Badge variant="secondary" className="ml-2 text-xs">
              {uniqueSources.length}
            </Badge>
          </div>
        </Button>

        {isExpanded && (
          <div className="px-4 pb-4 space-y-2">
            <div className="h-px bg-border/50 mb-3" />
            {uniqueSources.map((source, index) => (
              <div
                key={source}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors duration-150 group"
              >
                <div className="flex-shrink-0">{getFileIcon(source)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {extractDisplayName(source)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {source}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <Badge variant="outline" className="text-xs">
                    #{index + 1}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
