import { useState } from 'react';
import { Upload, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/toast';

interface UploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'success' | 'error';
  message?: string;
  chunks?: number;
  progress?: number; // 0-100 for processing progress
}

export function RagDocumentUploader() {
  const [isUploading, setIsUploading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);

  const validateFile = (file: File) => {
    // Check file type
    const supportedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!supportedTypes.includes(file.type)) {
      return 'Unsupported file type. Please upload PDF, JPEG, or PNG files only.';
    }

    // Check file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return 'File too large. Maximum file size is 10MB.';
    }

    return null;
  };

  const uploadSingleFile = async (
    file: File,
    fileIndex: number,
  ): Promise<{ success: boolean; message: string; chunks?: number }> => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Update to uploading state
      setUploadStatuses((prev) =>
        prev.map((status, index) =>
          index === fileIndex
            ? { ...status, status: 'uploading', message: 'Uploading file...', progress: 0 }
            : status,
        ),
      );

      const response = await fetch('/api/rag-documents', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload document');
      }

      const uploadResult = await response.json();

      // Check if it's a duplicate
      if (uploadResult.error === 'duplicate') {
        return {
          success: false,
          message: uploadResult.message || 'Duplicate document detected',
        };
      }

      const jobId = uploadResult.job_id;

      // Poll for job completion
      const pollInterval = 2000; // Poll every 2 seconds
      const maxWaitTime = 600000; // Max 10 minutes
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        const statusResponse = await fetch(
          `/api/rag-documents/status/${jobId}`,
        );

        if (!statusResponse.ok) {
          throw new Error('Failed to check processing status');
        }

        const status = await statusResponse.json();

        // Update progress
        setUploadStatuses((prev) =>
          prev.map((s, index) =>
            index === fileIndex
              ? {
                  ...s,
                  status: 'processing',
                  message: status.message || 'Processing...',
                  progress: status.progress || 0,
                }
              : s,
          ),
        );

        if (status.status === 'completed') {
          return {
            success: true,
            message: `Successfully processed with ${status.result?.chunks || 0} chunks`,
            chunks: status.result?.chunks || 0,
          };
        }

        if (status.status === 'failed') {
          throw new Error(status.error || 'Processing failed');
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      throw new Error('Processing timeout - job took too long');
    } catch (error) {
      console.error('Error uploading document:', error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Failed to upload document',
      };
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Convert FileList to Array and validate all files
    const fileArray = Array.from(files);
    const validationErrors: string[] = [];

    fileArray.forEach((file, index) => {
      const error = validateFile(file);
      if (error) {
        validationErrors.push(`${file.name}: ${error}`);
      }
    });

    if (validationErrors.length > 0) {
      toast({
        type: 'error',
        description: `Validation failed:\n${validationErrors.join('\n')}`,
      });
      return;
    }

    // Initialize upload statuses
    const initialStatuses: UploadStatus[] = fileArray.map((file) => ({
      file,
      status: 'pending',
    }));
    setUploadStatuses(initialStatuses);
    setIsUploading(true);

    // Process files sequentially to avoid overwhelming the server
    const results: UploadStatus[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];

      const result = await uploadSingleFile(file, i);

      const newStatus: UploadStatus = {
        file,
        status: result.success ? 'success' : 'error',
        message: result.message,
        chunks: result.chunks,
      };

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }

      results.push(newStatus);

      // Update status with result
      setUploadStatuses((prev) =>
        prev.map((status, index) => (index === i ? newStatus : status)),
      );
    }

    // Show final summary toast
    if (successCount > 0 && errorCount === 0) {
      toast({
        type: 'success',
        description: `Successfully uploaded ${successCount} document${successCount > 1 ? 's' : ''}`,
      });
    } else if (successCount > 0 && errorCount > 0) {
      toast({
        type: 'success',
        description: `${successCount} of ${fileArray.length} documents uploaded successfully`,
      });
    } else {
      toast({
        type: 'error',
        description: `Failed to upload ${errorCount} document${errorCount > 1 ? 's' : ''}`,
      });
    }

    setIsUploading(false);
    // Reset the file input
    event.target.value = '';

    // Clear statuses after a delay to let user see the results
    setTimeout(() => {
      setUploadStatuses([]);
    }, 5000);
  };

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Document Knowledge Base</h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setShowInfo(!showInfo)}
          title="About Document Knowledge Base"
        >
          <AlertCircle className="size-4" />
        </Button>
      </div>

      {showInfo && (
        <div className="mb-3 text-xs text-muted-foreground p-2 bg-muted rounded-md">
          <p>
            Upload documents (PDF, JPEG, PNG) to enhance the AI&apos;s
            knowledge. The AI will reference these documents when answering your
            questions. You can select multiple files at once for batch upload.
          </p>
          <p className="mt-1">Maximum file size: 10MB per file</p>
        </div>
      )}

      <div className="relative">
        <input
          type="file"
          id="rag-document-upload"
          className="absolute inset-0 size-full opacity-0 cursor-pointer"
          onChange={handleUpload}
          accept=".pdf,.jpg,.jpeg,.png"
          disabled={isUploading}
          multiple
        />
        <Button
          variant="outline"
          className="w-full flex items-center justify-center"
          disabled={isUploading}
        >
          {isUploading ? (
            <>
              <div className="size-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="size-4 mr-2" />
              Upload Documents
            </>
          )}
        </Button>
      </div>

      {/* Upload Progress Display */}
      {uploadStatuses.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            Upload Progress (
            {uploadStatuses.filter((s) => s.status === 'success').length}/
            {uploadStatuses.length} completed)
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {uploadStatuses.map((status) => (
              <div
                key={`${status.file.name}-${status.file.size}-${status.file.lastModified}`}
                className="flex items-center gap-2 p-2 bg-muted/50 rounded text-xs"
              >
                <div className="shrink-0">
                  {status.status === 'pending' && (
                    <div className="size-3 rounded-full bg-gray-300" />
                  )}
                  {status.status === 'uploading' && (
                    <div className="size-3 rounded-full bg-blue-500 animate-pulse" />
                  )}
                  {status.status === 'processing' && (
                    <div className="size-3 rounded-full bg-purple-500 animate-spin border-2 border-current border-t-transparent" />
                  )}
                  {status.status === 'success' && (
                    <CheckCircle className="size-3 text-green-500" />
                  )}
                  {status.status === 'error' && (
                    <XCircle className="size-3 text-red-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-medium">{status.file.name}</div>
                    {status.status === 'processing' && status.progress && (
                      <div className="text-xs text-muted-foreground shrink-0">
                        {status.progress}%
                      </div>
                    )}
                  </div>
                  {status.message && (
                    <div
                      className={`text-xs ${
                        status.status === 'success'
                          ? 'text-green-600'
                          : status.status === 'error'
                            ? 'text-red-600'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {status.message}
                    </div>
                  )}
                  {/* Progress bar for processing */}
                  {status.status === 'processing' && status.progress && (
                    <div className="mt-1 w-full bg-gray-200 rounded-full h-1">
                      <div
                        className="bg-purple-500 h-1 rounded-full transition-all duration-300"
                        style={{ width: `${status.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
