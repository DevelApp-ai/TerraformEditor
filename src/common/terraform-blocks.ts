import * as Blockly from 'blockly';
import { ModuleMetadata, ModuleOutput, ModuleParameter } from './types';
import { TerraformModuleBlockDefinition } from '../common/types';

/**
 * TerraformBlockFactory class for creating and managing Terraform blocks
 */
export class TerraformBlockFactory {
  /**
   * Create core Terraform resource blocks
   */
  public static createCoreBlocks(): void {
    // Storage Account block
    Blockly.common.defineBlocksWithJsonArray([
      {
        type: 'terraform_storage_account',
        message0: 'Storage Account %1',
        args0: [
          {
            type: 'field_input',
            name: 'NAME',
            text: 'storageAccount',
          },
        ],
        message1: 'Name: %1',
        args1: [
          {
            type: 'input_value',
            name: 'STORAGE_NAME',
            check: 'String',
          },
        ],
        message2: 'Location: %1',
        args2: [
          {
            type: 'input_value',
            name: 'LOCATION',
            check: 'String',
          },
        ],
        message3: 'SKU: %1',
        args3: [
          {
            type: 'field_dropdown',
            name: 'SKU',
            options: [
              ['Standard_LRS', 'Standard_LRS'],
              ['Standard_GRS', 'Standard_GRS'],
              ['Standard_RAGRS', 'Standard_RAGRS'],
              ['Premium_LRS', 'Premium_LRS'],
            ],
          },
        ],
        previousStatement: 'TerraformResource',
        nextStatement: 'TerraformResource',
        colour: 160,
        tooltip: 'Creates an Azure Storage Account',
        helpUrl:
          'https://learn.microsoft.com/en-us/azure/templates/microsoft.storage/storageaccounts',
      },
    ]);

    // Virtual Network block
    Blockly.common.defineBlocksWithJsonArray([
      {
        type: 'terraform_virtual_network',
        message0: 'Virtual Network %1',
        args0: [
          {
            type: 'field_input',
            name: 'NAME',
            text: 'vnet',
          },
        ],
        message1: 'Name: %1',
        args1: [
          {
            type: 'input_value',
            name: 'VNET_NAME',
            check: 'String',
          },
        ],
        message2: 'Location: %1',
        args2: [
          {
            type: 'input_value',
            name: 'LOCATION',
            check: 'String',
          },
        ],
        message3: 'Address Space: %1',
        args3: [
          {
            type: 'input_value',
            name: 'ADDRESS_SPACE',
            check: 'String',
          },
        ],
        previousStatement: 'TerraformResource',
        nextStatement: 'TerraformResource',
        colour: 210,
        tooltip: 'Creates an Azure Virtual Network',
        helpUrl:
          'https://learn.microsoft.com/en-us/azure/templates/microsoft.network/virtualnetworks',
      },
    ]);

    // Feature Flag block
    Blockly.common.defineBlocksWithJsonArray([
      {
        type: 'terraform_feature_flag',
        message0: 'Feature Flag: %1',
        args0: [
          {
            type: 'field_input',
            name: 'FLAG_NAME',
            text: 'enableHighAvailability',
          },
        ],
        message1: 'Environment: %1',
        args1: [
          {
            type: 'field_dropdown',
            name: 'ENVIRONMENT',
            options: [
              ['Development', 'development'],
              ['Testing', 'testing'],
              ['Staging', 'staging'],
              ['Production', 'production'],
            ],
          },
        ],
        message2: 'Value: %1',
        args2: [
          {
            type: 'input_value',
            name: 'FLAG_VALUE',
          },
        ],
        output: 'Boolean',
        colour: 290,
        tooltip: 'Environment-specific feature flag',
      },
    ]);

    // Conditional deployment block
    Blockly.common.defineBlocksWithJsonArray([
      {
        type: 'terraform_conditional_deployment',
        message0: 'Deploy if %1',
        args0: [
          {
            type: 'input_value',
            name: 'CONDITION',
            check: 'Boolean',
          },
        ],
        message1: 'Resources: %1',
        args1: [
          {
            type: 'input_statement',
            name: 'RESOURCES',
            check: 'TerraformResource',
          },
        ],
        previousStatement: null,
        nextStatement: null,
        colour: 120,
        tooltip: 'Conditionally deploy resources based on a condition',
      },
    ]);

    // String literal block
    Blockly.common.defineBlocksWithJsonArray([
      {
        type: 'terraform_string_literal',
        message0: 'String: %1',
        args0: [
          {
            type: 'field_input',
            name: 'TEXT',
            text: '',
          },
        ],
        output: 'String',
        colour: 330,
        tooltip: 'A string value',
      },
    ]);
  }

  /**
   * Create a block definition for a Terraform module
   */
  public static createModuleBlockDefinition(
    moduleMetadata: ModuleMetadata
  ): TerraformModuleBlockDefinition {
    // Create the basic block structure
    const blockDef: TerraformModuleBlockDefinition & Record<string, unknown> = {
      type: `terraform_module_${moduleMetadata.moduleName}`,
      message0: `Module: ${moduleMetadata.moduleName} %1`,
      args0: [
        {
          type: 'field_label',
          text: `from ${moduleMetadata.moduleSource}`,
        },
      ],
      output: 'TerraformModule',
      outputConnections: [],
      colour: 230,
      tooltip: moduleMetadata.description || `Module from ${moduleMetadata.moduleSource}`,
      helpUrl: `${moduleMetadata.moduleSource}/${moduleMetadata.modulePath}`,
    };

    // Add module name input
    let messageIndex = 1;
    blockDef[`message${messageIndex}`] = 'Name: %1';
    blockDef[`args${messageIndex}`] = [
      {
        type: 'field_input',
        name: 'MODULE_NAME',
        text: moduleMetadata.moduleName,
      },
    ];
    messageIndex++;

    // Add parameters
    moduleMetadata.parameters.forEach((param: ModuleParameter) => {
      blockDef[`message${messageIndex}`] = `${param.name}: %1`;

      // Different input types based on parameter type
      if (param.allowedValues && param.allowedValues.length > 0) {
        // Dropdown for allowed values
        blockDef[`args${messageIndex}`] = [
          {
            type: 'field_dropdown',
            name: `PARAM_${param.name}`,
            options: param.allowedValues.map((value: string) => [value, value]),
          },
        ];
      } else {
        // Input value for other types
        blockDef[`args${messageIndex}`] = [
          {
            type: 'input_value',
            name: `PARAM_${param.name}`,
            check: param.type.charAt(0).toUpperCase() + param.type.slice(1),
          },
        ];
      }

      messageIndex++;
    });

    // Add outputs as connections
    moduleMetadata.outputs.forEach((output: ModuleOutput) => {
      (blockDef.outputConnections as { name: string; type: string }[]).push({
        name: `OUTPUT_${output.name}`,
        type: output.type.charAt(0).toUpperCase() + output.type.slice(1),
      });
    });

    return blockDef;
  }

  /**
   * Register a module block with Blockly
   */
  public static registerModuleBlock(blockDef: TerraformModuleBlockDefinition): void {
    Blockly.common.defineBlocksWithJsonArray([blockDef]);
  }
}
