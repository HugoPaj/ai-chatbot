import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// R2 Configuration
const r2Config = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucketName: process.env.R2_BUCKET_NAME,
  publicUrl: process.env.R2_PUBLIC_URL,
};

// Validate R2 configuration
const validateR2Config = () => {
  const required = [
    'accountId',
    'accessKeyId',
    'secretAccessKey',
    'bucketName',
  ];
  const missing = required.filter(
    (key) => !r2Config[key as keyof typeof r2Config],
  );

  if (missing.length > 0) {
    throw new Error(`Missing R2 configuration: ${missing.join(', ')}`);
  }
};

// Initialize S3 client for R2
let r2Client: S3Client;

const getR2Client = () => {
  if (!r2Client) {
    validateR2Config();

    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2Config.accessKeyId as string,
        secretAccessKey: r2Config.secretAccessKey as string,
      },
    });
  }

  return r2Client;
};

export interface R2UploadResponse {
  url: string;
  pathname: string;
  downloadUrl: string;
  contentType?: string;
}

export const put = async (
  pathname: string,
  body: Buffer | Uint8Array | Blob,
  options: {
    access?: 'public' | 'private';
    contentType?: string;
  } = {},
): Promise<R2UploadResponse> => {
  try {
    const client = getR2Client();

    // Convert body to Buffer if it's a Blob
    let bodyBuffer: Buffer;
    if (body instanceof Blob) {
      bodyBuffer = Buffer.from(await body.arrayBuffer());
    } else if (body instanceof Uint8Array) {
      bodyBuffer = Buffer.from(body);
    } else {
      bodyBuffer = body;
    }

    const uploadParams: PutObjectCommandInput = {
      Bucket: r2Config.bucketName,
      Key: pathname,
      Body: bodyBuffer,
      ContentType: options.contentType || 'application/octet-stream',
    };

    // For public access, we don't need to set ACL with R2
    // R2 handles public access through bucket configuration or custom domains

    const command = new PutObjectCommand(uploadParams);

    console.log('🔧 [R2 DEBUG] Upload parameters:', {
      bucket: uploadParams.Bucket,
      key: uploadParams.Key,
      contentType: uploadParams.ContentType,
      bodySize: bodyBuffer.length,
    });

    const result = await client.send(command);
    console.log('✅ [R2 DEBUG] Upload result:', result);

    // Generate public URL
    // Note: For public access, you need to either:
    // 1. Enable public access in R2 dashboard and use the pub-xxx.r2.dev domain
    // 2. Set up a custom domain and set R2_PUBLIC_URL
    // Ensure the key/path segment is URL-safe (spaces, unicode, etc.)
    const encodedPathname = pathname
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    const publicUrl = r2Config.publicUrl
      ? `${r2Config.publicUrl}/${encodedPathname}`
      : `https://${r2Config.accountId}.r2.cloudflarestorage.com/${r2Config.bucketName}/${encodedPathname}`;

    console.log(`🔗 [R2 DEBUG] Generated public URL: ${publicUrl}`);
    console.log(
      `ℹ️  [R2 DEBUG] Note: If you get authorization errors, enable public access in R2 dashboard`,
    );

    const downloadUrl = publicUrl; // Same as URL for public access

    return {
      url: publicUrl,
      pathname,
      downloadUrl,
      contentType: uploadParams.ContentType,
    };
  } catch (error: any) {
    console.error('❌ [R2 DEBUG] Upload failed:', error);
    console.error('❌ [R2 DEBUG] Error name:', error.name);
    console.error('❌ [R2 DEBUG] Error message:', error.message);
    console.error(
      '❌ [R2 DEBUG] Error code:',
      error.Code || error.$metadata?.httpStatusCode,
    );
    console.error('❌ [R2 DEBUG] Error details:', {
      name: error.name,
      code: error.Code,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
    });

    throw new Error(
      `Failed to upload to R2: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};

export const del = async (pathname: string): Promise<void> => {
  try {
    const client = getR2Client();

    const deleteParams = {
      Bucket: r2Config.bucketName,
      Key: pathname,
    };

    const command = new DeleteObjectCommand(deleteParams);
    await client.send(command);
  } catch (error) {
    console.error('R2 delete failed:', error);
    throw new Error(
      `Failed to delete from R2: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};

export const get = async (pathname: string): Promise<Buffer | null> => {
  try {
    const client = getR2Client();

    const getParams = {
      Bucket: r2Config.bucketName,
      Key: pathname,
    };

    const command = new GetObjectCommand(getParams);
    const response = await client.send(command);

    if (!response.Body) {
      return null;
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  } catch (error) {
    console.error('R2 get failed:', error);
    return null;
  }
};

/**
 * Generate a presigned URL for client-side uploads
 * This bypasses Vercel's 4.5MB body size limit
 *
 * Security features:
 * - HTTPS-only URLs (enforced)
 * - Short expiration time (default 1 hour)
 * - Content-Type enforcement to prevent XSS
 */
export const generatePresignedUploadUrl = async (
  pathname: string,
  contentType: string,
  expiresIn: number = 3600, // 1 hour default
): Promise<string> => {
  try {
    const client = getR2Client();

    const command = new PutObjectCommand({
      Bucket: r2Config.bucketName,
      Key: pathname,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(client, command, {
      expiresIn,
      // Ensure HTTPS is used (AWS SDK default, but explicit for security)
      unhoistableHeaders: new Set(['x-amz-server-side-encryption']),
    });

    // Verify the URL uses HTTPS (security check)
    if (!presignedUrl.startsWith('https://')) {
      throw new Error('Presigned URL must use HTTPS');
    }

    return presignedUrl;
  } catch (error) {
    console.error('Failed to generate presigned URL:', error);
    throw new Error(
      `Failed to generate presigned URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};
