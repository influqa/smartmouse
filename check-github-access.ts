/**
 * Check GitHub Access in VS Code Environment
 * This script checks various locations where VS Code might store GitHub credentials
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

async function checkGitHubAccess() {
  console.log('🔍 Checking GitHub access in VS Code environment...\n');
  
  // Check 1: Check if github-config.json exists (our custom integration)
  console.log('📋 Checking for SmartMouse GitHub configuration...');
  if (fs.existsSync('./github-config.json')) {
    console.log('✅ github-config.json found (created for SmartMouse integration)');
    try {
      const config = JSON.parse(fs.readFileSync('./github-config.json', 'utf8'));
      if (config.token) {
        console.log(`   Token present: Yes (${config.token.substring(0, 10)}...)`);
      }
    } catch (e) {
      console.log('   ⚠️  Invalid JSON in config file');
    }
  } else {
    console.log('❌ github-config.json not found (needed for SmartMouse GitHub integration)');
    console.log('   Run: npx tsx setup-github-access.ts to create it');
  }
  
  console.log('');
  
  // Check 2: Check Git global configuration
  console.log('🔧 Checking Git configuration...');
  try {
    const { execSync } = await import('child_process');
    
    try {
      const userName = execSync('git config --global user.name', { encoding: 'utf8' }).trim();
      if (userName) {
        console.log(`   Git user.name: ${userName}`);
      } else {
        console.log('   Git user.name: Not set');
      }
    } catch {
      console.log('   Git user.name: Not set or git not accessible');
    }
    
    try {
      const userEmail = execSync('git config --global user.email', { encoding: 'utf8' }).trim();
      if (userEmail) {
        console.log(`   Git user.email: ${userEmail}`);
      } else {
        console.log('   Git user.email: Not set');
      }
    } catch {
      console.log('   Git user.email: Not set or git not accessible');
    }
  } catch (e) {
    console.log('   Could not check git configuration');
  }
  
  console.log('');
  
  // Check 3: Check for GitHub CLI configuration
  console.log('🖥️  Checking for GitHub CLI authentication...');
  try {
    const { spawnSync } = await import('child_process');
    const result = spawnSync('gh', ['auth', 'status'], { stdio: 'pipe' });
    
    if (result.status === 0) {
      console.log('✅ GitHub CLI is authenticated');
    } else {
      console.log('❌ GitHub CLI is not installed or not authenticated');
      console.log('   To install GitHub CLI: https://cli.github.com/');
      console.log('   To authenticate: gh auth login');
    }
  } catch (e) {
    console.log('❌ GitHub CLI is not installed or not authenticated');
    console.log('   To install GitHub CLI: https://cli.github.com/');
    console.log('   To authenticate: gh auth login');
  }
  
  console.log('');
  
  // Check 4: Check VS Code GitHub-related directories
  console.log('.VisualStudio Code GitHub extension check...');
  const vscodeDir = path.join(os.homedir(), '.vscode');
  const vscodeExtensionsDir = path.join(os.homedir(), '.vscode', 'extensions');
  
  if (fs.existsSync(vscodeExtensionsDir)) {
    const extensions = fs.readdirSync(vscodeExtensionsDir);
    const githubExtensions = extensions.filter(ext => 
      ext.toLowerCase().includes('github') || ext.toLowerCase().includes('ms-vscode.vscode-github')
    );
    
    if (githubExtensions.length > 0) {
      console.log(`   ✅ Found GitHub-related extensions: ${githubExtensions.join(', ')}`);
    } else {
      console.log('   ❌ No GitHub-related extensions found');
    }
  } else {
    console.log('   ℹ️  VS Code extensions directory not found');
  }
  
  console.log('');
  
  // Check 5: Check for common GitHub credential files
  console.log('🔑 Checking for GitHub credential files...');
  const possibleCredentialPaths = [
    path.join(os.homedir(), '.git-credentials'),
    path.join(os.homedir(), '.config', 'git', 'credentials'),
    path.join(process.env.LOCALAPPDATA || '', 'GitHub', 'host'),
    path.join(os.homedir(), '.config', 'gh', 'hosts.yml')
  ];
  
  let foundCredentials = false;
  for (const credPath of possibleCredentialPaths) {
    if (credPath && fs.existsSync(credPath)) {
      console.log(`   ✅ Found credential file: ${credPath}`);
      foundCredentials = true;
    }
  }
  
  if (!foundCredentials) {
    console.log('   ❌ No GitHub credential files found');
  }
  
  console.log('\n--- Summary ---');
  console.log('VS Code GitHub access depends on:');
  console.log('1. GitHub extension installed in VS Code');
  console.log('2. GitHub account signed in through VS Code');
  console.log('3. Git configured with your GitHub email/name');
  console.log('');
  console.log('To sign in to GitHub in VS Code:');
  console.log('1. Open VS Code Command Palette (Ctrl+Shift+P)');
  console.log('2. Type "GitHub: Sign In"');
  console.log('3. Follow the authentication flow');
  console.log('');
  console.log('For SmartMouse GitHub integration:');
  console.log('1. Run: npx tsx setup-github-access.ts');
  console.log('2. Follow the instructions to create github-config.json');
}
  
// Run the check
checkGitHubAccess();