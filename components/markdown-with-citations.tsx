import Link from 'next/link';
import React, { memo, useState, Children } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { CodeBlock } from './code-block';
import { InlineCitation } from './inline-citation';
import Image from 'next/image';
import type { Citation } from '@/lib/types';
import 'katex/dist/katex.min.css';

// Separate component for markdown images to properly use React hooks
const MarkdownImage = ({ node, alt, src, ...props }: any) => {
  // React hooks must be called before any early returns
  const [imageFailed, setImageFailed] = useState(false);

  if (!src) return null;

  // Check if it's an R2 URL and handle it appropriately
  const isR2Url =
    src.includes('r2.cloudflarestorage.com') || src.includes('r2.dev');
  const isDataUrl = src.startsWith('data:');

  // Create a fallback image component for failed loads
  const FallbackImage = ({
    originalSrc,
    altText,
  }: { originalSrc: string; altText?: string }) => (
    <span className="flex flex-col items-center justify-center p-8 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
      <span className="text-gray-500 mb-2 block">
        <svg
          className="size-12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </span>
      <span className="text-sm text-gray-600 text-center block">
        Image temporarily unavailable
      </span>
      <span className="text-xs text-gray-400 mt-1 break-all max-w-full block">
        {altText}
      </span>
      <button
        type="button"
        onClick={() => window.open(originalSrc, '_blank')}
        className="mt-2 text-xs text-blue-500 hover:text-blue-700 underline"
      >
        Try opening directly
      </button>
    </span>
  );

  return (
    <span className="block my-4">
      <span className="flex flex-col items-center">
        <span className="relative max-w-full border rounded-lg overflow-hidden shadow-sm block">
          {imageFailed ? (
            <FallbackImage originalSrc={src} altText={alt} />
          ) : (
            <>
              {isR2Url || isDataUrl ? (
                // For R2 URLs and data URLs, use unoptimized to avoid Next.js image optimization issues
                <Image
                  src={src}
                  alt={alt || 'Document image'}
                  width={800}
                  height={400}
                  className="max-w-full h-auto object-contain"
                  style={{ maxHeight: '400px' }}
                  unoptimized
                  onError={(e) => {
                    console.error('Image failed to load:', src);
                    setImageFailed(true);
                  }}
                />
              ) : (
                // For other URLs, use normal Next.js optimization
                <Image
                  src={src}
                  alt={alt || 'Document image'}
                  width={800}
                  height={400}
                  className="max-w-full h-auto object-contain"
                  style={{ maxHeight: '400px' }}
                  onError={(e) => {
                    console.error('Image failed to load:', src);
                    setImageFailed(true);
                  }}
                />
              )}
            </>
          )}
        </span>
        {alt && !imageFailed && (
          <span className="text-sm text-gray-600 mt-2 text-center max-w-full break-words block">
            {alt}
          </span>
        )}
      </span>
    </span>
  );
};

// Citation processor to handle inline citations
const processTextWithCitations = (
  text: string,
  citations: Citation[],
  onCitationClick?: (citation: Citation) => void,
) => {
  if (!citations.length) return text;

  // Find citation patterns like [1], [2], etc.
  const citationPattern = /\[(\d+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  match = citationPattern.exec(text);
  while (match !== null) {
    const [fullMatch, numberStr] = match;
    const citationNumber = Number.parseInt(numberStr, 10);
    const citation = citations.find((c) => c.number === citationNumber);

    // Add text before the citation
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add the citation component or fallback text
    if (citation) {
      parts.push(
        <InlineCitation
          key={`citation-${citation.id}`}
          citation={citation}
          onCitationClick={onCitationClick}
        />
      );
    } else {
      // Fallback for citations that don't exist
      parts.push(fullMatch);
    }

    lastIndex = match.index + fullMatch.length;

    // Get next match
    match = citationPattern.exec(text);
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 1 ? <>{parts}</> : text;
};

interface MarkdownWithCitationsProps {
  children: string;
  citations?: Citation[];
  onCitationClick?: (citation: Citation) => void;
}

const NonMemoizedMarkdownWithCitations = ({
  children,
  citations = [],
  onCitationClick,
}: MarkdownWithCitationsProps) => {
  const createComponents = (
    citations: Citation[],
    onCitationClick?: (citation: Citation) => void,
  ): Partial<Components> => ({
    // @ts-expect-error
    code: CodeBlock,
    pre: ({ children }) => <>{children}</>,
    ol: ({ node, children, ...props }) => {
      return (
        <ol className="list-decimal list-outside ml-4" {...props}>
          {children}
        </ol>
      );
    },
    li: ({ node, children, ...props }) => {
      // Process list item text for citations
      const processedChildren = Children.map(children, (child) => {
        if (typeof child === 'string') {
          return processTextWithCitations(child, citations, onCitationClick);
        }
        return child;
      });

      return (
        <li className="py-1" {...props}>
          {processedChildren}
        </li>
      );
    },
    ul: ({ node, children, ...props }) => {
      return (
        <ul className="list-decimal list-outside ml-4" {...props}>
          {children}
        </ul>
      );
    },
    strong: ({ node, children, ...props }) => {
      // Process strong text for citations
      const processedChildren = Children.map(children, (child) => {
        if (typeof child === 'string') {
          return processTextWithCitations(child, citations, onCitationClick);
        }
        return child;
      });

      return (
        <span className="font-semibold" {...props}>
          {processedChildren}
        </span>
      );
    },
    a: ({ node, children, ...props }) => {
      return (
        // @ts-expect-error
        <Link
          className="text-blue-500 hover:underline"
          target="_blank"
          rel="noreferrer"
          {...props}
        >
          {children}
        </Link>
      );
    },
    h1: ({ node, children, ...props }) => {
      // Process heading text for citations
      const processedChildren = Children.map(children, (child) => {
        if (typeof child === 'string') {
          return processTextWithCitations(child, citations, onCitationClick);
        }
        return child;
      });

      return (
        <h1 className="text-3xl font-semibold mt-6 mb-2" {...props}>
          {processedChildren}
        </h1>
      );
    },
    h2: ({ node, children, ...props }) => {
      // Process heading text for citations
      const processedChildren = Children.map(children, (child) => {
        if (typeof child === 'string') {
          return processTextWithCitations(child, citations, onCitationClick);
        }
        return child;
      });

      return (
        <h2 className="text-2xl font-semibold mt-6 mb-2" {...props}>
          {processedChildren}
        </h2>
      );
    },
    h3: ({ node, children, ...props }) => {
      // Process heading text for citations
      const processedChildren = Children.map(children, (child) => {
        if (typeof child === 'string') {
          return processTextWithCitations(child, citations, onCitationClick);
        }
        return child;
      });

      return (
        <h3 className="text-xl font-semibold mt-6 mb-2" {...props}>
          {processedChildren}
        </h3>
      );
    },
    h4: ({ node, children, ...props }) => {
      // Process heading text for citations
      const processedChildren = Children.map(children, (child) => {
        if (typeof child === 'string') {
          return processTextWithCitations(child, citations, onCitationClick);
        }
        return child;
      });

      return (
        <h4 className="text-lg font-semibold mt-6 mb-2" {...props}>
          {processedChildren}
        </h4>
      );
    },
    h5: ({ node, children, ...props }) => {
      // Process heading text for citations
      const processedChildren = Children.map(children, (child) => {
        if (typeof child === 'string') {
          return processTextWithCitations(child, citations, onCitationClick);
        }
        return child;
      });

      return (
        <h5 className="text-base font-semibold mt-6 mb-2" {...props}>
          {processedChildren}
        </h5>
      );
    },
    h6: ({ node, children, ...props }) => {
      // Process heading text for citations
      const processedChildren = Children.map(children, (child) => {
        if (typeof child === 'string') {
          return processTextWithCitations(child, citations, onCitationClick);
        }
        return child;
      });

      return (
        <h6 className="text-sm font-semibold mt-6 mb-2" {...props}>
          {processedChildren}
        </h6>
      );
    },
    img: (props) => <MarkdownImage {...props} />,
    table: ({ node, children, ...props }) => {
      return (
        <div className="my-4 w-full overflow-x-auto">
          <table
            className="w-full border-collapse rounded-md border border-border"
            {...props}
          >
            {children}
          </table>
        </div>
      );
    },
    thead: ({ node, children, ...props }) => {
      return (
        <thead className="bg-muted/50" {...props}>
          {children}
        </thead>
      );
    },
    tbody: ({ node, children, ...props }) => {
      return <tbody {...props}>{children}</tbody>;
    },
    tr: ({ node, children, ...props }) => {
      return (
        <tr className="m-0 border-t p-0 even:bg-muted/50" {...props}>
          {children}
        </tr>
      );
    },
    th: ({ node, children, ...props }) => {
      return (
        <th
          className="border border-border px-4 py-2 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right"
          {...props}
        >
          {children}
        </th>
      );
    },
    td: ({ node, children, ...props }) => {
      return (
        <td
          className="border border-border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right"
          {...props}
        >
          {children}
        </td>
      );
    },
    // Custom text processor for citations
    p: ({ node, children, ...props }) => {
      // Process paragraph text for citations
      const processedChildren = Children.map(children, (child) => {
        if (typeof child === 'string') {
          return processTextWithCitations(child, citations, onCitationClick);
        }
        return child;
      });

      return <p {...props}>{processedChildren}</p>;
    },
    // Also handle text nodes directly
    text: ({ node, children, ...props }) => {
      if (typeof children === 'string') {
        return processTextWithCitations(children, citations, onCitationClick);
      }
      return children;
    },
  });

  const remarkPlugins = [remarkGfm, remarkMath];
  const rehypePlugins = [rehypeKatex];

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={createComponents(citations, onCitationClick)}
    >
      {children}
    </ReactMarkdown>
  );
};

export const MarkdownWithCitations = memo(
  NonMemoizedMarkdownWithCitations,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.citations === nextProps.citations &&
    prevProps.onCitationClick === nextProps.onCitationClick,
);