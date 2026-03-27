## GitHub Integration

SmartMouse now includes GitHub integration capabilities that allow automated agents to interact with GitHub repositories. This enables SmartMouse agents to create, manage, and update repositories programmatically.

### Features

- **Authentication**: Secure GitHub API authentication using personal access tokens
- **Repository Management**: Create, update, list, and delete repositories
- **File Operations**: Create, update, and read files in repositories
- **Branch Management**: Create new branches and manage commits
- **Pull Requests**: Create pull requests between branches
- **Collaborator Management**: Add and manage repository collaborators

### Setup

To use the GitHub integration, you need to:

1. Create a GitHub personal access token with the following scopes:
   - `repo` - Full control of private repositories
   - `read:org` - Read org membership and teams
   - `gist` - Create and edit gists
   - `user` - Update user profile

2. Create a `github-config.json` file in the project root:

```json
{
  "token": "your_github_personal_access_token",
  "username": "your_github_username",
  "baseUrl": "https://api.github.com"
}
```

### Usage

Run the example to test the integration:

```bash
npx tsx github-example.ts
```

Or run the test script:

```bash
npx tsx test-github.ts
```

### Configuration

The GitHub integration module exports several useful functions:

- `initGitHubIntegration()` - Initialize the integration from config file
- `createGitHubConfig(token)` - Create a config file with a token
- `GitHubIntegration` class - Main class for GitHub operations

### Example Code

```typescript
import { initGitHubIntegration } from './github-integration.ts';

async function example() {
  const github = await initGitHubIntegration();
  
  // Get user info
  const user = await github.getUser();
  
  // Create a repository
  const repo = await github.createRepository({
    name: 'my-new-repo',
    description: 'Created by SmartMouse agent',
    private: false
  });
  
  // Add a file
  await github.createOrUpdateFile(user.login, repo.name, {
    path: 'README.md',
    content: '# My Project\nCreated by SmartMouse agent.',
    message: 'Add README via SmartMouse'
  });
}
```

For complete API documentation, see [GITHUB_INTEGRATION.md](./GITHUB_INTEGRATION.md).