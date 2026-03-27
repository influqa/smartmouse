/**
 * GitHub Integration Module for SmartMouse Agents
 * Provides authentication and repository management functionality
 */

import fs from 'fs';
import path from 'path';

export interface GitHubConfig {
  token: string;
  username?: string;
  baseUrl?: string;
}

export interface Repository {
  name: string;
  owner?: string;  // Made optional since when creating, it's typically the authenticated user
  description?: string;
  private?: boolean;
  auto_init?: boolean;
  gitignore_template?: string;
  license_template?: string;
}

export interface FileContent {
  path: string;
  content: string;
  message: string;
  sha?: string; // Required when updating existing files
}

export class GitHubIntegration {
  private config: GitHubConfig;
  private baseUrl: string;

  constructor(config: GitHubConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.github.com';
  }

  /**
   * Makes authenticated requests to GitHub API
   */
  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers = {
      'Authorization': `Bearer ${this.config.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'SmartMouse-Agent',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`GitHub API error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    // For endpoints that return no content (like DELETE), return success status
    if (response.status === 204) {
      return { success: true };
    }

    return await response.json();
  }

  /**
   * Get authenticated user information
   */
  async getUser(): Promise<any> {
    return await this.makeRequest('/user');
  }

  /**
   * Create a new repository
   */
  async createRepository(repo: Repository): Promise<any> {
    const payload = {
      name: repo.name,
      description: repo.description,
      private: repo.private,
      auto_init: repo.auto_init,
      gitignore_template: repo.gitignore_template,
      license_template: repo.license_template
    };

    return await this.makeRequest('/user/repos', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  /**
   * Get repository information
   */
  async getRepository(owner: string, repo: string): Promise<any> {
    return await this.makeRequest(`/repos/${owner}/${repo}`);
  }

  /**
   * Update repository settings
   */
  async updateRepository(owner: string, repo: string, updates: Partial<Repository>): Promise<any> {
    return await this.makeRequest(`/repos/${owner}/${repo}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  /**
   * Delete a repository
   */
  async deleteRepository(owner: string, repo: string): Promise<any> {
    return await this.makeRequest(`/repos/${owner}/${repo}`, {
      method: 'DELETE'
    });
  }

  /**
   * List repositories for the authenticated user
   */
  async listRepositories(): Promise<any[]> {
    return await this.makeRequest('/user/repos');
  }

  /**
   * Create or update a file in a repository
   */
  async createOrUpdateFile(owner: string, repo: string, file: FileContent): Promise<any> {
    const payload: any = {
      message: file.message,
      content: Buffer.from(file.content, 'utf-8').toString('base64')
    };

    if (file.sha) {
      payload.sha = file.sha;
    }

    return await this.makeRequest(`/repos/${owner}/${repo}/contents/${file.path}`, {
      method: file.sha ? 'PUT' : 'PUT', // Both create and update use PUT
      body: JSON.stringify(payload)
    });
  }

  /**
   * Get file content from a repository
   */
  async getFileContent(owner: string, repo: string, filePath: string): Promise<any> {
    try {
      const response = await this.makeRequest(`/repos/${owner}/${repo}/contents/${filePath}`);
      
      if (response.encoding === 'base64') {
        response.decodedContent = Buffer.from(response.content, 'base64').toString('utf-8');
      }
      
      return response;
    } catch (error) {
      // If file doesn't exist, return null
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List files in a repository directory
   */
  async listFiles(owner: string, repo: string, directory = ''): Promise<any[]> {
    const path = directory ? `/${directory}` : '';
    return await this.makeRequest(`/repos/${owner}/${repo}/contents${path}`);
  }

  /**
   * Create a new branch
   */
  async createBranch(owner: string, repo: string, branchName: string, sourceBranch = 'main'): Promise<any> {
    // First get the SHA of the source branch
    const sourceRef = await this.makeRequest(`/repos/${owner}/${repo}/git/refs/heads/${sourceBranch}`);
    const sourceSha = sourceRef.object.sha;

    // Create the new branch
    return await this.makeRequest(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: sourceSha
      })
    });
  }

  /**
   * Create a commit in a specific branch
   */
  async createCommit(
    owner: string, 
    repo: string, 
    branchName: string, 
    message: string, 
    fileUpdates: Array<{ path: string; content: string; sha?: string }>
  ): Promise<any> {
    // Get the current tree SHA for the branch
    const branchRef = await this.makeRequest(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`);
    const branchSha = branchRef.object.sha;
    
    const commit = await this.makeRequest(`/repos/${owner}/${repo}/git/commits/${branchSha}`);
    const baseTreeSha = commit.tree.sha;

    // Create blobs for each file
    const treeItems = await Promise.all(fileUpdates.map(async (file) => {
      const blobResponse = await this.makeRequest(`/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({
          content: file.content
        })
      });

      return {
        path: file.path,
        mode: '100644', // File mode for blob
        type: 'blob',
        sha: blobResponse.sha
      };
    }));

    // Create a new tree
    const treeResponse = await this.makeRequest(`/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems
      })
    });

    // Create the commit
    const commitResponse = await this.makeRequest(`/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: message,
        tree: treeResponse.sha,
        parents: [branchSha]
      })
    });

    // Update the branch reference to point to the new commit
    return await this.makeRequest(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, {
      method: 'PATCH',
      body: JSON.stringify({
        sha: commitResponse.sha
      })
    });
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    owner: string, 
    repo: string, 
    title: string, 
    body: string, 
    head: string, // Source branch
    base: string = 'main' // Target branch
  ): Promise<any> {
    return await this.makeRequest(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        body,
        head,
        base
      })
    });
  }

  /**
   * Get repository collaborators
   */
  async getCollaborators(owner: string, repo: string): Promise<any[]> {
    return await this.makeRequest(`/repos/${owner}/${repo}/collaborators`);
  }

  /**
   * Add collaborator to repository
   */
  async addCollaborator(owner: string, repo: string, username: string, permission: 'pull' | 'push' | 'admin' = 'push'): Promise<any> {
    return await this.makeRequest(`/repos/${owner}/${repo}/collaborators/${username}`, {
      method: 'PUT',
      body: JSON.stringify({ permission })
    });
  }
}

/**
 * Helper function to initialize GitHub integration from config file
 */
export async function initGitHubIntegration(configPath: string = './github-config.json'): Promise<GitHubIntegration> {
  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config: GitHubConfig = JSON.parse(configContent);
    
    if (!config.token) {
      throw new Error('GitHub token is required in config');
    }
    
    return new GitHubIntegration(config);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`GitHub config file not found: ${configPath}. Please create this file with your GitHub token.`);
    }
    throw error;
  }
}

/**
 * Helper function to create a basic GitHub config file
 */
export function createGitHubConfig(token: string, configPath: string = './github-config.json'): void {
  const config: GitHubConfig = {
    token,
    baseUrl: 'https://api.github.com'
  };
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`GitHub config file created at: ${configPath}`);
}

// Export a default instance if needed
export default GitHubIntegration;