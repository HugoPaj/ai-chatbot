export type DataPart = { type: 'append-message'; message: string };

export type ContentType = 'text' | 'image' | 'table';

export interface Coordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TableStructure {
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface DocumentChunk {
  content: string;
  metadata: {
    source: string;
    page?: number;
    type: 'pdf' | 'image';
    section?: string;
    filename: string;
    contentHash?: string;
    // Multimodal enhancements
    contentType: ContentType;
    coordinates?: Coordinates;
    imageUrl?: string;
    imageData?: string; // Base64 encoded image data for embedding
    tableStructure?: TableStructure;
    originalImagePath?: string; // For image files uploaded directly
  };
}

export interface EmbeddingVector {
  id: string;
  values: number[];
  metadata: DocumentChunk['metadata'] & {
    content: string;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp?: Date;
}

export interface SearchResult {
  score: number;
  metadata: DocumentChunk['metadata'] & {
    content: string;
  };
}

export interface ChatResponse {
  response: string;
  sources: string[];
}

// Local UI attachment type (AI SDK v5 removed Attachment export)
export interface Attachment {
  url: string;
  name: string;
  contentType: string;
}
