/**
 * Test script to verify Cohere embeddings integration
 * 
 * Usage:
 *   tsx scripts/test-cohere-embeddings.ts
 * 
 * Make sure you have COHERE_API_KEY set in your environment
 */

import 'dotenv/config';
import { CohereEmbeddingService } from '../lib/ai/cohereEmbeddings';

async function testTextEmbeddings() {
  console.log('🧪 Testing text embeddings...');
  
  try {
    const testText = 'This is a test document about artificial intelligence and machine learning.';
    
    console.log(`📝 Input text: "${testText}"`);
    
    const embedding = await CohereEmbeddingService.generateTextEmbedding(
      testText,
      'search_document'
    );
    
    console.log(`✅ Generated text embedding with ${embedding.length} dimensions`);
    console.log(`📊 First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    
    // Test query embedding
    const queryEmbedding = await CohereEmbeddingService.generateTextEmbedding(
      'What is AI?',
      'search_query'
    );
    
    console.log(`✅ Generated query embedding with ${queryEmbedding.length} dimensions`);
    
    return true;
  } catch (error) {
    console.error('❌ Text embedding test failed:', error);
    return false;
  }
}

async function testImageEmbeddings() {
  console.log('\n🧪 Testing image embeddings...');
  
  try {
    // Create a simple test base64 image (1x1 red pixel PNG)
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    
    console.log(`🖼️ Testing with 1x1 pixel test image`);
    
    const embedding = await CohereEmbeddingService.generateImageEmbedding(
      testImageBase64,
      'search_document'
    );
    
    console.log(`✅ Generated image embedding with ${embedding.length} dimensions`);
    console.log(`📊 First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    
    return true;
  } catch (error) {
    console.error('❌ Image embedding test failed:', error);
    return false;
  }
}

async function testMultimodalEmbeddings() {
  console.log('\n🧪 Testing multimodal embeddings (separate calls)...');
  
  try {
    const textInput = { type: 'text' as const, text: 'A red square image' };
    const imageInput = { 
      type: 'image' as const, 
      image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==' 
    };
    
    // Test text
    const textEmbeddings = await CohereEmbeddingService.generateMultimodalEmbeddings(
      [textInput],
      'search_document'
    );
    
    console.log(`✅ Generated ${textEmbeddings.length} text embedding(s)`);
    
    // Test image
    const imageEmbeddings = await CohereEmbeddingService.generateMultimodalEmbeddings(
      [imageInput],
      'search_document'
    );
    
    console.log(`✅ Generated ${imageEmbeddings.length} image embedding(s)`);
    
    return true;
  } catch (error) {
    console.error('❌ Multimodal embedding test failed:', error);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting Cohere embeddings tests...\n');
  
  // Check for API key
  const apiKey = process.env.COHERE_API_KEY || process.env.CO_API_KEY;
  if (!apiKey) {
    console.error('❌ COHERE_API_KEY or CO_API_KEY environment variable is not set');
    console.error('Please set your Cohere API key in your .env file');
    process.exit(1);
  }
  
  console.log('✅ Cohere API key is configured');
  
  const results = await Promise.allSettled([
    testTextEmbeddings(),
    testImageEmbeddings(),
    testMultimodalEmbeddings()
  ]);
  
  const successes = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  const total = results.length;
  
  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${successes}/${total} tests`);
  
  if (successes === total) {
    console.log('\n🎉 All tests passed! Cohere integration is working correctly.');
    console.log('\n📝 Next steps:');
    console.log('1. Update your .env file to include COHERE_API_KEY');
    console.log('2. The VectorStore will now use Cohere embed-v4.0 with 1536-dimensional embeddings');
    console.log('3. Consider running the indexing script to re-index your documents with Cohere embeddings');
  } else {
    console.log('\n❌ Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('🚨 Unexpected error:', error);
  process.exit(1);
});