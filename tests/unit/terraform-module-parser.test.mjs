import test from 'node:test';
import assert from 'node:assert/strict';
import { TerraformModuleParser } from '../../dist-test/terraform-module-parser.js';

const SAMPLE = `# Storage Account module for testing
variable "storage_account_name" {
  type = string
}

variable "location" {
  type    = string
  default = "westeurope"
}

variable "sku" {
  type    = string
  default = "LRS"
}

resource "azurerm_storage_account" "storage" {
  name                     = var.storage_account_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = var.sku
}

output "storage_account_id" {
  value = azurerm_storage_account.storage.id
}
`;

test('parses variables with defaults and required detection', () => {
  const parser = new TerraformModuleParser();
  const meta = parser.parse('storage.tf', SAMPLE, 'owner/repo/storage.tf');
  assert.equal(meta.moduleName, 'storage');
  assert.equal(meta.parameters.length, 3);
  const [name, location, sku] = meta.parameters;
  assert.equal(name.name, 'storage_account_name');
  assert.equal(name.required, true);
  assert.equal(location.required, false);
  assert.equal(location.defaultValue, '"westeurope"');
  assert.equal(sku.defaultValue, '"LRS"');
});

test('parses outputs and resources', () => {
  const parser = new TerraformModuleParser();
  const meta = parser.parse('storage.tf', SAMPLE, 'owner/repo/storage.tf');
  assert.equal(meta.outputs.length, 1);
  assert.equal(meta.outputs[0].name, 'storage_account_id');
  assert.equal(meta.resources.length, 1);
  assert.equal(meta.resources[0].type, 'azurerm_storage_account');
  assert.equal(meta.resources[0].name, 'storage');
});

test('extracts leading comment as description', () => {
  const parser = new TerraformModuleParser();
  const meta = parser.parse('storage.tf', SAMPLE, 'src');
  assert.equal(meta.description, 'Storage Account module for testing');
});
