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

  console.log(`📂  Indexing files in: ${resolvedFolder}`);

  const allFiles = walkDir(resolvedFolder);
  const filesToProcess = allFiles.filter((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_PDF_EXT.has(ext) || SUPPORTED_IMAGE_EXT.has(ext);
  });

  if (filesToProcess.length === 0) {
    console.log('⚠️  No supported files found. Exiting.');
    return;
  }

  console.log(`🗂️  Found ${filesToProcess.length} supported files`);

  // initialise vector store
  const vectorStore = new VectorStore();
  await vectorStore.initialize();

  const allChunks: DocumentChunk[] = [];

  for (const filePath of filesToProcess) {
    try {
      const buffer = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      const ext = path.extname(filePath).toLowerCase();

      if (SUPPORTED_PDF_EXT.has(ext)) {
        const chunks = await DocumentProcessor.processPDF(filePath, hash);
        allChunks.push(...chunks);
      } else if (SUPPORTED_IMAGE_EXT.has(ext)) {
        const chunk = await DocumentProcessor.processImage(filePath, hash);
        allChunks.push(chunk);
      }
    } catch (err) {
      console.error(`❌  Failed to process ${filePath}:`, err);
    }
  }

  if (allChunks.length === 0) {
    console.log('⚠️  No chunks generated. Nothing to store.');
    return;
  }

  console.log(`💾  Storing ${allChunks.length} chunks in Pinecone …`);
  await vectorStore.storeDocuments(allChunks);

  console.log('✅  Finished indexing folder');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
