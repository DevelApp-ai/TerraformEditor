import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { EnvironmentConfig, FeatureFlag } from '../common/types';

/**
 * FeatureFlagManager class for managing environment-specific feature flags
 */
export class FeatureFlagManager {
  private configPath: string;
  private environments: Map<string, EnvironmentConfig>;
  private defaultEnvironments: string[] = ['development', 'testing', 'staging', 'production'];

  /**
   * Constructor
   * @param configPath Path to configuration directory
   */
  constructor(configPath: string) {
    this.configPath = configPath;
    this.environments = new Map<string, EnvironmentConfig>();
    this.setupIpcHandlers();
    this.initialize();
  }

  /**
   * Initialize the feature flag manager
   */
  private initialize(): void {
    // Create config directory if it doesn't exist
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true });
    }

    // Create environment config file if it doesn't exist
    const configFile = path.join(this.configPath, 'environments.json');
    if (!fs.existsSync(configFile)) {
      this.createDefaultEnvironments();
      this.saveEnvironments();
    } else {
      this.loadEnvironments();
    }
  }

  /**
   * Create default environments
   */
  private createDefaultEnvironments(): void {
    this.defaultEnvironments.forEach(envName => {
      this.environments.set(envName, {
        name: envName,
        featureFlags: [
          {
            name: 'enableHighAvailability',
            type: 'boolean',
            value: envName === 'production' || envName === 'staging',
            description: 'Enable high availability features',
          },
          {
            name: 'replicaCount',
            type: 'number',
            value: envName === 'production' ? 3 : envName === 'staging' ? 2 : 1,
            description: 'Number of replicas to deploy',
          },
          {
            name: 'enableGeoRedundancy',
            type: 'boolean',
            value: envName === 'production',
            description: 'Enable geo-redundant storage',
          },
          {
            name: 'storageTier',
            type: 'string',
            value: envName === 'production' ? 'Premium' : 'Standard',
            description: 'Storage tier to use',
          },
        ],
      });
    });
  }

  /**
   * Load environments from config file
   */
  private loadEnvironments(): void {
    try {
      const configFile = path.join(this.configPath, 'environments.json');
      const data = fs.readFileSync(configFile, 'utf8');
      const environments = JSON.parse(data);

      this.environments.clear();
      environments.forEach((env: EnvironmentConfig) => {
        this.environments.set(env.name, env);
      });
    } catch (error) {
      console.error('Error loading environments:', error);
      this.createDefaultEnvironments();
    }
  }

  /**
   * Save environments to config file
   */
  private saveEnvironments(): void {
    try {
      const configFile = path.join(this.configPath, 'environments.json');
      const environments = Array.from(this.environments.values());
      fs.writeFileSync(configFile, JSON.stringify(environments, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving environments:', error);
    }
  }

  /**
   * Set up IPC handlers for feature flag operations
   */
  private setupIpcHandlers(): void {
    // Load feature flags for an environment
    ipcMain.handle('feature-flags-load', async (_event, environment: string) => {
      try {
        const env = this.environments.get(environment);
        if (!env) {
          throw new Error(`Environment ${environment} not found`);
        }
        return env.featureFlags;
      } catch (error) {
        console.error('Error loading feature flags:', error);
        throw error;
      }
    });

    // Save feature flags for an environment
    ipcMain.handle(
      'feature-flags-save',
      async (_event, environment: string, flags: FeatureFlag[]) => {
        try {
          const env = this.environments.get(environment);
          if (!env) {
            // Create new environment if it doesn't exist
            this.environments.set(environment, {
              name: environment,
              featureFlags: flags,
            });
          } else {
            // Update existing environment
            env.featureFlags = flags;
          }
          this.saveEnvironments();
          return true;
        } catch (error) {
          console.error('Error saving feature flags:', error);
          throw error;
        }
      }
    );

    // List all environments
    ipcMain.handle('feature-flags-list-environments', async () => {
      try {
        return Array.from(this.environments.keys());
      } catch (error) {
        console.error('Error listing environments:', error);
        throw error;
      }
    });

    // Create a new environment
    ipcMain.handle('feature-flags-create-environment', async (_event, environment: string) => {
      try {
        if (this.environments.has(environment)) {
          throw new Error(`Environment ${environment} already exists`);
        }

        // Create new environment with default flags
        this.environments.set(environment, {
          name: environment,
          featureFlags: [],
        });

        this.saveEnvironments();
        return true;
      } catch (error) {
        console.error('Error creating environment:', error);
        throw error;
      }
    });

    // Delete an environment
    ipcMain.handle('feature-flags-delete-environment', async (_event, environment: string) => {
      try {
        if (!this.environments.has(environment)) {
          throw new Error(`Environment ${environment} not found`);
        }

        // Don't allow deleting default environments
        if (this.defaultEnvironments.includes(environment)) {
          throw new Error(`Cannot delete default environment ${environment}`);
        }

        this.environments.delete(environment);
        this.saveEnvironments();
        return true;
      } catch (error) {
        console.error('Error deleting environment:', error);
        throw error;
      }
    });
  }

  /**
   * Get feature flags for an environment
   * @param environment Environment name
   * @returns Array of feature flags
   */
  public getFeatureFlags(environment: string): FeatureFlag[] {
    const env = this.environments.get(environment);
    if (!env) {
      return [];
    }
    return env.featureFlags;
  }

  /**
   * Get feature flag value
   * @param environment Environment name
   * @param flagName Feature flag name
   * @returns Feature flag value or undefined
   */
  public getFeatureFlagValue(environment: string, flagName: string): unknown {
    const env = this.environments.get(environment);
    if (!env) {
      return undefined;
    }

    const flag = env.featureFlags.find(f => f.name === flagName);
    return flag ? flag.value : undefined;
  }
}
