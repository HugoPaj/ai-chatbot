'use client';

import { useState, useEffect } from 'react';
import {
  Upload,
  AlertCircle,
  CheckCircle,
  XCircle,
  FileText,
  Trash2,
  RefreshCw,
  Database,
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
  status: 'pending' | 'uploading' | 'processing' | 'success' | 'error';
  message?: string;
  chunks?: number;
  progress?: number; // 0-100 for processing progress
  jobId?: string; // Store job ID for polling
}

interface StoredFile {
  filename: string;
  isDeleting?: boolean;
}

// Helper function to extract meaningful filename after the unique file identifier
const extractMeaningfulFilename = (filename: string): string => {
  const parts = filename.split('-');
  if (parts.length > 4) {
    // Join everything after the 4th dash
    return parts.slice(4).join('-');
  }
  return filename; // Return original if not enough dashes
};

export function DocumentUploadPopup() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  const [open, setOpen] = useState(false);
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Load stored files when sheet opens
  useEffect(() => {
    if (open) {
      loadStoredFiles();
    }
  }, [open]);

  // Poll for job status only when sheet is open
  useEffect(() => {
    if (!open) return;

    const processingJobs = uploadStatuses.filter(
      (status) =>
        status.jobId &&
        (status.status === 'uploading' || status.status === 'processing')
    );

    if (processingJobs.length === 0) return;

    const pollInterval = setInterval(async () => {
      for (const job of processingJobs) {
        if (!job.jobId) continue;

        try {
          const response = await fetch(`/api/rag-documents/status/${job.jobId}`);
          if (!response.ok) continue;

          const status = await response.json();

          setUploadStatuses((prev) =>
            prev.map((s) =>
              s.jobId === job.jobId
                ? {
                    ...s,
                    status: status.status === 'completed' ? 'success' : status.status === 'failed' ? 'error' : 'processing',
                    message: status.status === 'completed'
                      ? `Successfully processed with ${status.result?.chunks || 0} chunks`
                      : status.status === 'failed'
                      ? status.error || 'Processing failed'
                      : status.message || 'Processing...',
                    progress: status.progress || 0,
                    chunks: status.result?.chunks,
                  }
                : s
            )
          );

          // Show success toast when completed
          if (status.status === 'completed') {
            toast({
              type: 'success',
              description: `${job.file.name} processed successfully`,
            });
            loadStoredFiles(); // Refresh file list
          } else if (status.status === 'failed') {
            toast({
              type: 'error',
              description: `${job.file.name} processing failed: ${status.error || 'Unknown error'}`,
            });
          }
        } catch (error) {
          console.error('Error polling job status:', error);
        }
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [open, uploadStatuses]);

  const loadStoredFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const response = await fetch('/api/rag-documents/list');
      if (response.ok) {
        const data = await response.json();
        setStoredFiles(data.files.map((filename: string) => ({ filename })));
      } else {
        console.error('Failed to load stored files');
        toast({
          type: 'error',
          description: 'Failed to load stored files',
        });
      }
    } catch (error) {
      console.error('Error loading stored files:', error);
      toast({
        type: 'error',
        description: 'Error loading stored files',
      });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const deleteFile = async (filename: string) => {
    // Set deleting state
    setStoredFiles((prev) =>
      prev.map((file) =>
        file.filename === filename ? { ...file, isDeleting: true } : file,
      ),
    );

    try {
      const response = await fetch(
        `/api/rag-documents/delete?filename=${encodeURIComponent(filename)}`,
        {
          method: 'DELETE',
        },
      );

      if (response.ok) {
        // Remove from the list
        setStoredFiles((prev) =>
          prev.filter((file) => file.filename !== filename),
        );
        toast({
          type: 'success',
          description: `Successfully deleted "${filename}"`,
        });
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete file');
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      toast({
        type: 'error',
        description:
          error instanceof Error ? error.message : 'Failed to delete file',
      });
      // Remove deleting state on error
      setStoredFiles((prev) =>
        prev.map((file) =>
          file.filename === filename ? { ...file, isDeleting: false } : file,
        ),
      );
    }
  };

  const confirmDelete = (filename: string) => {
    if (
      window.confirm(
        `Are you sure you want to delete "${filename}"? This action cannot be undone.`,
      )
    ) {
      deleteFile(filename);
    }
  };

  const validateFile = (file: File) => {
    // Check file type
    const supportedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!supportedTypes.includes(file.type)) {
      return 'Unsupported file type. Please upload PDF, JPEG, or PNG files only.';
    }

    // Check file size (20MB max)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      return 'File too large. Maximum file size is 20MB.';
    }

    return null;
  };

  const uploadSingleFile = async (
    file: File,
    fileIndex: number,
  ): Promise<{ success: boolean; message: string; chunks?: number; jobId?: string }> => {
    try {
      // Update to uploading state
      setUploadStatuses((prev) =>
        prev.map((status, index) =>
          index === fileIndex
            ? { ...status, status: 'uploading', message: 'Calculating hash...', progress: 0 }
            : status,
        ),
      );

      // Step 1: Calculate content hash FIRST (before uploading)
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Step 2: Check for duplicates BEFORE uploading to R2
      setUploadStatuses((prev) =>
        prev.map((status, index) =>
          index === fileIndex
            ? { ...status, message: 'Checking for duplicates...', progress: 20 }
            : status,
        ),
      );

      const duplicateResponse = await fetch('/api/rag-documents/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentHash }),
      });

      if (!duplicateResponse.ok) {
        throw new Error('Failed to check for duplicates');
      }

      const duplicateCheck = await duplicateResponse.json();

      if (duplicateCheck.exists) {
        return {
          success: false,
          message: `This document already exists in the knowledge base as "${duplicateCheck.filename}". Uploading it again would replace the existing version.`,
        };
      }

      // Step 3: Get presigned upload URL
      setUploadStatuses((prev) =>
        prev.map((status, index) =>
          index === fileIndex
            ? { ...status, message: 'Preparing upload...', progress: 40 }
            : status,
        ),
      );

      const urlResponse = await fetch('/api/rag-documents/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });

      if (!urlResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadUrl, r2Key } = await urlResponse.json();

      // Step 4: Upload directly to R2 using presigned URL
      setUploadStatuses((prev) =>
        prev.map((status, index) =>
          index === fileIndex
            ? { ...status, message: 'Uploading to storage...', progress: 60 }
            : status,
        ),
      );

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      // Step 5: Notify backend and create processing job
      setUploadStatuses((prev) =>
        prev.map((status, index) =>
          index === fileIndex
            ? { ...status, message: 'Creating processing job...', progress: 80 }
            : status,
        ),
      );

      const response = await fetch('/api/rag-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          r2Key,
          filename: file.name,
          fileSize: file.size.toString(),
          fileType: file.type,
          contentHash,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create processing job');
      }

      const uploadResult = await response.json();

      // Check if it's a duplicate (shouldn't happen since we checked earlier)
      if (uploadResult.error === 'duplicate') {
        return {
          success: false,
          message: uploadResult.message || 'Duplicate document detected',
        };
      }

      const jobId = uploadResult.job_id;

      // Store job ID and set to processing state
      // Polling will happen via useEffect when sidebar is open
      setUploadStatuses((prev) =>
        prev.map((s, index) =>
          index === fileIndex
            ? {
                ...s,
                status: 'processing',
                message: 'Queued for processing...',
                progress: 0,
                jobId,
              }
            : s,
        ),
      );

      return {
        success: true, // Upload successful, processing will happen async
        message: 'Upload complete, processing...',
        jobId,
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

      const result = await uploadSingleFile(file, i);

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    // Show final summary toast
    if (successCount > 0 && errorCount === 0) {
      toast({
        type: 'success',
        description: `Successfully uploaded ${successCount} document${successCount > 1 ? 's' : ''}. Processing in background...`,
      });
    } else if (successCount > 0 && errorCount > 0) {
      toast({
        type: 'success',
        description: `${successCount} of ${fileArray.length} documents uploaded. Processing in background...`,
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
          <FileText className="size-4" />
          <span className="sr-only">Upload Documents</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-[425px]">
        <SheetHeader className="mb-4">
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
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <div>
                <p>You can select multiple files at once for batch upload.</p>
                <p className="mt-1">Maximum file size: 20MB per file</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <input
              type="file"
              id="rag-document-upload-popup"
              className="absolute inset-0 size-full opacity-0 cursor-pointer"
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

          {/* Stored Files List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="size-4" />
                <span className="text-sm font-medium">Stored Documents</span>
                {storedFiles.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({storedFiles.length} files)
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadStoredFiles}
                disabled={isLoadingFiles}
                className="h-7 px-2"
              >
                <RefreshCw
                  className={`size-3 ${isLoadingFiles ? 'animate-spin' : ''}`}
                />
                <span className="sr-only">Refresh</span>
              </Button>
            </div>

            {isLoadingFiles ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <RefreshCw className="size-4 animate-spin mr-2" />
                Loading stored files...
              </div>
            ) : storedFiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No documents stored yet. Upload some files to get started!
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto border rounded-lg">
                {storedFiles.map((file) => (
                  <div
                    key={file.filename}
                    className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText className="size-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate" title={file.filename}>
                        {extractMeaningfulFilename(file.filename)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => confirmDelete(file.filename)}
                      disabled={file.isDeleting || isUploading}
                      className="size-7 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                      title={`Delete ${file.filename}`}
                    >
                      {file.isDeleting ? (
                        <RefreshCw className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
                    <div className="shrink-0 mt-0.5">
                      {status.status === 'pending' && (
                        <div className="size-4 rounded-full bg-gray-300" />
                      )}
                      {status.status === 'uploading' && (
                        <div className="size-4 rounded-full bg-blue-500 animate-pulse" />
                      )}
                      {status.status === 'processing' && (
                        <div className="size-4 rounded-full bg-purple-500 animate-spin border-2 border-current border-t-transparent" />
                      )}
                      {status.status === 'success' && (
                        <CheckCircle className="size-4 text-green-500" />
                      )}
                      {status.status === 'error' && (
                        <XCircle className="size-4 text-red-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium truncate">
                          {extractMeaningfulFilename(status.file.name)}
                        </div>
                        {status.status === 'processing' && status.progress !== undefined && (
                          <div className="text-xs text-muted-foreground shrink-0">
                            {status.progress}%
                          </div>
                        )}
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
                      {/* Progress bar for processing */}
                      {status.status === 'processing' && status.progress !== undefined && (
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
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
      </SheetContent>
    </Sheet>
  );
}
