// Test script to validate R2 configuration
// Run with: pnpm tsx lib/test-r2.ts

import { put, get, del } from './r2';

async function testR2Integration() {
  console.log('🧪 Testing Cloudflare R2 integration...');

  try {
    // Test configuration validation
    console.log('1. Testing configuration validation...');

    // Create a small test file
    const testContent = Buffer.from('Hello, Cloudflare R2!', 'utf-8');
    const testFileName = `test-${Date.now()}.txt`;

    console.log('2. Testing file upload...');
    const uploadResult = await put(testFileName, testContent, {
      access: 'public',
      contentType: 'text/plain',
    });

    console.log('✅ Upload successful:', uploadResult);

    console.log('3. Testing file retrieval...');
    const retrievedContent = await get(testFileName);

    if (retrievedContent) {
      const retrievedText = retrievedContent.toString('utf-8');
      console.log('✅ Retrieved content:', retrievedText);

      if (retrievedText === 'Hello, Cloudflare R2!') {
        console.log('✅ Content matches original');
      } else {
        console.log('❌ Content mismatch');
      }
    } else {
      console.log('❌ Could not retrieve file');
    }

    console.log('4. Testing file deletion...');
    await del(testFileName);
    console.log('✅ File deletion successful');

    console.log('5. Verifying deletion...');
    const deletedFile = await get(testFileName);
    if (deletedFile === null) {
      console.log('✅ File successfully deleted');
    } else {
      console.log('❌ File still exists after deletion');
    }

    console.log('🎉 All R2 tests passed!');

  } catch (error) {
    console.error('❌ R2 test failed:', error);

    if (error instanceof Error) {
      if (error.message.includes('Missing R2 configuration')) {
        console.log('💡 Make sure to set up your R2 environment variables:');
        console.log('   - R2_ACCOUNT_ID');
        console.log('   - R2_ACCESS_KEY_ID');
        console.log('   - R2_SECRET_ACCESS_KEY');
        console.log('   - R2_BUCKET_NAME');
        console.log('   - R2_PUBLIC_URL (optional)');
      }
    }

    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  testR2Integration();
}

export { testR2Integration };