export type DataPart = { type: 'append-message'; message: string };
export interface DocumentChunk {
    content: string;
    metadata: {
      source: string;
      page?: number;
      type: 'pdf' | 'image';
      section?: string;
      filename: string;
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