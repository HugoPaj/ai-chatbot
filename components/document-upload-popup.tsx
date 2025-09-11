'use client';

import { useState } from 'react';
import {
  Upload,
  AlertCircle,
  CheckCircle,
  XCircle,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/toast';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface UploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  message?: string;
  chunks?: number;
}

export function DocumentUploadPopup() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  const [open, setOpen] = useState(false);

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
  ): Promise<{ success: boolean; message: string; chunks?: number }> => {
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
      return {
        success: true,
        message: `Successfully processed with ${result.chunks} chunks`,
        chunks: result.chunks,
      };
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

      // Update status to uploading
      setUploadStatuses((prev) =>
        prev.map((status, index) =>
          index === i ? { ...status, status: 'uploading' } : status,
        ),
      );

      const result = await uploadSingleFile(file);

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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2"
          title="Upload Documents"
        >
          <FileText className="h-4 w-4" />
          <span className="sr-only">Upload Documents</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-[425px]">
        <SheetHeader>
          <SheetTitle>Document Knowledge Base</SheetTitle>
          <SheetDescription>
            Upload documents (PDF, JPEG, PNG) to enhance the AI&apos;s
            knowledge. The AI will reference these documents when answering your
            questions.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p>You can select multiple files at once for batch upload.</p>
                <p className="mt-1">Maximum file size: 10MB per file</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <input
              type="file"
              id="rag-document-upload-popup"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleUpload}
              accept=".pdf,.jpg,.jpeg,.png"
              disabled={isUploading}
              multiple
            />
            <Button
              variant="outline"
              className="w-full flex items-center justify-center h-12"
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Documents
                </>
              )}
            </Button>
          </div>

          {/* Upload Progress Display */}
          {uploadStatuses.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-medium">
                Upload Progress (
                {uploadStatuses.filter((s) => s.status === 'success').length}/
                {uploadStatuses.length} completed)
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {uploadStatuses.map((status) => (
                  <div
                    key={`${status.file.name}-${status.file.size}-${status.file.lastModified}`}
                    className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {status.status === 'pending' && (
                        <div className="h-4 w-4 rounded-full bg-gray-300" />
                      )}
                      {status.status === 'uploading' && (
                        <div className="h-4 w-4 rounded-full bg-blue-500 animate-pulse" />
                      )}
                      {status.status === 'success' && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {status.status === 'error' && (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-sm font-medium truncate">
                        {status.file.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {Math.round(status.file.size / 1024)} KB
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
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
