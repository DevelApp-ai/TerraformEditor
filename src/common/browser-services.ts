import { AppError, Platform, PlatformServices, ProjectRecord, RepositoryResult } from './platform';
import { TerraformModuleParser } from './terraform-module-parser';
import { BrowserStorage } from './browser-storage';
import { ModuleMetadata, RepositoryConfig } from './types';

interface GitHubTreeItem {
  path: string;
  type: 'blob' | 'tree';
}

/**
 * GitHub REST API transport for reading Terraform/OpenTofu modules from remote
 * repositories entirely in the browser. PATs are held in memory only for
 * the session and never persisted.
 */
export class GitHubBrowserTransport {
  private readonly apiBase = 'https://api.github.com';
  private readonly fetchImpl: typeof fetch;
  private token: string | null = null;

  constructor(fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.fetchImpl = fetchImpl;
  }

  setSessionToken(token: string | null): void {
    this.token = token;
  }

  parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
    const match = /github\.com[/:]([^/]+)\/([^/#?]+)/.exec(repoUrl);
    if (!match) {
      throw new AppError(
        'ERR_INVALID_REPO_URL',
        `Not a GitHub repository URL: ${repoUrl}`,
        'browser'
      );
    }
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }

  async listTerraformFiles(owner: string, repo: string, branch: string): Promise<string[]> {
    const response = await this.request(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
    );
    const tree = (await response.json()) as { tree?: GitHubTreeItem[] };
    return (tree.tree ?? [])
      .filter(item => item.type === 'blob' && /\.tf$/i.test(item.path))
      .map(item => item.path);
  }

  async fetchFileContent(
    owner: string,
    repo: string,
    branch: string,
    path: string
  ): Promise<string> {
    const response = await this.request(
      `/repos/${owner}/${repo}/contents/${path.replace(/^\/+/, '')}?ref=${encodeURIComponent(branch)}`,
      { headers: { Accept: 'application/vnd.github.raw+json' } }
    );
    const body = await response.text();
    return body;
  }

  private async request(
    pathSuffix: string,
    extra?: { headers?: Record<string, string> }
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      ...(extra?.headers ?? {}),
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiBase}${pathSuffix}`, { headers });
    } catch (error) {
      throw new AppError(
        'ERR_NETWORK',
        'Network request to GitHub failed (offline or blocked by browser)',
        'browser',
        error
      );
    }
    if (response.status === 401) {
      throw new AppError('ERR_UNAUTHORIZED', 'GitHub rejected the provided token (401)', 'browser');
    }
    if (response.status === 403) {
      throw new AppError(
        'ERR_RATE_LIMIT',
        'GitHub API rate limit or access denied (403)',
        'browser'
      );
    }
    if (response.status === 404) {
      throw new AppError(
        'ERR_NOT_FOUND',
        'Repository, branch, or file not found on GitHub (404)',
        'browser'
      );
    }
    if (!response.ok) {
      throw new AppError('ERR_GITHUB_API', `GitHub API error: ${response.status}`, 'browser');
    }
    return response;
  }
}

/**
 * Browser implementation of PlatformServices: IndexedDB persistence plus
 * GitHub API transport. No Node/Electron APIs used.
 */
export class BrowserServices implements PlatformServices {
  readonly platform: Platform = 'browser';
  readonly appVersion = 'web';

  private readonly storage: BrowserStorage;
  private readonly transport: GitHubBrowserTransport;
  private readonly parser: TerraformModuleParser;
  private readonly repositories: Map<string, RepositoryConfig> = new Map();
  private readonly modules: Map<string, ModuleMetadata[]> = new Map();

  constructor(
    storage?: BrowserStorage,
    transport?: GitHubBrowserTransport,
    parser?: TerraformModuleParser
  ) {
    this.storage = storage ?? new BrowserStorage();
    this.transport = transport ?? new GitHubBrowserTransport();
    this.parser = parser ?? new TerraformModuleParser();
  }

  async initialize(): Promise<void> {
    await this.storage.open(['projects', 'featureFlags', 'repositories']);
    const saved = await this.storage.list<RepositoryConfig>('repositories');
    for (const repo of saved) {
      this.repositories.set(repo.id, repo);
    }
  }

  setSessionToken(token: string | null): void {
    this.transport.setSessionToken(token);
  }

  /**
   * Test seam: replace the transport's fetch implementation.
   */
  setTransportFetchForTests(fetchImpl: typeof fetch): void {
    (this.transport as unknown as { fetchImpl: typeof fetch }).fetchImpl = fetchImpl;
  }

  async addRepository(
    repoUrl: string,
    branch: string,
    auth: { type: 'none' | 'pat'; token?: string }
  ): Promise<RepositoryResult> {
    const { owner, repo } = this.transport.parseRepoUrl(repoUrl);
    const effectiveBranch = branch || 'main';
    this.transport.setSessionToken(auth.type === 'pat' ? (auth.token ?? null) : null);
    const files = await this.transport.listTerraformFiles(owner, repo, effectiveBranch);
    const modules: ModuleMetadata[] = [];
    for (const file of files) {
      const content = await this.transport.fetchFileContent(owner, repo, effectiveBranch, file);
      modules.push(this.parser.parse(file, content, `${owner}/${repo}/${file}`));
    }
    const id = `${owner}/${repo}`;
    const config: RepositoryConfig = {
      id,
      name: repo,
      url: repoUrl,
      branch: effectiveBranch,
      auth: { type: auth.type === 'pat' ? 'pat' : 'none' },
      paths: ['/'],
      refresh: { type: 'manual' },
    };
    this.repositories.set(id, config);
    this.modules.set(id, modules);
    await this.storage.put('repositories', id, config);
    return { id, name: repo, modules: modules.length };
  }

  async refreshRepository(repoId: string): Promise<RepositoryResult> {
    const config = this.repositories.get(repoId);
    if (!config) {
      throw new AppError('ERR_UNKNOWN_REPO', `Repository not found: ${repoId}`, this.platform);
    }
    return this.addRepository(config.url, config.branch, {
      type: config.auth.type === 'pat' ? 'pat' : 'none',
    });
  }

  async listRepositories(): Promise<RepositoryConfig[]> {
    return [...this.repositories.values()];
  }

  async listModules(repoId: string): Promise<ModuleMetadata[]> {
    return this.modules.get(repoId) ?? [];
  }

  async saveFeatureFlags(environment: string, flags: unknown): Promise<void> {
    await this.storage.put('featureFlags', environment, flags);
  }

  async loadFeatureFlags(environment: string): Promise<unknown> {
    return this.storage.get('featureFlags', environment);
  }

  async saveProject(project: ProjectRecord): Promise<void> {
    await this.storage.put('projects', project.id, project);
  }

  async loadProject(id: string): Promise<ProjectRecord | null> {
    return this.storage.get<ProjectRecord>('projects', id);
  }

  async listProjects(): Promise<ProjectRecord[]> {
    return this.storage.list<ProjectRecord>('projects');
  }

  async saveTerraformFile(
    fileName: string,
    content: string
  ): Promise<{ path: string; success: boolean } | null> {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    return { path: fileName, success: true };
  }

  async openTerraformFile(): Promise<{ path: string; content: string } | null> {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.tf';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        void file.text().then(content => resolve({ path: file.name, content }));
      };
      input.click();
    });
  }
}
