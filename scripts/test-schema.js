#!/usr/bin/env node

/**
 * WireViz JSON Schema Validation Test Script
 * 
 * Tests the WireViz JSON schema against all example YAML files from the WireViz repository.
 * This script validates that the schema correctly accepts all valid WireViz YAML files.
 * 
 * Usage:
 *   node scripts/test-schema.js [--path <path-to-examples>] [--schema <path-to-schema>]
 * 
 * Options:
 *   --path     Path to directory containing WireViz YAML examples (default: ../../WireViz/examples)
 *   --schema   Path to the JSON schema file (default: ../schemas/wireviz-schema.json)
 *   --help     Show this help message
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const yaml = require('js-yaml');

// Parse command line arguments
const args = require('minimist')(process.argv.slice(2));

function showHelp() {
  console.log(`
WireViz JSON Schema Validation Test Script

Tests the WireViz JSON schema against all example YAML files.

Usage:
  node scripts/test-schema.js [options]

Options:
  --path     Path to directory containing WireViz YAML examples
            (default: ../../WireViz/examples relative to script)
  --schema   Path to the JSON schema file
            (default: ../schemas/wireviz-schema.json relative to script)
  --help     Show this help message
  --quiet    Only show failures, not successes

Examples:
  node scripts/test-schema.js
  node scripts/test-schema.js --path /path/to/examples
  node scripts/test-schema.js --schema custom-schema.json
`);
  process.exit(0);
}

if (args.help || args.h) {
  showHelp();
}

// Resolve paths
const scriptDir = path.dirname(__filename);
const examplesPath = args.path 
  ? path.resolve(args.path)
  : path.resolve(scriptDir, '../../WireViz/examples');
const schemaPath = args.schema
  ? path.resolve(args.schema)
  : path.resolve(scriptDir, '../schemas/wireviz-schema.json');
const quiet = args.quiet || args.q || false;

// Check if schema file exists
if (!fs.existsSync(schemaPath)) {
  console.error(`Error: Schema file not found at ${schemaPath}`);
  process.exit(1);
}

// Check if examples directory exists
if (!fs.existsSync(examplesPath)) {
  console.error(`Error: Examples directory not found at ${examplesPath}`);
  process.exit(1);
}

// Load schema
let schema;
try {
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  schema = JSON.parse(schemaContent);
} catch (err) {
  console.error(`Error loading schema: ${err.message}`);
  process.exit(1);
}

// Configure AJV validator
const ajv = new Ajv({
  strict: false,
  spec: 'draft7',
  allErrors: true,
  verbose: false
});

// Compile schema
let validate;
try {
  validate = ajv.compile(schema);
} catch (err) {
  console.error(`Error compiling schema: ${err.message}`);
  process.exit(1);
}

// Find all YAML files in examples directory
const yamlFiles = fs.readdirSync(examplesPath)
  .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
  .sort();

if (yamlFiles.length === 0) {
  console.error(`Error: No YAML files found in ${examplesPath}`);
  process.exit(1);
}

console.log(`Testing WireViz JSON Schema against ${yamlFiles.length} YAML files...`);
console.log(`Schema: ${schemaPath}`);
console.log(`Examples: ${examplesPath}`);
console.log('');

// Test each file
let passed = 0;
let failed = 0;
const failures = [];

yamlFiles.forEach(yamlFile => {
  const filePath = path.join(examplesPath, yamlFile);
  
  try {
    // Load and parse YAML
    const yamlContent = fs.readFileSync(filePath, 'utf8');
    const data = yaml.load(yamlContent);
    
    // Validate
    const valid = validate(data);
    
    if (valid) {
      if (!quiet) {
        console.log(`✓ ${yamlFile}`);
      }
      passed++;
    } else {
      console.log(`✗ ${yamlFile}`);
      validate.errors.forEach(err => {
        console.log(`  - ${err.instancePath}: ${err.message}`);
      });
      failed++;
      failures.push(yamlFile);
    }
  } catch (err) {
    console.log(`✗ ${yamlFile} (parse error: ${err.message})`);
    failed++;
    failures.push(yamlFile);
  }
});

// Summary
console.log('');
console.log('='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed out of ${yamlFiles.length} tests`);
console.log('='.repeat(60));

if (failures.length > 0) {
  console.log(`\nFailed files: ${failures.join(', ')}`);
  process.exit(1);
} else {
  console.log('\n✓ All tests passed!');
  process.exit(0);
}
