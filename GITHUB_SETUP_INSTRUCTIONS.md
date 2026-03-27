# GitHub Integration Setup for SmartMouse

This document provides step-by-step instructions to set up GitHub integration for SmartMouse.

## Step 1: Create a GitHub Personal Access Token

1. Visit [GitHub Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token" -> "Generate new token (classic)"
3. Give your token a descriptive name (e.g., "SmartMouse Token")
4. Set expiration to "No expiration" or your preferred duration
5. Under "Select scopes", check the following:
   - [x] `repo` - Full control of private repositories
   - [x] `read:org` - Read org membership and teams
   - [x] `gist` - Create and edit gists
   - [x] `user` - Update user profile
6. Click "Generate token"
7. **Copy the generated token** (IMPORTANT: You won't see it again!)

## Step 2: Create the Configuration File

After obtaining your token, create a file named `github-config.json` in the project root with the following format:

```json
{
  "token": "your_copied_token_here",
  "baseUrl": "https://api.github.com"
}
```

Alternatively, you can create the file using the command line:

```bash
echo '{"token":"your_token_here","baseUrl":"https://api.github.com"}' > github-config.json
```

## Step 3: Verify the Configuration

To verify that your configuration is correct, run:

```bash
npx tsx validate-config.ts
```

## Step 4: Test the Connection

Once your configuration is validated, test the connection with:

```bash
npx tsx test-github.ts
```

## Step 5: Use the GitHub Integration

After successful setup, you can use the GitHub integration in your SmartMouse agents:

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

## Additional Resources

- [Complete API Documentation](./GITHUB_INTEGRATION.md)
- [Example Implementation](./github-example.ts)
- [Setup Script](./setup-github-access.ts) (already run)
- [Validation Script](./validate-config.ts)
- [Test Script](./test-github.ts)

## Troubleshooting

- If you get 401 errors, check that your token is valid and has the correct scopes
- If you get 403 errors, check that your token has sufficient permissions
- If you get 404 errors, verify that the repository/owner names are correct
- Rate limiting may occur with frequent API calls; implement appropriate delays if needed