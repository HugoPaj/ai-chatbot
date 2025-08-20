/**
 * PDF processing wrapper to isolate pdf-parse from main module loading
 */

export async function parsePDF(dataBuffer: Buffer): Promise<{
  text: string;
  numpages: number;
  numrender: number;
}> {
  try {
    // Use dynamic import to avoid module.parent issues in pdf-parse
    const pdfParse = await import('pdf-parse');
    
    // Handle both default and named exports
    const parseFunction = pdfParse.default || pdfParse;
    
    if (typeof parseFunction !== 'function') {
      throw new Error('pdf-parse module did not export a function');
    }
    
    const result = await parseFunction(dataBuffer);
    return result;
  } catch (error) {
    console.error('Error in PDF parsing:', error);
    throw error;
  }
}