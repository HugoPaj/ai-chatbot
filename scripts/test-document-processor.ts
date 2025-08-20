/**
 * Test script to verify document processor works without hardcoded file issues
 */

import 'dotenv/config';

async function testDocumentProcessor() {
  console.log('🧪 Testing document processor import...');
  
  try {
    // Import the document processor
    const { DocumentProcessor } = await import('../lib/ai/documentProcessor');
    
    console.log('✅ DocumentProcessor imported successfully');
    console.log('✅ No hardcoded file access during module load');
    
    // Test if the module exports are available
    if (typeof DocumentProcessor.processPDF === 'function') {
      console.log('✅ processPDF method available');
    }
    
    if (typeof DocumentProcessor.processImage === 'function') {
      console.log('✅ processImage method available');
    }
    
    return true;
  } catch (error) {
    console.error('❌ DocumentProcessor import failed:', error);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting document processor test...\n');
  
  const success = await testDocumentProcessor();
  
  if (success) {
    console.log('\n🎉 Document processor test passed!');
    console.log('The pdf-parse hardcoded file issue has been resolved.');
  } else {
    console.log('\n❌ Document processor test failed.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('🚨 Unexpected error:', error);
  process.exit(1);
});