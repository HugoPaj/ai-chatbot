'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { FileText, Upload, Trash2, Download, AlertCircle } from 'lucide-react';
import { toast } from '@/components/toast';

// Mock documents - replace with real data from your RAG system
const mockDocuments = [
  {
    id: '1',
    name: 'company-handbook.pdf',
    size: '2.4 MB',
    uploadedAt: '2024-01-15',
    status: 'processed'
  },
  {
    id: '2',
    name: 'technical-documentation.md',
    size: '1.1 MB',
    uploadedAt: '2024-01-14',
    status: 'processing'
  },
];

export function DocumentUpload() {
  const [documents, setDocuments] = useState(mockDocuments);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file type
    const allowedTypes = ['.pdf', '.txt', '.md', '.docx'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!allowedTypes.includes(fileExtension)) {
      toast({
        type: 'error',
        description: 'Only PDF, TXT, MD, and DOCX files are supported',
      });
      return;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast({
        type: 'error',
        description: 'File size must be less than 10MB',
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // TODO: Implement actual file upload to your RAG system
      // const formData = new FormData();
      // formData.append('file', file);
      // const response = await fetch('/api/admin/documents/upload', {
      //   method: 'POST',
      //   body: formData,
      // });

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Add to documents list
      const newDocument = {
        id: Date.now().toString(),
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        uploadedAt: new Date().toISOString().split('T')[0],
        status: 'processing' as const,
      };

      setDocuments([newDocument, ...documents]);

      toast({
        type: 'success',
        description: `Successfully uploaded ${file.name}`,
      });

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      toast({
        type: 'error',
        description: 'Failed to upload document',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteDocument = async (docId: string, docName: string) => {
    try {
      // TODO: Implement actual document deletion API call
      // await fetch(`/api/admin/documents/${docId}`, {
      //   method: 'DELETE',
      // });

      setDocuments(documents.filter(doc => doc.id !== docId));

      toast({
        type: 'success',
        description: `Deleted ${docName}`,
      });
    } catch (error) {
      toast({
        type: 'error',
        description: 'Failed to delete document',
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processed': return 'text-green-600 bg-green-50 dark:bg-green-950/20';
      case 'processing': return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20';
      case 'error': return 'text-red-600 bg-red-50 dark:bg-red-950/20';
      default: return 'text-gray-600 bg-gray-50 dark:bg-gray-950/20';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-5" />
          Knowledge Base Documents
        </CardTitle>
        <CardDescription>
          Upload documents to enhance the AI's knowledge base (PDF, TXT, MD, DOCX)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Section */}
        <div className="space-y-3">
          <Label>Upload New Document</Label>
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6">
            <div className="text-center space-y-3">
              <Upload className="size-8 text-muted-foreground mx-auto" />
              <div>
                <p className="text-sm font-medium">Click to upload documents</p>
                <p className="text-xs text-muted-foreground">
                  PDF, TXT, MD, DOCX up to 10MB
                </p>
              </div>
              <Button
                onClick={handleFileSelect}
                disabled={isUploading}
                variant="outline"
              >
                Select Files
              </Button>
            </div>
          </div>

          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="w-full" />
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.txt,.md,.docx"
            onChange={handleFileUpload}
          />
        </div>

        {/* Documents List */}
        <div className="space-y-3">
          <Label>Current Documents ({documents.length})</Label>

          {documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="size-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="size-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{doc.size}</span>
                        <span>•</span>
                        <span>{doc.uploadedAt}</span>
                        <span
                          className={`px-2 py-1 rounded-full capitalize ${getStatusColor(doc.status)}`}
                        >
                          {doc.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteDocument(doc.id, doc.name)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
          <div className="flex gap-2">
            <AlertCircle className="size-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-800 dark:text-blue-200">
              <p><strong>RAG Integration:</strong> Uploaded documents are processed and indexed for AI responses.</p>
              <p className="mt-1">Processing may take a few minutes for large documents.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}