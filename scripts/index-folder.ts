import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { DocumentProcessor } from '../lib/ai/documentProcessor';
import { VectorStore } from '../lib/ai/vectorStore';
import type { DocumentChunk } from '../lib/types';

/**
 * CLI script that walks through a folder, processes all supported files (PDF / JPEG / PNG),
 * generates embeddings, and uploads them to the configured Pinecone index.
 *
 * Usage:
 *   pnpm tsx scripts/index-folder.ts ./my-folder-with-docs
 *
 * NOTES
 * -----
 * 1. The script runs **outside** of the Next.js server, so your `.env` (Pinecone keys, etc.)
 *    must be available in the shell environment.
 * 2. The existing DocumentProcessor and VectorStore classes are re-used, which means the
 *    resulting vectors have **exactly** the same schema as uploads done via the /api route.
 */

const SUPPORTED_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg']);
const SUPPORTED_PDF_EXT = new Set(['.pdf']);

const walkDir = (dir: string): string[] => {
  const results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat?.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
};

async function main() {
  const startTime = Date.now();
  console.log('🚀 Starting document indexing process...');
  console.log('📅 Start time:', new Date().toLocaleString());
  console.log('');

  const folder = process.argv[2];
  if (!folder) {
    console.error('❌  Please provide a folder path.');
    console.error('    Example: pnpm tsx scripts/index-folder.ts ./docs');
    process.exit(1);
  }

  const resolvedFolder = path.resolve(folder);
  if (
    !fs.existsSync(resolvedFolder) ||
    !fs.statSync(resolvedFolder).isDirectory()
  ) {
    console.error(`❌  Path is not a directory: ${resolvedFolder}`);
    process.exit(1);
  }

  console.log('🔍 STEP 1: Scanning directory for files');
  console.log(`📂  Target folder: ${resolvedFolder}`);

  const allFiles = walkDir(resolvedFolder);
  console.log(`📄  Total files found: ${allFiles.length}`);

  const filesToProcess = allFiles.filter((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_PDF_EXT.has(ext) || SUPPORTED_IMAGE_EXT.has(ext);
  });

  const unsupportedFiles = allFiles.filter((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return !SUPPORTED_PDF_EXT.has(ext) && !SUPPORTED_IMAGE_EXT.has(ext);
  });

  console.log(`✅  Supported files: ${filesToProcess.length}`);
  console.log(`⚠️   Unsupported files: ${unsupportedFiles.length}`);

  if (filesToProcess.length === 0) {
    console.log('❌  No supported files found. Exiting.');
    return;
  }

  // Show breakdown by file type
  const pdfFiles = filesToProcess.filter((f) =>
    SUPPORTED_PDF_EXT.has(path.extname(f).toLowerCase()),
  );
  const imageFiles = filesToProcess.filter((f) =>
    SUPPORTED_IMAGE_EXT.has(path.extname(f).toLowerCase()),
  );
  console.log(`    📖 PDFs: ${pdfFiles.length}`);
  console.log(`    🖼️  Images: ${imageFiles.length}`);
  console.log('');

  // List all files to be processed
  console.log('📋 Files to process:');
  filesToProcess.forEach((file, index) => {
    const relativePath = path.relative(resolvedFolder, file);
    const fileSize = fs.statSync(file).size;
    const fileSizeKB = (fileSize / 1024).toFixed(1);
    const fileType = SUPPORTED_PDF_EXT.has(path.extname(file).toLowerCase())
      ? 'PDF'
      : 'IMG';
    console.log(
      `    ${index + 1}. [${fileType}] ${relativePath} (${fileSizeKB} KB)`,
    );
  });
  console.log('');

  console.log('⚙️  STEP 2: Initializing vector store');
  // initialise vector store
  const vectorStore = new VectorStore();
  await vectorStore.initialize();
  console.log('');

  console.log(
    '🔄 STEP 3: Processing and uploading documents (per-document workflow)',
  );
  let totalChunksProcessed = 0;
  let totalDocumentsUploaded = 0;
  const processingStartTime = Date.now();

  for (let i = 0; i < filesToProcess.length; i++) {
    const filePath = filesToProcess[i];
    const relativePath = path.relative(resolvedFolder, filePath);
    const fileProcessingStart = Date.now();

    try {
      console.log(
        `📄 Processing file ${i + 1}/${filesToProcess.length}: ${relativePath}`,
      );

      const buffer = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      const ext = path.extname(filePath).toLowerCase();

      console.log(`    🔐 Content hash: ${hash.substring(0, 16)}...`);
      console.log(`    📏 File size: ${(buffer.length / 1024).toFixed(1)} KB`);

      let chunks: DocumentChunk[] = [];

      if (SUPPORTED_PDF_EXT.has(ext)) {
        console.log(`    📖 Processing as PDF document...`);
        chunks = await DocumentProcessor.processPDF(filePath, hash);
        console.log(`    ✅ Generated ${chunks.length} chunks from PDF`);
      } else if (SUPPORTED_IMAGE_EXT.has(ext)) {
        console.log(`    🖼️  Processing as image...`);
        const chunk = await DocumentProcessor.processImage(filePath, hash);
        chunks = [chunk];
        console.log(`    ✅ Generated 1 image chunk`);
      }

      const fileProcessingTime = Date.now() - fileProcessingStart;
      console.log(`    ⏱️  Processing time: ${fileProcessingTime}ms`);

      if (chunks.length > 0) {
        console.log(
          `    🚀 Uploading ${chunks.length} chunks to vector store...`,
        );
        const uploadStart = Date.now();
        await vectorStore.storeDocuments(chunks);
        const uploadTime = Date.now() - uploadStart;
        console.log(`    ✅ Upload completed in ${uploadTime}ms`);
        totalChunksProcessed += chunks.length;
        totalDocumentsUploaded++;
      }

      console.log('');
    } catch (err) {
      console.error(`❌  Failed to process ${relativePath}:`, err);
      console.log('');
    }
  }

  const totalTime = Date.now() - processingStartTime;

  console.log('🎉 INDEXING COMPLETE!');
  console.log('📊 Summary:');
  console.log(`    ⏱️  Total time: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`    📁 Files processed: ${filesToProcess.length}`);
  console.log(`    📄 Documents uploaded: ${totalDocumentsUploaded}`);
  console.log(`    📊 Total chunks processed: ${totalChunksProcessed}`);
  console.log(`    📅 Completed: ${new Date().toLocaleString()}`);
  console.log(
    '✅  All documents successfully indexed with per-document upload!',
  );
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
