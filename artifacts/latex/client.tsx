import { Artifact } from '@/components/create-artifact';
import { CodeEditor } from '@/components/code-editor';
import {
  CopyIcon,
  DownloadIcon,
  RedoIcon,
  UndoIcon,
  FileIcon,
} from '@/components/icons';
import { toast } from 'sonner';

interface Metadata {
  isCompiling: boolean;
  pdfUrl: string | null;
}

export const latexArtifact = new Artifact<'latex', Metadata>({
  kind: 'latex',
  description:
    'Useful for creating LaTeX documents like academic papers, reports, and presentations.',
  initialize: async ({ setMetadata }) => {
    setMetadata({
      isCompiling: false,
      pdfUrl: null,
    });
  },
  onStreamPart: ({ streamPart, setArtifact }) => {
    if (streamPart.type === 'latex-delta') {
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        content: streamPart.content as string,
        isVisible:
          draftArtifact.status === 'streaming' &&
          draftArtifact.content.length > 300 &&
          draftArtifact.content.length < 310
            ? true
            : draftArtifact.isVisible,
        status: 'streaming',
      }));
    }
  },
  content: ({ content, status, isCurrentVersion, onSaveContent }) => {
    return (
      <CodeEditor
        content={content}
        status={status}
        isCurrentVersion={isCurrentVersion}
        onSaveContent={onSaveContent}
        mode="edit"
        currentVersionIndex={0}
        getDocumentContentById={() => content}
        isLoading={false}
      />
    );
  },
  actions: [
    {
      icon: <DownloadIcon size={18} />,
      label: 'PDF',
      description: 'Compile and download PDF',
      onClick: async ({ content, setMetadata }) => {
        setMetadata((metadata) => ({
          ...metadata,
          isCompiling: true,
        }));

        try {
          const response = await fetch('/api/compile-latex', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ latex: content }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to compile LaTeX');
          }

          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);

          // Create a temporary link and click it to download
          const a = document.createElement('a');
          a.href = url;
          a.download = 'document.pdf';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

          setMetadata((metadata) => ({
            ...metadata,
            isCompiling: false,
            pdfUrl: url,
          }));

          toast.success('PDF downloaded successfully!');
        } catch (error: any) {
          setMetadata((metadata) => ({
            ...metadata,
            isCompiling: false,
          }));
          toast.error(error.message || 'Failed to compile LaTeX');
        }
      },
    },
    {
      icon: <UndoIcon size={18} />,
      description: 'View Previous version',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('prev');
      },
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <RedoIcon size={18} />,
      description: 'View Next version',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('next');
      },
      isDisabled: ({ isCurrentVersion }) => {
        if (isCurrentVersion) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <CopyIcon size={18} />,
      description: 'Copy LaTeX to clipboard',
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success('Copied to clipboard!');
      },
    },
  ],
  toolbar: [
    {
      icon: <FileIcon />,
      description: 'Add bibliography',
      onClick: ({ appendMessage }) => {
        appendMessage({
          role: 'user',
          content: 'Add a bibliography section to this LaTeX document',
        });
      },
    },
  ],
});
