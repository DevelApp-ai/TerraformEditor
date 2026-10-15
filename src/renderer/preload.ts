import { contextBridge, ipcRenderer } from 'electron';
import { ProjectRecord } from '../common/platform';

contextBridge.exposeInMainWorld('api', {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app-version'),
  addRepository: (repoUrl: string, branch: string, auth: unknown): Promise<unknown> =>
    ipcRenderer.invoke('git-add-repository', repoUrl, branch, auth),
  refreshRepository: (repoId: string): Promise<unknown> =>
    ipcRenderer.invoke('git-refresh-repository', repoId),
  listRepositories: (): Promise<unknown[]> => ipcRenderer.invoke('git-list-repositories'),
  analyzeModule: (modulePath: string): Promise<unknown> =>
    ipcRenderer.invoke('module-analyze', modulePath),
  listModules: (repoId: string): Promise<unknown[]> => ipcRenderer.invoke('module-list', repoId),
  saveFeatureFlags: (environment: string, flags: unknown): Promise<void> =>
    ipcRenderer.invoke('feature-flags-save', environment, flags),
  loadFeatureFlags: (environment: string): Promise<unknown> =>
    ipcRenderer.invoke('feature-flags-load', environment),
  saveProject: (project: ProjectRecord): Promise<void> =>
    ipcRenderer.invoke('project-save', project),
  loadProject: (id: string): Promise<ProjectRecord | null> =>
    ipcRenderer.invoke('project-load', id),
  listProjects: (): Promise<ProjectRecord[]> => ipcRenderer.invoke('project-list'),
  saveTerraformFile: (
    filePath: string,
    content: string
  ): Promise<{ path: string; success: boolean } | null> =>
    ipcRenderer.invoke('file-save-terraform', filePath, content),
  openTerraformFile: (): Promise<{ path: string; content: string } | null> =>
    ipcRenderer.invoke('file-open-terraform'),
  on: (channel: string, callback: (...args: unknown[]) => void): void => {
    const validChannels = ['module-analyzed', 'repository-updated', 'terraform-compiled'];
    if (validChannels.includes(channel)) {
      const wrapped = (_event: unknown, ...args: unknown[]): void => callback(...args);
      ipcRenderer.on(channel, wrapped as never);
    }
  },
  off: (channel: string, callback: (...args: unknown[]) => void): void => {
    const validChannels = ['module-analyzed', 'repository-updated', 'terraform-compiled'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback as never);
    }
  },
});
