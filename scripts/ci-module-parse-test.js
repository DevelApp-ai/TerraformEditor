// CI helper: validates that the test Terraform module can be parsed for
// variables, outputs, and resources (mirrors the GitModuleAnalyzer domain).
const fs = require('fs');

const moduleContent = fs.readFileSync('/tmp/test-terraform-repo/storage.tf', 'utf8');
console.log('Successfully read Terraform module content');

const variableRegex = /variable\s+"([^"]+)"\s*\{([^}]*)\}/g;
const variables = [];
let match;
while ((match = variableRegex.exec(moduleContent)) !== null) {
  variables.push({ name: match[1], body: match[2] });
}
console.log('Successfully extracted variables:', variables.length);
if (variables.length !== 3) {
  throw new Error('Expected 3 variables, got ' + variables.length);
}

const outputRegex = /output\s+"([^"]+)"\s*\{([^}]*)\}/g;
const outputs = [];
while ((match = outputRegex.exec(moduleContent)) !== null) {
  outputs.push({ name: match[1], body: match[2] });
}
console.log('Successfully extracted outputs:', outputs.length);
if (outputs.length !== 1) {
  throw new Error('Expected 1 output, got ' + outputs.length);
}

const resourceRegex = /resource\s+"([^"]+)"\s+"([^"]+)"/g;
const resources = [];
while ((match = resourceRegex.exec(moduleContent)) !== null) {
  resources.push({ type: match[1], name: match[2] });
}
console.log('Successfully extracted resources:', resources.length);
if (resources.length !== 1) {
  throw new Error('Expected 1 resource, got ' + resources.length);
}

console.log('Terraform repository toolbox parsing test completed successfully');
