import { ModuleMetadata, RepositoryConfig } from './types';

/**
 * Result of adding a repository to the module toolbox.
 */
export interface RepositoryResult {
  id: string;
  name: string;
  modules: number;
}

/**
 * A saved editor project (workspace XML + name + timestamps).
 */
export interface ProjectRecord {
  id: string;
  name: string;
  content: string;
  updatedAt: number;
}

/**
 * Generic error type carrying enough structured context to prefill
 * GitHub issue reports from the UI.
 */
export class AppError extends Error {
  readonly code: string;
  readonly platform: Platform;
  readonly detail?: unknown;

  constructor(code: string, message: string, platform: Platform, detail?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.platform = platform;
    this.detail = detail;
  }
}

export type Platform = 'electron' | 'browser';

/**
 * Platform-agnostic service API used by the renderer.
 *
 * Electron implementation bridges to the main process via IPC;
 * browser implementation uses IndexedDB and the GitHub REST API.
 */
export interface PlatformServices {
  readonly platform: Platform;
  readonly appVersion: string;
  addRepository(
    repoUrl: string,
    branch: string,
    auth: { type: 'none' | 'pat'; token?: string }
  ): Promise<RepositoryResult>;
  refreshRepository(repoId: string): Promise<RepositoryResult>;
  listRepositories(): Promise<RepositoryConfig[]>;
  listModules(repoId: string): Promise<ModuleMetadata[]>;
  saveFeatureFlags(environment: string, flags: unknown): Promise<void>;
  loadFeatureFlags(environment: string): Promise<unknown>;
  saveProject(project: ProjectRecord): Promise<void>;
  loadProject(id: string): Promise<ProjectRecord | null>;
  listProjects(): Promise<ProjectRecord[]>;
  saveTerraformFile(
    fileName: string,
    content: string
  ): Promise<{ path: string; success: boolean } | null>;
  openTerraformFile(): Promise<{ path: string; content: string } | null>;
}
