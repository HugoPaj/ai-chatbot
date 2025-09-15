import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';

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
  const required = ['accountId', 'accessKeyId', 'secretAccessKey', 'bucketName'];
  const missing = required.filter(key => !r2Config[key as keyof typeof r2Config]);

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
}

export const put = async (
  pathname: string,
  body: Buffer | Uint8Array | Blob,
  options: {
    access?: 'public' | 'private';
    contentType?: string;
  } = {}
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
    const publicUrl = r2Config.publicUrl
      ? `${r2Config.publicUrl}/${pathname}`
      : `https://${r2Config.accountId}.r2.cloudflarestorage.com/${r2Config.bucketName}/${pathname}`;

    const downloadUrl = publicUrl; // Same as URL for public access

    return {
      url: publicUrl,
      pathname,
      downloadUrl,
    };
  } catch (error: any) {
    console.error('❌ [R2 DEBUG] Upload failed:', error);
    console.error('❌ [R2 DEBUG] Error name:', error.name);
    console.error('❌ [R2 DEBUG] Error message:', error.message);
    console.error('❌ [R2 DEBUG] Error code:', error.Code || error.$metadata?.httpStatusCode);
    console.error('❌ [R2 DEBUG] Error details:', {
      name: error.name,
      code: error.Code,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
    });

    throw new Error(`Failed to upload to R2: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    throw new Error(`Failed to delete from R2: ${error instanceof Error ? error.message : 'Unknown error'}`);
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