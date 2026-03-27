/**
 * GitHub Access Setup Script for SmartMouse
 * This script guides the user through setting up GitHub access
 */

import { execSync } from 'child_process';
import { createGitHubConfig } from './github-integration.js';

function openUrl(url: string) {
  // Cross-platform way to open URLs
  const platform = process.platform;
  let command;

  switch (platform) {
    case 'win32':
      command = `start ${url}`;
      break;
    case 'darwin': // macOS
      command = `open ${url}`;
      break;
    case 'linux':
      command = `xdg-open ${url}`;
      break;
    default:
      console.log(`Please open this URL in your browser: ${url}`);
      return;
  }

  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`Opening ${url} in your default browser...`);
  } catch (error) {
    console.log(`Failed to open browser automatically. Please open this URL manually: ${url}`);
  }
}

async function setupGitHubAccess() {
  console.log('🔐 Setting up GitHub Access for SmartMouse...\n');
  
  console.log('Step 1: We need to create a GitHub Personal Access Token');
  console.log('     This will allow SmartMouse to interact with GitHub on your behalf\n');
  
  console.log('Step 2: Opening GitHub Personal Access Token creation page...');
  console.log('     Please follow these steps after the page opens:\n');
  
  console.log('     1. Click "Generate new token" -> "Generate new token (classic)"');
  console.log('     2. Give your token a descriptive name (e.g., "SmartMouse Token")');
  console.log('     3. Set expiration to "No expiration" or your preferred duration');
  console.log('     4. Under "Select scopes", check the following:');
  console.log('        - [x] repo (Full control of private repositories)');
  console.log('        - [x] read:org (Read org membership and teams)');
  console.log('        - [x] gist (Create and edit gists)');
  console.log('        - [x] user (Update user profile)');
  console.log('     5. Click "Generate token"');
  console.log('     6. Copy the generated token (IMPORTANT: You won\'t see it again!)');
  console.log('     7. Save the token to a file named github-config.json in this directory\n');
  
  console.log('📋 To complete the setup:');
  console.log('   1. Press any key to open the GitHub token creation page in your browser');
  console.log('   2. Follow the steps above to create your token');
  console.log('   3. Create a file named github-config.json with this format:');
  console.log('      {');
  console.log('        "token": "your_copied_token_here",');
  console.log('        "baseUrl": "https://api.github.com"');
  console.log('      }');
  console.log('');
  console.log('   4. After creating the file, test the connection with:');
  console.log('      npx tsx test-github.ts\n');
  
  // Open the GitHub token creation page
  console.log('Opening GitHub token creation page...');
  openUrl('https://github.com/settings/tokens');
  
  console.log('\n🎉 Instructions displayed above. Please follow them to complete the setup!');
}

// Run the setup
setupGitHubAccess();
