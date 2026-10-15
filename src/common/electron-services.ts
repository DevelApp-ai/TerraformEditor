import { AppError, Platform, PlatformServices, ProjectRecord, RepositoryResult } from './platform';
import { ModuleMetadata, RepositoryConfig } from './types';

/**
 * Electron implementation of PlatformServices. Bridges to the preload API
 * (window.api) which exposes whitelisted IPC channels.
 */
export class ElectronServices implements PlatformServices {
  readonly platform: Platform = 'electron';

  get appVersion(): string {
    return 'electron';
  }

  private api(): unknown {
    const candidate = (globalThis as { api?: unknown }).api;
    if (!candidate) {
      throw new AppError(
        'ERR_NO_BRIDGE',
        'Electron bridge (window.api) unavailable',
        this.platform
      );
    }
    return candidate;
  }

  async addRepository(
    repoUrl: string,
    branch: string,
    auth: { type: 'none' | 'pat'; token?: string }
  ): Promise<RepositoryResult> {
    const api = this.api() as {
      addRepository: (u: string, b: string, a: unknown) => Promise<RepositoryResult>;
    };
    return api.addRepository(repoUrl, branch, auth);
  }

  async refreshRepository(repoId: string): Promise<RepositoryResult> {
    const api = this.api() as { refreshRepository: (id: string) => Promise<RepositoryResult> };
    return api.refreshRepository(repoId);
  }

  async listRepositories(): Promise<RepositoryConfig[]> {
    const api = this.api() as { listRepositories: () => Promise<RepositoryConfig[]> };
    return api.listRepositories();
  }

  async listModules(repoId: string): Promise<ModuleMetadata[]> {
    const api = this.api() as { listModules: (id: string) => Promise<ModuleMetadata[]> };
    return api.listModules(repoId);
  }

  async saveFeatureFlags(environment: string, flags: unknown): Promise<void> {
    const api = this.api() as { saveFeatureFlags: (e: string, f: unknown) => Promise<void> };
    return api.saveFeatureFlags(environment, flags);
  }

  async loadFeatureFlags(environment: string): Promise<unknown> {
    const api = this.api() as { loadFeatureFlags: (e: string) => Promise<unknown> };
    return api.loadFeatureFlags(environment);
  }

  async saveProject(project: ProjectRecord): Promise<void> {
    const api = this.api() as { saveProject: (p: ProjectRecord) => Promise<void> };
    return api.saveProject(project);
  }

  async loadProject(id: string): Promise<ProjectRecord | null> {
    const api = this.api() as { loadProject: (id: string) => Promise<ProjectRecord | null> };
    return api.loadProject(id);
  }

  async listProjects(): Promise<ProjectRecord[]> {
    const api = this.api() as { listProjects: () => Promise<ProjectRecord[]> };
    return api.listProjects();
  }

  async saveTerraformFile(
    fileName: string,
    content: string
  ): Promise<{ path: string; success: boolean } | null> {
    const api = this.api() as {
      saveTerraformFile: (
        f: string,
        c: string
      ) => Promise<{ path: string; success: boolean } | null>;
    };
    return api.saveTerraformFile(fileName, content);
  }

  async openTerraformFile(): Promise<{ path: string; content: string } | null> {
    const api = this.api() as {
      openTerraformFile: () => Promise<{ path: string; content: string } | null>;
    };
    return api.openTerraformFile();
  }
}
