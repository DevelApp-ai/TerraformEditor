import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import {
  ModuleMetadata,
  ModuleOutput,
  ModuleParameter,
  ModuleResource,
  RepositoryConfig,
} from '../common/types';

/**
 * GitModuleAnalyzer class for analyzing Terraform/OpenTofu modules from git repositories
 */
export class GitModuleAnalyzer {
  private repositories: Map<string, RepositoryConfig>;
  private cachePath: string;
  private moduleRegistry: Map<string, ModuleMetadata>;

  /**
   * Constructor
   * @param cachePath Path to cache directory
   */
  constructor(cachePath: string) {
    this.repositories = new Map<string, RepositoryConfig>();
    this.moduleRegistry = new Map<string, ModuleMetadata>();
    this.cachePath = cachePath;
    this.setupIpcHandlers();
  }

  /**
   * Set up IPC handlers for git operations
   */
  private setupIpcHandlers(): void {
    // Add repository
    ipcMain.handle(
      'git-add-repository',
      async (_event, repoUrl: string, branch: string, auth: RepositoryConfig['auth']) => {
        try {
          const repoId = this.generateRepoId(repoUrl);
          const repoConfig: RepositoryConfig = {
            id: repoId,
            name: this.extractRepoName(repoUrl),
            url: repoUrl,
            branch: branch || 'main',
            auth: auth || { type: 'none' },
            paths: ['/'],
            refresh: { type: 'manual' },
          };

          this.repositories.set(repoId, repoConfig);
          await this.cloneRepository(repoConfig);
          const modules = await this.scanForModules(repoConfig);

          return {
            id: repoId,
            name: repoConfig.name,
            modules: modules.length,
          };
        } catch (error) {
          console.error('Error adding repository:', error);
          throw error;
        }
      }
    );

    // Refresh repository
    ipcMain.handle('git-refresh-repository', async (_event, repoId: string) => {
      try {
        const repoConfig = this.repositories.get(repoId);
        if (!repoConfig) {
          throw new Error(`Repository with ID ${repoId} not found`);
        }

        await this.pullRepository(repoConfig);
        const modules = await this.scanForModules(repoConfig);

        return {
          id: repoId,
          name: repoConfig.name,
          modules: modules.length,
        };
      } catch (error) {
        console.error('Error refreshing repository:', error);
        throw error;
      }
    });

    // List repositories
    ipcMain.handle('git-list-repositories', async () => {
      try {
        const repos = [];
        for (const [id, repo] of this.repositories.entries()) {
          repos.push({
            id: id,
            name: repo.name,
            url: repo.url,
            branch: repo.branch,
          });
        }
        return repos;
      } catch (error) {
        console.error('Error listing repositories:', error);
        throw error;
      }
    });

    // List modules
    ipcMain.handle('module-list', async (_event, repoId: string) => {
      try {
        const modules = [];
        for (const [id, module] of this.moduleRegistry.entries()) {
          if (module.moduleSource.includes(repoId)) {
            modules.push({
              id: id,
              name: module.moduleName,
              path: module.modulePath,
              parameters: module.parameters.length,
              outputs: module.outputs.length,
            });
          }
        }
        return modules;
      } catch (error) {
        console.error('Error listing modules:', error);
        throw error;
      }
    });

    // Analyze module
    ipcMain.handle('module-analyze', async (_event, modulePath: string) => {
      try {
        const moduleId = this.generateModuleId(modulePath);
        const module = this.moduleRegistry.get(moduleId);

        if (!module) {
          throw new Error(`Module with path ${modulePath} not found`);
        }

        return module;
      } catch (error) {
        console.error('Error analyzing module:', error);
        throw error;
      }
    });
  }

  /**
   * Generate a unique ID for a repository
   * @param repoUrl Repository URL
   * @returns Repository ID
   */
  private generateRepoId(repoUrl: string): string {
    return Buffer.from(repoUrl)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '');
  }

  /**
   * Generate a unique ID for a module
   * @param modulePath Module path
   * @returns Module ID
   */
  private generateModuleId(modulePath: string): string {
    return Buffer.from(modulePath)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '');
  }

  /**
   * Extract repository name from URL
   * @param repoUrl Repository URL
   * @returns Repository name
   */
  private extractRepoName(repoUrl: string): string {
    const urlParts = repoUrl.split('/');
    const repoName =
      urlParts[urlParts.length - 1].replace('.git', '') || urlParts[urlParts.length - 2];
    return repoName;
  }

  /**
   * Clone a repository
   * @param repo Repository configuration
   * @returns Path to cloned repository
   */
  private async cloneRepository(repo: RepositoryConfig): Promise<string> {
    const repoPath = path.join(this.cachePath, repo.id);

    // Check if repository already exists
    if (fs.existsSync(repoPath)) {
      return this.pullRepository(repo);
    }

    // Create directory if it doesn't exist
    fs.mkdirSync(repoPath, { recursive: true });

    // Clone repository
    const git = simpleGit();

    // Handle authentication
    if (repo.auth.type === 'pat') {
      // For PAT authentication, modify the URL to include the token
      const url = new URL(repo.url);
      url.username = repo.auth.token || '';
      await git.clone(url.toString(), repoPath);
    } else {
      // For no authentication or SSH, use the URL as is
      await git.clone(repo.url, repoPath);
    }

    // Checkout specific branch
    const localGit = simpleGit(repoPath);
    await localGit.checkout(repo.branch);

    return repoPath;
  }

  /**
   * Pull latest changes from a repository
   * @param repo Repository configuration
   * @returns Path to repository
   */
  private async pullRepository(repo: RepositoryConfig): Promise<string> {
    const repoPath = path.join(this.cachePath, repo.id);

    // Check if repository exists
    if (!fs.existsSync(repoPath)) {
      return this.cloneRepository(repo);
    }

    // Pull latest changes
    const git = simpleGit(repoPath);
    await git.pull('origin', repo.branch);

    return repoPath;
  }

  /**
   * Scan a repository for Terraform/OpenTofu modules
   * @param repo Repository configuration
   * @returns Array of module metadata
   */
  private async scanForModules(repo: RepositoryConfig): Promise<ModuleMetadata[]> {
    const repoPath = path.join(this.cachePath, repo.id);
    const modules: ModuleMetadata[] = [];

    // Process each path in the repository
    for (const modulePath of repo.paths) {
      const fullPath = path.join(repoPath, modulePath);

      // Check if path exists
      if (!fs.existsSync(fullPath)) {
        console.warn(`Path ${fullPath} does not exist in repository ${repo.name}`);
        continue;
      }

      // Find all .tf files
      const tfFiles = this.findTerraformFiles(fullPath);

      // Analyze each file
      for (const file of tfFiles) {
        try {
          const metadata = await this.analyzeTerraformModule(file, repo);
          const moduleId = this.generateModuleId(file);

          this.moduleRegistry.set(moduleId, metadata);
          modules.push(metadata);
        } catch (error) {
          console.error(`Error analyzing module ${file}:`, error);
        }
      }
    }

    return modules;
  }

  /**
   * Find all .tf files in a directory recursively
   * @param dir Directory to search
   * @returns Array of file paths
   */
  private findTerraformFiles(dir: string): string[] {
    const files: string[] = [];

    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        // Recursively search subdirectories
        files.push(...this.findTerraformFiles(fullPath));
      } else if (item.isFile() && item.name.endsWith('.tf')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Analyze a Terraform module file
   * @param filePath Path to Terraform file
   * @param repo Repository configuration
   * @returns Module metadata
   */
  private async analyzeTerraformModule(
    filePath: string,
    repo: RepositoryConfig
  ): Promise<ModuleMetadata> {
    // Read file content
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract module name from file path
    const moduleName = path.basename(filePath, '.tf');

    // Extract relative path from repository root
    const repoPath = path.join(this.cachePath, repo.id);
    const relativePath = filePath.replace(repoPath, '');

    // Initialize metadata
    const metadata: ModuleMetadata = {
      moduleName,
      moduleSource: repo.url,
      modulePath: relativePath,
      description: this.extractDescription(content),
      parameters: this.extractParameters(content),
      outputs: this.extractOutputs(content),
      resources: this.extractResources(content),
      lastUpdated: new Date().toISOString(),
    };

    return metadata;
  }

  /**
   * Extract description from module content
   * @param content Module content
   * @returns Description or undefined
   */
  private extractDescription(content: string): string | undefined {
    // Look for a comment at the beginning of the file
    const lines = content.split('\n');
    let description = '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('//')) {
        // Add comment to description
        description += trimmed.substring(2).trim() + ' ';
      } else if (trimmed.length > 0) {
        // Stop at first non-comment line
        break;
      }
    }

    return description.trim() || undefined;
  }

  /**
   * Extract parameters from module content
   * @param content Module content
   * @returns Array of parameters
   */
  private extractParameters(content: string): ModuleParameter[] {
    const parameters: ModuleParameter[] = [];
    const paramRegex = /param\s+(\w+)\s+(\w+)(?:\s*=\s*(.+))?/g;

    let match;
    while ((match = paramRegex.exec(content)) !== null) {
      const [, name, type, defaultValue] = match;

      parameters.push({
        name,
        type,
        required: !defaultValue,
        defaultValue: defaultValue ? defaultValue.trim() : undefined,
      });
    }

    return parameters;
  }

  /**
   * Extract outputs from module content
   * @param content Module content
   * @returns Array of outputs
   */
  private extractOutputs(content: string): ModuleOutput[] {
    const outputs: ModuleOutput[] = [];
    const outputRegex = /output\s+(\w+)\s+(\w+)\s*=\s*(.+)/g;

    let match;
    while ((match = outputRegex.exec(content)) !== null) {
      const [, name, type, value] = match;

      outputs.push({
        name,
        type,
        value: value.trim(),
      });
    }

    return outputs;
  }

  /**
   * Extract resources from module content
   * @param content Module content
   * @returns Array of resources
   */
  private extractResources(content: string): ModuleResource[] {
    const resources: ModuleResource[] = [];
    const resourceRegex = /resource\s+(\w+)\s+'([^']+)@([^']+)'/g;

    let match;
    while ((match = resourceRegex.exec(content)) !== null) {
      const [, name, type, apiVersion] = match;

      resources.push({
        name,
        type,
        apiVersion,
      });
    }

    return resources;
  }
}
