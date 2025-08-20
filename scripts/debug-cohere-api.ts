/**
 * Debug script to test Cohere API call structure
 */

import 'dotenv/config';
import { CohereClient } from 'cohere-ai';

async function testCohereAPI() {
  console.log('🔍 Testing Cohere API call structure...');
  
  const apiKey = process.env.COHERE_API_KEY || process.env.CO_API_KEY;
  if (!apiKey) {
    console.error('❌ No API key found');
    return;
  }
  
  const client = new CohereClient({
    apiKey: apiKey,
  });
  
  // Test 1: Simple texts parameter
  console.log('\n🧪 Test 1: Using texts parameter');
  try {
    const response1 = await client.embed({
      model: 'embed-v4.0',
      texts: ['Hello world'],
      inputType: 'search_document',
      embeddingTypes: ['float'],
    });
    console.log('✅ Success with texts parameter');
    console.log(`📊 Embeddings shape: ${response1.embeddings?.length} x ${response1.embeddings?.[0]?.length}`);
  } catch (error: any) {
    console.log('❌ Failed with texts parameter:', error.message);
    if (error.body) {
      console.log('📄 Error body:', JSON.stringify(error.body, null, 2));
    }
  }
  
  // Test 2: inputs parameter with text
  console.log('\n🧪 Test 2: Using inputs parameter for text');
  try {
    const response2 = await client.embed({
      model: 'embed-v4.0',
      inputs: [
        {
          content: [
            {
              type: 'text',
              text: 'Hello world'
            }
          ]
        }
      ],
      inputType: 'search_document',
      embeddingTypes: ['float'],
    });
    console.log('✅ Success with inputs parameter');
    console.log(`📊 Embeddings shape: ${response2.embeddings?.length} x ${response2.embeddings?.[0]?.length}`);
  } catch (error: any) {
    console.log('❌ Failed with inputs parameter:', error.message);
    if (error.body) {
      console.log('📄 Error body:', JSON.stringify(error.body, null, 2));
    }
  }
  
  // Test 3: Check SDK version and available methods
  console.log('\n🔍 SDK Information:');
  console.log('Client methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
}

testCohereAPI().catch(console.error);