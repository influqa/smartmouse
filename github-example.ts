/**
 * Example usage of GitHub Integration for SmartMouse Agents
 * This script demonstrates how to use the GitHub integration module
 */

import { initGitHubIntegration, GitHubIntegration } from './github-integration.js';

async function runGitHubExample() {
  console.log('🚀 Starting GitHub Integration Example...\n');

  try {
    // Initialize GitHub integration
    // This will look for github-config.json in the current directory
    console.log('🔐 Initializing GitHub integration...');
    const github = await initGitHubIntegration();
    
    // Get user information
    console.log('👤 Getting user information...');
    const user = await github.getUser();
    console.log(`   Authenticated as: ${user.login}\n`);

    // List current repositories
    console.log('📚 Listing current repositories...');
    const repos = await github.listRepositories();
    console.log(`   You currently have ${repos.length} repositories\n`);

    // Create a sample repository for demonstration
    console.log('🏗️ Creating a new repository...');
    const repoName = `smartmouse-test-${Date.now()}`;
    const newRepo = await github.createRepository({
      name: repoName,
      description: 'Test repository created by SmartMouse GitHub integration',
      private: false,
      auto_init: true,
      gitignore_template: 'Node',
      license_template: 'mit'
    });
    
    console.log(`   Created repository: ${newRepo.html_url}\n`);

    // Update the repository with a better README
    console.log('📝 Updating README file...');
    await github.createOrUpdateFile(user.login, repoName, {
      path: 'README.md',
      content: `# ${repoName}\n\nThis repository was created and managed by a SmartMouse agent.\n\n## About\n\nThis project demonstrates the GitHub integration capabilities of SmartMouse agents.\n\n- Created on: ${new Date().toISOString()}\n- Managed by: SmartMouse Agent\n`,
      message: 'Update README with SmartMouse details'
    });
    
    console.log('   README updated successfully\n');

    // Add a sample code file
    console.log('💻 Adding a sample code file...');
    await github.createOrUpdateFile(user.login, repoName, {
      path: 'smartmouse-agent.js',
      content: `/**
 * Sample SmartMouse Agent Script
 * This file was created by a SmartMouse agent via GitHub API
 */

function smartMouseAgent() {
  console.log('Hello, I am a SmartMouse agent!');
  console.log('I can automate GitHub operations for you.');
  
  // Sample functionality
  const capabilities = [
    'Create repositories',
    'Manage files',
    'Handle pull requests',
    'Manage collaborators'
  ];
  
  console.log('My capabilities include:');
  capabilities.forEach(cap => console.log('- ' + cap));
  
  return 'SmartMouse agent initialized successfully!';
}

// Run the agent
const result = smartMouseAgent();
console.log(result);

module.exports = { smartMouseAgent };
`,
      message: 'Add SmartMouse agent example file'
    });
    
    console.log('   Sample code file added successfully\n');

    // Add a package.json file
    console.log('📦 Adding package.json file...');
    const packageJsonContent = {
      name: repoName,
      version: '1.0.0',
      description: 'Test repository created by SmartMouse GitHub integration',
      main: 'smartmouse-agent.js',
      scripts: {
        test: 'echo "Error: no test specified" && exit 1',
        start: 'node smartmouse-agent.js'
      },
      keywords: ['smartmouse', 'automation', 'github', 'agent'],
      author: user.login,
      license: 'MIT'
    };
    
    await github.createOrUpdateFile(user.login, repoName, {
      path: 'package.json',
      content: JSON.stringify(packageJsonContent, null, 2),
      message: 'Add package.json for SmartMouse project'
    });
    
    console.log('   Package.json file added successfully\n');

    // List files in the repository
    console.log('📁 Listing files in the new repository...');
    const files = await github.listFiles(user.login, repoName);
    console.log('   Files in repository:');
    files.forEach(file => {
      console.log(`   - ${file.name} (${file.type})`);
    });
    console.log('');

    // Get the content of the README file
    console.log('📖 Reading README content...');
    const readmeContent = await github.getFileContent(user.login, repoName, 'README.md');
    if (readmeContent && readmeContent.decodedContent) {
      console.log('   README content preview:');
      console.log('   ' + readmeContent.decodedContent.substring(0, 100) + '...');
    }
    console.log('');

    console.log('✅ GitHub Integration Example Completed Successfully!');
    console.log(`🔗 Your new repository: ${newRepo.html_url}`);
    console.log(`ℹ️  Note: The repository will remain for you to explore.`);
    console.log(`🗑️  To clean up later, you can delete the repository manually or via the API.`);

  } catch (error) {
    console.error('❌ GitHub Integration Example Failed:');
    console.error(error instanceof Error ? error.message : String(error));
    
    if (error instanceof Error && error.message.includes('token')) {
      console.log('\n💡 Hint: Make sure you have created a github-config.json file with a valid GitHub token.');
      console.log('   See GITHUB_INTEGRATION.md for setup instructions.');
    }
  }
}

// Run the example
if (require.main === module) {
  runGitHubExample();
}

export { runGitHubExample };