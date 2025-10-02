import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { VectorStore } from '@/lib/ai/vectorStore';
import { DocumentProcessor } from '@/lib/ai/documentProcessor';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateUUID } from '@/lib/utils';

/**
 * API endpoint to process documents using the full document processor flow
 * This endpoint:
 * 1. Receives a file from the docling service worker
 * 2. Saves it temporarily
 * 3. Uses DocumentProcessor to process with Docling
 * 4. Embeds chunks and stores in vector database
 */
export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;

  try {
    console.log('[Process & Embed] 🚀 Endpoint called');

    // Check authentication - either session or API key
    console.log('[Process & Embed] 🔐 Checking authentication...');
    const session = await auth();
    const apiKey = request.headers.get('x-api-key');
    const expectedApiKey = process.env.DOCLING_API_KEY;

    console.log(`[Process & Embed] Auth check: session=${!!session?.user}, apiKey=${!!apiKey}, expected=${!!expectedApiKey}`);

    // Require either a valid session OR a valid API key
    if (!session?.user && (!apiKey || apiKey !== expectedApiKey)) {
      console.error('[Process & Embed] ❌ Authentication failed');
      return NextResponse.json(
        { error: 'Unauthorized - Invalid or missing authentication' },
        { status: 401 },
      );
    }

    console.log('[Process & Embed] ✅ Authentication successful');

    // Parse form data
    console.log('[Process & Embed] 📦 Parsing form data...');
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const jobId = formData.get('job_id') as string;
    const contentHash = formData.get('content_hash') as string;
    const r2Url = formData.get('r2_url') as string;

    console.log(`[Process & Embed] Form data received: jobId=${jobId}, file=${file?.name}, hash=${contentHash?.substring(0, 8)}...`);

    // Validate required fields
    if (!file || !jobId) {
      console.error('[Process & Embed] ❌ Missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields: file, job_id' },
        { status: 400 },
      );
    }

    console.log(`[Process & Embed] 📄 Starting processing for job ${jobId}`);
    console.log(`[Process & Embed] 📄 File: ${file.name} (${file.size} bytes, type: ${file.type})`);

    const startTime = Date.now();

    // Save file to temporary location
    console.log('[Process & Embed] 💾 Saving file to temporary location...');
    const fileExtension = file.name.split('.').pop() || 'pdf';
    const tempFileName = `${generateUUID()}.${fileExtension}`;
    tempFilePath = join(tmpdir(), tempFileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(tempFilePath, buffer);

    console.log(`[Process & Embed] ✅ Saved to temp file: ${tempFilePath} (${buffer.length} bytes)`);

    // Process document using DocumentProcessor
    // This will use Docling service if available, or fallback to basic processing
    console.log('[Process & Embed] 🔄 Starting document processing...');
    console.log(`[Process & Embed] 📝 Original filename: ${file.name}`);

    let chunks;
    if (file.type === 'application/pdf') {
      console.log('[Process & Embed] 📖 Processing as PDF...');
      chunks = await DocumentProcessor.processPDF(
        tempFilePath,
        contentHash,
        r2Url,
        file.name, // Pass original filename
      );
    } else if (file.type.startsWith('image/')) {
      console.log('[Process & Embed] 🖼️  Processing as image...');
      chunks = [
        await DocumentProcessor.processImageWithUrl(
          tempFilePath,
          contentHash,
          r2Url,
        ),
      ];
    } else {
      console.error(`[Process & Embed] ❌ Unsupported file type: ${file.type}`);
      throw new Error(`Unsupported file type: ${file.type}`);
    }

    console.log(`[Process & Embed] ✅ Document processed into ${chunks.length} chunks`);

    // Initialize vector store and store documents
    console.log('[Process & Embed] 🗄️  Initializing vector store...');
    const vectorStore = new VectorStore();
    await vectorStore.initialize();
    console.log('[Process & Embed] ✅ Vector store initialized');

    console.log(`[Process & Embed] 💾 Storing ${chunks.length} chunks in vector database...`);
    await vectorStore.storeDocuments(chunks);
    console.log(`[Process & Embed] ✅ All chunks stored successfully`);

    const processingTime = Date.now() - startTime;

    // Determine total pages
    const totalPages = chunks.reduce((max, chunk) => {
      const page = chunk.metadata?.page || 1;
      return Math.max(max, page);
    }, 1);

    console.log(`[Process & Embed] 🎉 Successfully completed job ${jobId} in ${processingTime}ms`);
    console.log(`[Process & Embed] 📊 Stats: ${chunks.length} chunks, ${totalPages} pages`);

    return NextResponse.json({
      success: true,
      message: `Successfully processed and stored ${chunks.length} chunks`,
      job_id: jobId,
      chunks_stored: chunks.length,
      total_pages: totalPages,
      processing_time_ms: processingTime,
    });
  } catch (error) {
    console.error('[Process & Embed] ❌ Error occurred:', error);
    console.error('[Process & Embed] ❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      {
        error: 'Failed to process and embed document',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  } finally {
    // Clean up temporary file
    if (tempFilePath) {
      try {
        console.log(`[Process & Embed] 🧹 Cleaning up temp file: ${tempFilePath}`);
        await unlink(tempFilePath);
        console.log(`[Process & Embed] ✅ Temp file cleaned up`);
      } catch (cleanupError) {
        console.warn(
          `[Process & Embed] ⚠️  Failed to cleanup temp file: ${cleanupError}`,
        );
      }
    }
    console.log('[Process & Embed] 🏁 Request completed');
  }
}
