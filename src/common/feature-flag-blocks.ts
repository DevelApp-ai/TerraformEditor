import * as Blockly from 'blockly';
import { FeatureFlag } from '../common/types';

/**
 * FeatureFlagBlockManager class for managing feature flag blocks
 */
export class FeatureFlagBlockManager {
  private workspace: Blockly.WorkspaceSvg;
  private currentEnvironment: string = 'development';
  private featureFlags: FeatureFlag[] = [];

  /**
   * Constructor
   * @param workspace Blockly workspace
   */
  constructor(workspace: Blockly.WorkspaceSvg) {
    this.workspace = workspace;
    this.setupEventListeners();
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen for environment changes
    const environmentSelector = document.getElementById('environmentSelector') as HTMLSelectElement;
    if (environmentSelector) {
      environmentSelector.addEventListener('change', async () => {
        this.currentEnvironment = environmentSelector.value;
        await this.loadFeatureFlags();
        this.updateFeatureFlagBlocks();
      });
    }
  }

  /**
   * Load feature flags for the current environment
   */
  public async loadFeatureFlags(): Promise<void> {
    try {
      const api = (
        window as unknown as { api?: { loadFeatureFlags: (e: string) => Promise<FeatureFlag[]> } }
      ).api;
      if (!api) {
        this.featureFlags = [];
        return;
      }
      this.featureFlags = (await api.loadFeatureFlags(this.currentEnvironment)) ?? [];
    } catch {
      this.featureFlags = [];
    }
  }

  /**
   * Create feature flag blocks
   */
  public createFeatureFlagBlocks(): void {
    // Create feature flag category
    const featureFlagCategory = {
      kind: 'category',
      name: 'Feature Flags',
      colour: '#A65C81',
      contents: [] as { kind: string; type?: string }[],
    };

    // Add blocks for each feature flag
    this.featureFlags.forEach(flag => {
      const blockDef = this.createFeatureFlagBlockDefinition(flag);
      Blockly.common.defineBlocksWithJsonArray([blockDef]);

      featureFlagCategory.contents.push({
        kind: 'block',
        type: `feature_flag_${flag.name}`,
      });
    });

    // Add category to toolbox
    const toolbox = this.workspace.getToolbox();
    if (toolbox) {
      const toolboxDef = (
        toolbox as unknown as { getToolboxDef: () => { contents: unknown[] } }
      ).getToolboxDef();
      toolboxDef.contents.push(featureFlagCategory);
      toolbox.render(toolboxDef as never);
    }
  }

  /**
   * Create a block definition for a feature flag
   * @param flag Feature flag
   * @returns Block definition
   */
  private createFeatureFlagBlockDefinition(flag: FeatureFlag): Record<string, unknown> {
    const blockDef: Record<string, unknown> = {
      type: `feature_flag_${flag.name}`,
      message0: `Feature Flag: ${flag.name}`,
      output: this.getOutputType(flag.type),
      colour: 290,
      tooltip: flag.description || `Feature flag for ${flag.name}`,
    };

    return blockDef;
  }

  /**
   * Get output type for a feature flag
   * @param flagType Feature flag type
   * @returns Output type
   */
  private getOutputType(flagType: string): string {
    switch (flagType) {
      case 'boolean':
        return 'Boolean';
      case 'string':
        return 'String';
      case 'number':
        return 'Number';
      default:
        return 'String';
    }
  }

  /**
   * Update feature flag blocks when environment changes
   */
  private updateFeatureFlagBlocks(): void {
    // Remove existing feature flag blocks
    const toolbox = this.workspace.getToolbox();
    if (toolbox) {
      const toolboxDef = (
        toolbox as unknown as { getToolboxDef: () => { contents: { name?: string }[] } }
      ).getToolboxDef();
      toolboxDef.contents = toolboxDef.contents.filter(
        (category: { name?: string }) => category.name !== 'Feature Flags'
      );
      toolbox.render(toolboxDef as never);
    }

    // Create new feature flag blocks
    this.createFeatureFlagBlocks();
  }

  /**
   * Define code generators for feature flag blocks
   * @param generator Blockly generator
   */
  public defineFeatureFlagGenerators(generator: {
    forBlock: Record<string, () => [string, number]>;
    ORDER_ATOMIC: number;
  }): void {
    this.featureFlags.forEach(flag => {
      generator.forBlock[`feature_flag_${flag.name}`] = function () {
        // Return the feature flag value based on the current environment
        let value: string;

        const flagValue = flag.value as boolean | number | string | object;
        switch (flag.type) {
          case 'boolean':
            value = flagValue ? 'true' : 'false';
            break;
          case 'number':
            value = String(flagValue);
            break;
          case 'string':
            value = `'${String(flagValue)}'`;
            break;
          default:
            value = `'${JSON.stringify(flagValue)}'`;
        }

        return [value, generator.ORDER_ATOMIC];
      };
    });
  }

  /**
   * Get current environment
   * @returns Current environment
   */
  public getCurrentEnvironment(): string {
    return this.currentEnvironment;
  }

  /**
   * Get feature flags
   * @returns Feature flags
   */
  public getFeatureFlags(): FeatureFlag[] {
    return this.featureFlags;
  }
}
