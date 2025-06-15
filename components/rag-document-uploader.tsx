import { useState } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/toast';

export function RagDocumentUploader() {
  const [isUploading, setIsUploading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    const supportedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!supportedTypes.includes(file.type)) {
      toast({
        type: 'error',
        description: 'Unsupported file type. Please upload PDF, JPEG, or PNG files only.'
      });
      return;
    }

    // Check file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast({
        type: 'error',
        description: 'File too large. Maximum file size is 10MB.'
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/rag-documents', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload document');
      }

      const result = await response.json();
      
      toast({
        type: 'success',
        description: `Document uploaded: ${file.name} was successfully processed with ${result.chunks} chunks.`
      });
    } catch (error) {
      console.error('Error uploading document:', error);
      toast({
        type: 'error',
        description: error instanceof Error ? error.message : 'Failed to upload document'
      });
    } finally {
      setIsUploading(false);
      // Reset the file input
      event.target.value = '';
    }
  };

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Document Knowledge Base</h3>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7" 
          onClick={() => setShowInfo(!showInfo)}
          title="About Document Knowledge Base"
        >
          <AlertCircle className="h-4 w-4" />
        </Button>
      </div>
      
      {showInfo && (
        <div className="mb-3 text-xs text-muted-foreground p-2 bg-muted rounded-md">
          <p>Upload engineering documents (PDF, JPEG, PNG) to enhance the AI&apos;s knowledge. The AI will reference these documents when answering your questions.</p>
          <p className="mt-1">Maximum file size: 10MB</p>
        </div>
      )}
      
      <div className="relative">
        <input
          type="file"
          id="rag-document-upload"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleUpload}
          accept=".pdf,.jpg,.jpeg,.png"
          disabled={isUploading}
        />
        <Button 
          variant="outline" 
          className="w-full flex items-center justify-center" 
          disabled={isUploading}
        >
          {isUploading ? (
            <>
              <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
