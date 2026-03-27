# GitHub Integration for SmartMouse Agents

This module provides GitHub authentication and repository management functionality for SmartMouse agents, allowing them to create, update, and edit repositories programmatically.

## Setup

### 1. Create a GitHub Personal Access Token

1. Go to GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)
2. Generate a new token with the following scopes:
   - `repo` - Full control of private repositories
   - `read:org` - Read org membership and teams
   - `gist` - Create and edit gists
   - `user` - Update user profile

### 2. Create the Configuration File

Create a `github-config.json` file in your project root:

```bash
node -e "
const fs = require('fs');
const config = {
  token: 'YOUR_GITHUB_TOKEN_HERE',
  username: 'your-github-username', // optional
  baseUrl: 'https://api.github.com' // optional, defaults to this
};
fs.writeFileSync('./github-config.json', JSON.stringify(config, null, 2));
console.log('github-config.json created');
"
```

Or manually create the file:

```json
{
  "token": "ghp_your_token_here",
  "username": "your-github-username",
  "baseUrl": "https://api.github.com"
}
```

## Usage

### Import the Module

```typescript
import { initGitHubIntegration, GitHubIntegration } from './github-integration.ts';
```

### Initialize the Integration

```typescript
// Initialize from config file (default: ./github-config.json)
const github = await initGitHubIntegration();

// Or initialize directly with config
const github = new GitHubIntegration({
  token: 'your_github_token',
  username: 'your_username'
});
```

## Available Methods

### Authentication & User Info

```typescript
// Get authenticated user info
const user = await github.getUser();
console.log(user.login); // Your GitHub username
```

### Repository Operations

```typescript
// Create a new repository
await github.createRepository({
  name: 'my-new-repo',
  description: 'A new repository created via SmartMouse',
  private: false,
  auto_init: true,
  gitignore_template: 'Node',
  license_template: 'mit'
});

// Get repository info
const repo = await github.getRepository('owner', 'repo-name');

// Update repository settings
await github.updateRepository('owner', 'repo-name', {
  description: 'Updated description',
  private: true
});

// List user's repositories
const repos = await github.listRepositories();

// Delete a repository (be careful!)
await github.deleteRepository('owner', 'repo-name');
```

### File Operations

```typescript
// Create or update a file
await github.createOrUpdateFile('owner', 'repo-name', {
  path: 'README.md',
  content: '# My Project\n\nCreated by SmartMouse agent.',
  message: 'Add README via SmartMouse agent'
});

// Get file content
const file = await github.getFileContent('owner', 'repo-name', 'README.md');
if (file) {
  console.log(file.decodedContent); // The actual file content
}

// List files in a directory
const files = await github.listFiles('owner', 'repo-name', 'src/');
```

### Branch and Commit Operations

```typescript
// Create a new branch
await github.createBranch('owner', 'repo-name', 'feature/new-feature', 'main');

// Create a commit with file changes
await github.createCommit(
  'owner', 
  'repo-name', 
  'feature/new-feature', 
  'Add new feature via SmartMouse agent',
  [
    {
      path: 'src/new-feature.js',
      content: '// New feature code here'
    }
  ]
);
```

### Pull Requests

```typescript
// Create a pull request
await github.createPullRequest(
  'owner',
  'repo-name',
  'New Feature: Add via SmartMouse',
  'This PR was created automatically by a SmartMouse agent',
  'feature/new-feature', // source branch
  'main' // target branch
);
```

### Collaborator Management

```typescript
// Get repository collaborators
const collaborators = await github.getCollaborators('owner', 'repo-name');

// Add a collaborator
await github.addCollaborator('owner', 'repo-name', 'username', 'push'); // push, pull, or admin
```

## Example: Complete Agent Workflow

```typescript
import { initGitHubIntegration } from './github-integration.ts';

async function githubAgentWorkflow() {
  try {
    // Initialize GitHub integration
    const github = await initGitHubIntegration();
    
    // Get user info
    const user = await github.getUser();
    console.log(`Authenticated as: ${user.login}`);
    
    // Create a new repository
    const newRepo = await github.createRepository({
      name: 'smartmouse-generated-project',
      description: 'Project created by SmartMouse agent',
      private: false
    });
    
    console.log(`Created repository: ${newRepo.html_url}`);
    
    // Add a README file
    await github.createOrUpdateFile(newRepo.owner.login, newRepo.name, {
      path: 'README.md',
      content: `# ${newRepo.name}\n\nThis project was created by a SmartMouse agent.`,
      message: 'Initial commit by SmartMouse agent'
    });
    
    // Add a package.json file
    await github.createOrUpdateFile(newRepo.owner.login, newRepo.name, {
      path: 'package.json',
      content: JSON.stringify({
        name: newRepo.name,
        version: '1.0.0',
        description: 'Project created by SmartMouse agent',
        main: 'index.js',
        scripts: {
          test: 'echo "Error: no test specified" && exit 1'
        },
        keywords: ['smartmouse', 'automated'],
        author: user.login,
        license: 'MIT'
      }, null, 2),
      message: 'Add package.json by SmartMouse agent'
    });
    
    console.log('Repository setup complete!');
  } catch (error) {
    console.error('GitHub operation failed:', error.message);
  }
}

// Run the workflow
githubAgentWorkflow();
```

## Security Notes

- Store your GitHub token securely and never commit it to version control
- Use environment variables or secure configuration files
- Limit token permissions to only what's necessary
- Regularly rotate your tokens
- Be careful with repository deletion operations

## Error Handling

All methods will throw an error if the GitHub API request fails. Always wrap calls in try-catch blocks:

```typescript
try {
  await github.createRepository({...});
} catch (error) {
  console.error('Repository creation failed:', error.message);
}
```

## Troubleshooting

- If you get 401 errors, check that your token is valid and has the correct scopes
- If you get 403 errors, check that your token has sufficient permissions
- If you get 404 errors, verify that the repository/owner names are correct
- Rate limiting may occur with frequent API calls; implement appropriate delays if needed