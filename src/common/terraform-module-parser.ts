import { ModuleMetadata, ModuleOutput, ModuleParameter, ModuleResource } from './types';

/**
 * Shared Terraform/OpenTofu (HCL) module parser. Works on file contents
 * regardless of whether they came from local disk (Electron) or the GitHub
 * API (browser). Parses variable blocks, output blocks, resource blocks,
 * and module-registry style descriptions from header comments.
 */
export class TerraformModuleParser {
  parse(fileName: string, content: string, sourcePath: string): ModuleMetadata {
    return {
      moduleName: fileName.replace(/\.tf$/i, ''),
      moduleSource: sourcePath,
      modulePath: sourcePath,
      description: this.extractDescription(content),
      parameters: this.extractVariables(content),
      outputs: this.extractOutputs(content),
      resources: this.extractResources(content),
      lastUpdated: new Date().toISOString(),
    };
  }

  private extractDescription(content: string): string | undefined {
    const match = /(^|\n)#\s?(.+)/.exec(content);
    return match ? match[2].trim() : undefined;
  }

  /**
   * Parses `variable "name" { ... }` blocks, including type, default,
   * and description attributes.
   */
  private extractVariables(content: string): ModuleParameter[] {
    const parameters: ModuleParameter[] = [];
    const regex = /variable\s+"([^"]+)"\s*\{([\s\S]*?)\n\}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const body = match[2];
      const defaultValue = this.extractAttribute(body, 'default');
      const type = this.extractAttribute(body, 'type') ?? 'any';
      const description = this.extractQuotedAttribute(body, 'description');
      parameters.push({
        name,
        type: this.normalizeType(type),
        required: defaultValue === undefined,
        defaultValue,
        description,
      });
    }
    return parameters;
  }

  /**
   * Parses `output "name" { ... }` blocks.
   */
  private extractOutputs(content: string): ModuleOutput[] {
    const outputs: ModuleOutput[] = [];
    const regex = /output\s+"([^"]+)"\s*\{([\s\S]*?)\n\}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      outputs.push({
        name: match[1],
        type: 'any',
        value: (this.extractAttribute(match[2], 'value') ?? '').trim(),
      });
    }
    return outputs;
  }

  /**
   * Parses `resource "type" "name" { ... }` blocks.
   */
  private extractResources(content: string): ModuleResource[] {
    const resources: ModuleResource[] = [];
    const regex = /resource\s+"([^"]+)"\s+"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      resources.push({
        type: match[1],
        apiVersion: '',
        name: match[2],
      });
    }
    return resources;
  }

  private extractAttribute(body: string, name: string): string | undefined {
    const regex = new RegExp(`${name}\\s*=\\s*(.+?)(?=\\n\\s{2,}\\w+\\s*=|\\n\\}|$)`, 'm');
    const match = regex.exec(body);
    return match ? match[1].trim() : undefined;
  }

  private extractQuotedAttribute(body: string, name: string): string | undefined {
    const regex = new RegExp(`${name}\\s*=\\s*"([^"]*)"`);
    const match = regex.exec(body);
    return match ? match[1] : undefined;
  }

  private normalizeType(type: string): string {
    const inner = /string\s*\(/.test(type)
      ? 'string'
      : type
          .replace(/^string$/, 'string')
          .replace(/^number$|^int$/, 'number')
          .replace(/^bool$/, 'bool');
    return inner || 'any';
  }
}
