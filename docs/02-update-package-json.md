# Step 2: Update package.json to Register the Schema

## Objective
Register the WireViz JSON Schema in package.json so VSCode automatically applies it to YAML files.

## References
- [VSCode YAML Language Server](https://github.com/redhat-developer/vscode-yaml)
- [VSCode Contribution Points - yamlValidation](https://code.visualstudio.com/api/references/contribution-points#contributes.yamlValidation)
- [VSCode JSON Schema Documentation](https://code.visualstudio.com/docs/languages/json#_json-schemas-and-settings)

## Implementation

### Add Schema Contribution

In `package.json`, add a `yamlValidation` section under the `contributes` key:

```json
{
  "contributes": {
    "yamlValidation": [
      {
        "fileMatch": [
          "*.yml",
          "*.yaml"
        ],
        "url": "./schemas/wireviz-schema.json",
        "scope": "source.yaml"
      }
    ]
  }
}
```

### Alternative: Conditional Schema Activation

For better performance and to avoid applying the schema to all YAML files, use a more specific file pattern or implement conditional activation:

```json
{
  "contributes": {
    "yamlValidation": [
      {
        "fileMatch": [
          "*wireviz*.yml",
          "*wireviz*.yaml",
          "*wiring*.yml",
          "*wiring*.yaml",
          "*harness*.yml",
          "*harness*.yaml"
        ],
        "url": "./schemas/wireviz-schema.json",
        "scope": "source.yaml"
      }
    ]
  }
}
```

### Notes on File Patterns

- The `fileMatch` array uses glob patterns to match filenames
- Patterns are relative to the workspace root
- More specific patterns reduce the schema's application scope
- Consider common naming conventions for WireViz files

## Schema URL Options

The `url` can be:
- A relative path (e.g., `./schemas/wireviz-schema.json`) - bundled with the extension
- An absolute HTTP/HTTPS URL - fetched from a remote server

For offline functionality and reliability, use a relative path.

## Testing the Schema Registration

After updating package.json:

1. Run the extension in development mode
2. Open a YAML file matching the fileMatch patterns
3. Verify that:
   - The schema is applied (check VSCode's bottom-right status bar)
   - Autocomplete works for WireViz properties
   - Validation errors appear for invalid YAML
   - Hover tooltips show property descriptions

## Important Considerations

1. **Performance**: Applying schemas to all YAML files can impact performance. Use specific patterns.

2. **Schema Versioning**: Consider adding a version identifier to the schema URL to allow updates without breaking existing setups.

3. **Fallback**: The schema should be permissive enough to not break validation on valid WireViz files that use undocumented features.

4. **Documentation**: Update the extension's README to mention the schema validation feature.

## References to Existing Implementations

- [redhat-developer/vscode-yaml](https://github.com/redhat-developer/vscode-yaml) - The YAML language server used by VSCode
- [Kubernetes VSCode Extension](https://github.com/Azure/vscode-kubernetes-tools) - Example of conditional schema activation
- [AWS CloudFormation](https://github.com/aws-cloudformation/cfn-python-lint) - Uses JSON Schema for validation
