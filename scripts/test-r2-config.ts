#!/usr/bin/env tsx

// Test script to validate R2 configuration
// Run with: pnpm tsx scripts/test-r2-config.ts

import { put, get, del } from '../lib/r2';

async function testR2Configuration() {
  console.log('🧪 Testing Cloudflare R2 Configuration...\n');

  // Check environment variables
  console.log('1. Environment Variables Check:');
  const requiredVars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
  const missing = requiredVars.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.log('❌ Missing environment variables:', missing);
    console.log('\nMake sure these are set in your .env file:');
    missing.forEach(key => console.log(`   ${key}=your_value_here`));
    process.exit(1);
  }

  console.log('✅ All required environment variables are present');
  console.log(`   Account ID: ${process.env.R2_ACCOUNT_ID?.slice(0, 8)}...`);
  console.log(`   Bucket: ${process.env.R2_BUCKET_NAME}`);
  console.log(`   Public URL: ${process.env.R2_PUBLIC_URL || 'Not set'}`);

  // Test basic connectivity
  console.log('\n2. Testing R2 Upload...');
  const testFileName = `test-${Date.now()}.txt`;
  const testContent = Buffer.from('Hello from R2 test!', 'utf-8');

  try {
    console.log(`   Uploading: ${testFileName}`);
    const uploadResult = await put(testFileName, testContent, {
      access: 'public',
      contentType: 'text/plain',
    });

    console.log('✅ Upload successful!');
    console.log(`   URL: ${uploadResult.url}`);
    console.log(`   Pathname: ${uploadResult.pathname}`);

    // Test retrieval
    console.log('\n3. Testing R2 Download...');
    const retrievedContent = await get(testFileName);

    if (retrievedContent) {
      const retrievedText = retrievedContent.toString('utf-8');
      if (retrievedText === 'Hello from R2 test!') {
        console.log('✅ Download successful and content matches!');
      } else {
        console.log('❌ Download content mismatch');
        console.log(`   Expected: "Hello from R2 test!"`);
        console.log(`   Got: "${retrievedText}"`);
      }
    } else {
      console.log('❌ Could not retrieve uploaded file');
    }

    // Test deletion
    console.log('\n4. Testing R2 Deletion...');
    await del(testFileName);
    console.log('✅ Deletion completed');

    // Verify deletion
    const deletedFile = await get(testFileName);
    if (deletedFile === null) {
      console.log('✅ File successfully deleted');
    } else {
      console.log('❌ File still exists after deletion');
    }

    console.log('\n🎉 All R2 tests passed! Your configuration is working correctly.');

  } catch (error: any) {
    console.log('\n❌ R2 test failed!');
    console.error('Error details:', error.message);

    if (error.message.includes('Missing R2 configuration')) {
      console.log('\n💡 Configuration Issues:');
      console.log('   - Make sure all R2 environment variables are set');
      console.log('   - Verify your R2 bucket exists and is accessible');
      console.log('   - Check that your API keys have the correct permissions');
    } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
      console.log('\n💡 Permission Issues:');
      console.log('   - Check your R2 API key permissions');
      console.log('   - Make sure the bucket allows the access you\'re trying');
      console.log('   - Verify your account ID is correct');
    } else if (error.message.includes('404') || error.message.includes('NoSuchBucket')) {
      console.log('\n💡 Bucket Issues:');
      console.log('   - Make sure the bucket name is correct');
      console.log('   - Check that the bucket exists in your R2 dashboard');
      console.log('   - Verify the bucket is in the correct account');
    } else {
      console.log('\n💡 Debug Information:');
      console.log('   - Check your R2 dashboard for any issues');
      console.log('   - Verify your internet connection');
      console.log('   - Make sure the R2 service is operational');
    }

    process.exit(1);
  }
}

// Run the test
testR2Configuration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});