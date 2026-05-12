#!/usr/bin/env node

/**
 * Engaging Networks API Test Script
 *
 * Tests the full EN API flow:
 * 1. Authenticate and get auth token
 * 2. Get all pages of type 'nd' (regardless of status)
 * 3. Get detailed info for each page
 */

require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

const EN_BASE_URL = process.env.EN_BASE_URL;
const EN_API_TOKEN = process.env.EN_API_TOKEN;

if (!EN_BASE_URL || !EN_API_TOKEN) {
  console.error('❌ Missing environment variables!');
  console.error('   EN_BASE_URL:', EN_BASE_URL ? '✅' : '❌');
  console.error('   EN_API_TOKEN:', EN_API_TOKEN ? '✅' : '❌');
  process.exit(1);
}

// Create axios instance
const client = axios.create({
  baseURL: EN_BASE_URL,
  timeout: 30000,
  headers: {
    Accept: 'application/json',
  },
});

let ensAuthToken = null;

/**
 * Step 1: Authenticate with EN
 */
async function authenticate() {
  console.log('\n📝 Step 1: Authenticating with Engaging Networks...');
  console.log('   Base URL:', EN_BASE_URL);
  console.log('   API Token:', EN_API_TOKEN.substring(0, 8) + '...');

  try {
    const response = await client.post('/authenticate', EN_API_TOKEN, {
      headers: {
        'Content-Type': 'application/json',
      },
      transformRequest: [(data) => data], // Send as-is, don't JSON.stringify
    });

    console.log('   Response status:', response.status);
    console.log('   Response data:', response.data);

    ensAuthToken = response.data['ens-auth-token'];

    if (!ensAuthToken) {
      throw new Error('No ens-auth-token in response');
    }

    console.log('✅ Authentication successful!');
    console.log('   Auth token:', ensAuthToken.substring(0, 8) + '...');
    console.log('   Expires in:', response.data.expires, 'ms');

    return ensAuthToken;
  } catch (error) {
    console.error('❌ Authentication failed:');
    console.error('   Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Step 2: Get all pages of type 'nd' (regardless of status)
 */
async function getPages(type = 'nd', status = '', limit = 100, offset = 0) {
  console.log(`\n📋 Step 2: Fetching pages (type=${type || 'all'}, status=${status || 'all'})...`);

  try {
    const params = { limit, offset };
    if (type) params.type = type;
    if (status) params.status = status;

    console.log('   Params:', params);

    const response = await client.get('/page', {
      params,
      headers: {
        'ens-auth-token': ensAuthToken,
      },
    });

    const pages = response.data;
    console.log('✅ Pages retrieved successfully!');
    console.log('   Count:', pages.length);

    if (pages.length > 0) {
      console.log('\n   Pages found:');
      pages.forEach((page, i) => {
        console.log(`   ${i + 1}. ${page.name}`);
        console.log(`      ID: ${page.id}`);
        console.log(`      Type: ${page.type}`);
        console.log(`      Status: ${page.status}`);
        console.log(`      URL: ${page.url}`);
        console.log('');
      });
    } else {
      console.log('   ⚠️  No pages found with these criteria');
    }

    return pages;
  } catch (error) {
    console.error('❌ Failed to get pages:');
    console.error('   Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Step 3: Get detailed info for a specific page
 */
async function getPageDetails(pageId, pageName) {
  console.log(`\n🔍 Step 3: Getting details for page: ${pageName} (${pageId})...`);

  try {
    const response = await client.get(`/page/${pageId}`, {
      headers: {
        'ens-auth-token': ensAuthToken,
      },
    });

    const page = response.data;
    console.log('✅ Page details retrieved!');
    console.log('   Name:', page.name);
    console.log('   ID:', page.id);
    console.log('   Type:', page.type);
    console.log('   Status:', page.status);
    console.log('   URL:', page.url);
    console.log('   Created:', page.createdDate);
    console.log('   Modified:', page.modifiedDate);

    if (page.formFields) {
      console.log('   Form fields:', page.formFields.length);
      page.formFields.slice(0, 5).forEach((field) => {
        console.log(`     - ${field.name} (${field.type})${field.required ? ' *required' : ''}`);
      });
      if (page.formFields.length > 5) {
        console.log(`     ... and ${page.formFields.length - 5} more`);
      }
    }

    return page;
  } catch (error) {
    console.error('❌ Failed to get page details:');
    console.error('   Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Engaging Networks API Test Script');
  console.log('=====================================');

  try {
    // Step 1: Authenticate
    await authenticate();

    // Step 2: Get all 'nd' pages (no status filter)
    const pages = await getPages('nd', '', 100, 0);

    // If no pages found with 'nd' type, try without type filter
    if (pages.length === 0) {
      console.log('\n⚠️  No "nd" type pages found. Trying all types...');
      const allPages = await getPages('', '', 100, 0);

      if (allPages.length > 0) {
        // Get details for first 3 pages
        console.log(`\n📊 Getting details for first ${Math.min(3, allPages.length)} pages...`);
        for (let i = 0; i < Math.min(3, allPages.length); i++) {
          await getPageDetails(allPages[i].id, allPages[i].name);
        }
      }
    } else {
      // Get details for first 3 'nd' pages
      console.log(`\n📊 Getting details for first ${Math.min(3, pages.length)} pages...`);
      for (let i = 0; i < Math.min(3, pages.length); i++) {
        await getPageDetails(pages[i].id, pages[i].name);
      }
    }

    console.log('\n✅ Test completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   Total pages found:', pages.length);
    console.log('   Type filter: nd');
    console.log('   Status filter: (none)');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
