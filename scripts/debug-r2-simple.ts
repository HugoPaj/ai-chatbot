#!/usr/bin/env tsx

// Simple R2 debug script to test one upload
// Run with: pnpm tsx scripts/debug-r2-simple.ts

import { put } from '../lib/r2';

async function debugR2Upload() {
  console.log('🔍 Debugging R2 Upload Issue...\n');

  // Test with a very simple file
  const testFileName = `debug-test-${Date.now()}.txt`;
  const testContent = Buffer.from('Hello R2 Debug Test', 'utf-8');

  console.log('📝 Test file details:');
  console.log(`   Name: ${testFileName}`);
  console.log(`   Size: ${testContent.length} bytes`);
  console.log(`   Content: "${testContent.toString()}"`)

  console.log('\n🚀 Starting upload...');

  try {
    const result = await put(testFileName, testContent, {
      access: 'public',
      contentType: 'text/plain',
    });

    console.log('\n✅ Upload SUCCESS!');
    console.log('Result:', result);

  } catch (error: any) {
    console.log('\n❌ Upload FAILED!');
    console.log('Error details:');
    console.log('- Message:', error.message);
    console.log('- Name:', error.name);
    console.log('- Code:', error.Code || error.code);
    console.log('- Status:', error.$metadata?.httpStatusCode);
    console.log('- Full error:', error);

    // Common R2 issues and solutions
    console.log('\n💡 Common R2 Issues:');

    if (error.message.includes('NoSuchBucket')) {
      console.log('❌ Bucket does not exist');
      console.log('   → Check your bucket name in R2 dashboard');
      console.log('   → Make sure R2_BUCKET_NAME is correct');
    }

    if (error.message.includes('AccessDenied') || error.message.includes('403')) {
      console.log('❌ Access denied - permission issue');
      console.log('   → Check your API token has R2:Edit permissions');
      console.log('   → Verify R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY');
    }

    if (error.message.includes('InvalidAccessKeyId')) {
      console.log('❌ Invalid access key');
      console.log('   → Check R2_ACCESS_KEY_ID is correct');
    }

    if (error.message.includes('SignatureDoesNotMatch')) {
      console.log('❌ Invalid secret key');
      console.log('   → Check R2_SECRET_ACCESS_KEY is correct');
    }

    if (error.message.includes('InvalidBucketName')) {
      console.log('❌ Invalid bucket name');
      console.log('   → Bucket names must be lowercase');
      console.log('   → No spaces or special characters');
    }

    console.log('\n🔧 Debug your configuration:');
    console.log('1. Go to Cloudflare Dashboard → R2');
    console.log('2. Check your bucket exists and name matches exactly');
    console.log('3. Go to Manage R2 API tokens');
    console.log('4. Make sure your token has "R2:Edit" permissions');
    console.log('5. Copy the Account ID, Access Key, and Secret Key exactly');
  }
}

debugR2Upload().catch(console.error);