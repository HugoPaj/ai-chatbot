import { createWorker } from 'tesseract.js';

export interface OCRResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }>;
}

export class OCRService {
  private static worker: Tesseract.Worker | null = null;
  private static isInitialized = false;

  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.worker = await createWorker({
        logger: m => console.log(m),
        workerPath: '/tesseract-worker.js',
        corePath: '/tesseract-core.js',
        workerBlobURL: false,
        crossOrigin: 'anonymous',
      });

      await this.worker.loadLanguage('eng');
      await this.worker.initialize('eng');
      
      this.isInitialized = true;
      console.log('OCR service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OCR service:', error);
      throw error;
    }
  }

  static async extractText(imageBuffer: Buffer): Promise<OCRResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.worker) {
      throw new Error('OCR worker not initialized');
    }

    try {
      const { data } = await this.worker.recognize(imageBuffer);
      
      return {
        text: data.text.trim(),
        confidence: data.confidence,
        words: data.words.map(word => ({
          text: word.text,
          confidence: word.confidence,
          bbox: word.bbox,
        })),
      };
    } catch (error) {
      console.error('OCR extraction failed:', error);
      throw error;
    }
  }

  static async extractTextFromImageData(imageData: string): Promise<OCRResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.worker) {
      throw new Error('OCR worker not initialized');
    }

    try {
      const { data } = await this.worker.recognize(imageData);
      
      return {
        text: data.text.trim(),
        confidence: data.confidence,
        words: data.words.map(word => ({
          text: word.text,
          confidence: word.confidence,
          bbox: word.bbox,
        })),
      };
    } catch (error) {
      console.error('OCR extraction failed:', error);
      throw error;
    }
  }

  static async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }

  static isTextPresent(ocrResult: OCRResult, confidenceThreshold = 60): boolean {
    return ocrResult.confidence > confidenceThreshold && ocrResult.text.trim().length > 0;
  }

  static getHighConfidenceText(ocrResult: OCRResult, confidenceThreshold = 80): string {
    const highConfidenceWords = ocrResult.words
      .filter(word => word.confidence > confidenceThreshold)
      .map(word => word.text);
    
    return highConfidenceWords.join(' ');
  }
}