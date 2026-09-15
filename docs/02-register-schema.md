# Step 2: Update extension.ts to Register Dynamic Schema via vscode-yaml API

## Objective
Register the WireViz JSON Schema using the `vscode-yaml` extension's `registerContributor` API for dynamic, content-based schema association. This provides better flexibility than the static `yamlValidation` contribution point.

## References
- [VSCode YAML Language Server](https://github.com/redhat-developer/vscode-yaml)
- [VSCode Contribution Points - yamlValidation](https://code.visualstudio.com/api/references/contribution-points#contributes.yamlValidation)
- [VSCode JSON Schema Documentation](https://code.visualstudio.com/docs/languages/json#_json-schemas-and-settings)
- [vscode-yaml Extension API - registerContributor](https://github.com/redhat-developer/vscode-yaml/wiki/Extension-API#register-contributor)

## Implementation

### Alternative Approach: Dynamic Schema Registration via registerContributor

Instead of using the static `yamlValidation` contribution point, use the `vscode-yaml` extension's `registerContributor` API to dynamically associate schemas based on file content. This approach provides:

- **Content-based detection**: Schema is applied only when the file contains WireViz-specific content
- **Better performance**: No need to apply schema to all YAML files or use filename patterns
- **More flexibility**: Can detect WireViz files regardless of their filename

### Detection Rules

A valid WireViz file **must** satisfy one of the following conditions:
1. **At least one connector or cable is defined** (e.g., `connectors: { ... }` or `cables: { ... }`).
2. **If `connections` are defined**, there must be **at least two components** (connectors or cables) referenced in the file, as connections require alternating references to both.

**Note**: Metadata, Options, and Tweak are excluded from detection as they are too generic.

### Implementation in extension.ts

Add the following to your extension's `activate` function:

```typescript
/** Custom schema URI for WireViz */
const SCHEMA = "wireviz";

/**
 * Registers a WireViz schema contributor with the vscode-yaml extension
 * to provide dynamic schema association based on file content.
 */
async function registerWireVizYamlContributor(context: vscode.ExtensionContext) {
	try {
		const yamlExtension = vscode.extensions.getExtension<{
			registerContributor: (schema: string, onRequestSchemaURI: (resource: string) => string | undefined, onRequestSchemaContent: (schemaUri: string) => string | undefined) => void;
		}>("redhat.vscode-yaml");
		
		if (yamlExtension) {
			await yamlExtension.activate();
			
			// Read the schema content once and cache it
			const schemaPath = vscode.Uri.joinPath(context.extensionUri, "schemas", "wireviz-schema.json");
			const schemaContent = await vscode.workspace.fs.readFile(schemaPath);
			const schemaJSON = Buffer.from(schemaContent).toString("utf-8");
			
			// Register the contributor
			yamlExtension.exports.registerContributor(
				SCHEMA,
				onRequestSchemaURI,
				(schemaUri: string) => {
					const parsedUri = vscode.Uri.parse(schemaUri);
					if (parsedUri.scheme !== SCHEMA) {
						return undefined;
					}
					return schemaJSON;
				}
			);
			
			console.log("WireViz YAML contributor registered successfully");
		}
	} catch (error) {
		console.error("Failed to register WireViz YAML contributor:", error);
	}
}

/**
 * Callback for vscode-yaml to determine if a file should use the WireViz schema.
 * Uses detection logic based on WireViz file structure.
 */
async function onRequestSchemaURI(resource: string): Promise<string | undefined> {
	const uri = vscode.Uri.parse(resource);
	
	// Only consider YAML files
	if (uri.scheme !== "file" || (!resource.endsWith(".yaml") && !resource.endsWith(".yml"))) {
		return undefined;
	}
	
	try {
		const content = await vscode.workspace.fs.readFile(uri);
		const text = Buffer.from(content).toString("utf-8");
		
		// Check for top-level WireViz keys (case-insensitive)
		const hasConnectors = /^\s*connectors:/m.test(text);
		const hasCables = /^\s*cables:/m.test(text);
		const hasConnections = /^\s*connections:/m.test(text);
		
		// Count defined components (connectors or cables)
		const componentCount = (hasConnectors ? 1 : 0) + (hasCables ? 1 : 0);
		
		// Rule 1: At least one connector or cable is defined
		if (componentCount >= 1) {
			return `${SCHEMA}://schema/wireviz`;
		}
		
		// Rule 2: If connections are defined, at least two components must exist
		if (hasConnections && componentCount >= 2) {
			return `${SCHEMA}://schema/wireviz`;
		}
		
	} catch (err) {
		console.error(`Failed to read file: ${resource}`, err);
	}
	
	return undefined;
}
```

Then call `registerWireVizYamlContributor(context)` in your `activate` function:

```typescript
export async function activate(context: vscode.ExtensionContext) {
	// Register WireViz schema contributor with vscode-yaml extension
	registerWireVizYamlContributor(context);
	
	context.subscriptions.push(
		vscode.commands.registerCommand("wireviz.showPreview", async() => await showPreview()),
		vscode.workspace.onDidSaveTextDocument(onDocumentSaved)
	);
}
```

## Testing the Schema Registration

After implementing the dynamic schema registration:

1. Run the extension in development mode
2. Open a YAML file containing WireViz content (with `connectors:`, `cables:`, or `connections:` keys)
3. Verify that:
   - The schema is applied (check VSCode's bottom-right status bar)
   - Autocomplete works for WireViz properties
   - Validation errors appear for invalid YAML
   - Hover tooltips show property descriptions
   - Schema is NOT applied to regular YAML files without WireViz content

## Important Considerations

1. **Performance**: The dynamic approach only applies the schema when WireViz content is detected, avoiding performance impact on other YAML files.

2. **Schema Versioning**: Consider adding a version identifier to the schema URI to allow updates without breaking existing setups.

3. **Fallback**: The schema should be permissive enough to not break validation on valid WireViz files that use undocumented features.

4. **Documentation**: Update the extension's README to mention the schema validation feature.

5. **Dependency**: The extension now depends on the `redhat.vscode-yaml` extension being installed. This is typically available in VSCode by default.

## References to Existing Implementations

- [redhat-developer/vscode-yaml](https://github.com/redhat-developer/vscode-yaml) - The YAML language server used by VSCode
- [vscode-yaml Extension API](https://github.com/redhat-developer/vscode-yaml/wiki/Extension-API#register-contributor) - Dynamic schema registration API
- [Kubernetes VSCode Extension](https://github.com/Azure/vscode-kubernetes-tools) - Example of conditional schema activation
