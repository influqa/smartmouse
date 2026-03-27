/**
 * Test script for GitHub Integration
 * This script tests the basic functionality of the GitHub integration module
 */

import { initGitHubIntegration, createGitHubConfig } from './github-integration.js';

async function testGitHubIntegration() {
  console.log('🧪 Testing GitHub Integration...\n');

  try {
    // Try to initialize GitHub integration
    // This will fail if github-config.json doesn't exist
    console.log('🔐 Attempting to initialize GitHub integration...');
    
    try {
      const github = await initGitHubIntegration();
      
      // Test getting user info
      console.log('👤 Getting user information...');
      const user = await github.getUser();
      console.log(`   ✓ Authenticated as: ${user.login}`);
      
      // Test listing repositories
      console.log('📚 Listing repositories...');
      const repos = await github.listRepositories();
      console.log(`   ✓ Found ${repos.length} repositories`);
      
      // Show first 3 repositories if any exist
      if (repos.length > 0) {
        console.log('   First 3 repositories:');
        repos.slice(0, 3).forEach(repo => {
          console.log(`   - ${repo.full_name} (${repo.private ? 'private' : 'public'})`);
        });
      }
      
      console.log('\n✅ GitHub Integration test passed!');
      console.log('ℹ️  You are successfully authenticated with GitHub.');
      console.log('ℹ️  You can now use the GitHub integration module for automation tasks.');
      
    } catch (error) {
      console.log('   ✗ Failed to authenticate with GitHub');
      console.error(`   Error: ${(error as Error).message}`);
      
      console.log('\n📋 To set up GitHub authentication:');
      console.log('   1. Create a GitHub personal access token at:');
      console.log('      https://github.com/settings/tokens');
      console.log('   2. Include these scopes: repo, read:org, gist, user');
      console.log('   3. Run this command with your token:');
      console.log('      npx tsx test-github.ts <your-token-here>');
      console.log('');
    }
  } catch (error) {
    console.error('❌ Test failed with error:', (error as Error).message);
  }
}

// If a command line argument is provided, treat it as a token and create config
if (process.argv[2]) {
  const token = process.argv[2];
  console.log(`🔑 Setting up GitHub config with provided token...`);
  createGitHubConfig(token);
  console.log('✅ GitHub config created. Running test...\n');
}

// Run the test
testGitHubIntegration();