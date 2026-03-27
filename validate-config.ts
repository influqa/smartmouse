/**
 * Validate GitHub Configuration
 * Checks if github-config.json exists and has the required fields
 */

import fs from 'fs';

function validateConfig() {
  console.log('🔍 Validating GitHub configuration...\n');
  
  try {
    // Check if config file exists
    if (!fs.existsSync('./github-config.json')) {
      console.log('❌ github-config.json file not found!');
      console.log('\n📋 To create it, run:');
      console.log('   echo \'{"token":"your_token_here","baseUrl":"https://api.github.com"}\' > github-config.json');
      console.log('\n   Or create the file manually with the format:');
      console.log('   {');
      console.log('     "token": "your_github_personal_access_token",');
      console.log('     "baseUrl": "https://api.github.com"');
      console.log('   }');
      return false;
    }
    
    // Read and parse the config
    const configContent = fs.readFileSync('./github-config.json', 'utf8');
    let config: any;
    
    try {
      config = JSON.parse(configContent);
    } catch (parseError) {
      console.log('❌ Invalid JSON in github-config.json!');
      console.log('   Please check the file format and ensure it contains valid JSON.');
      return false;
    }
    
    // Validate required fields
    if (!config.token) {
      console.log('❌ Missing "token" field in github-config.json!');
      console.log('   The token is required to authenticate with GitHub API.');
      return false;
    }
    
    // Basic token validation (should start with ghp_ for classic tokens)
    if (typeof config.token !== 'string' || !config.token.startsWith('gh')) {
      console.log('⚠️  The token format looks unusual.');
      console.log('   GitHub tokens typically start with "gh" (e.g., "ghp_" for classic tokens or "github_pat_" for fine-grained).');
      console.log('   Please verify your token is correct.');
    }
    
    if (!config.baseUrl) {
      console.log('⚠️  Missing "baseUrl" field in github-config.json.');
      console.log('   Defaulting to "https://api.github.com"');
      config.baseUrl = 'https://api.github.com';
    }
    
    console.log('✅ github-config.json is valid!');
    console.log(`   - Token present: Yes (${config.token.substring(0, 10)}...)`);
    console.log(`   - Base URL: ${config.baseUrl}`);
    
    console.log('\n🎉 Configuration is ready to use!');
    console.log('\n🧪 To test the connection, run:');
    console.log('   npx tsx test-github.ts');
    
    return true;
  } catch (error) {
    console.log('❌ Error validating configuration:', error);
    return false;
  }
}

// Run validation
validateConfig();