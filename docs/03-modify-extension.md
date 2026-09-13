# Step 3: Modify extension.ts for Pre-Validation and Diagnostics

## Objective
Modify extension.ts to add:
- Pre-execution YAML validation
- Diagnostic markers for validation errors
- Conditional schema activation based on file content

## References
- [VSCode Extension API - Diagnostics](https://code.visualstudio.com/api/references/vscode-api#Diagnostic)
- [VSCode DiagnosticCollection](https://code.visualstudio.com/api/references/vscode-api#DiagnosticCollection)
- [VSCode TextDocument](https://code.visualstudio.com/api/references/vscode-api#TextDocument)
- [js-yaml Documentation](https://github.com/nodeca/js-yaml)

## Implementation

### 1. Add Dependencies

First, add the js-yaml dependency to package.json:

```json
{
  "dependencies": {
    "await-spawn": "4.x",
    "js-yaml": "^4.1.0",
    "semver": "7.x"
  }
}
```

### 2. Import Required Modules

At the top of extension.ts, add the import for js-yaml:

```typescript
import aspawn from "await-spawn";
import path from "path";
import semver from "semver";
import yaml from "js-yaml";
import vscode, { window, TextDocument, Uri, WebviewOptions, Diagnostic, DiagnosticCollection, DiagnosticSeverity } from "vscode";
```

### 3. Create Diagnostic Collection

Add a diagnostic collection as a global variable:

```typescript
let viewPanel: vscode.WebviewPanel | undefined;
let isRunning = false;
let wirevizDiagnostics: DiagnosticCollection;
```

Initialize it in the activate function:

```typescript
export async function activate(context: vscode.ExtensionContext) {
	// Create diagnostic collection for WireViz validation errors
	wirevizDiagnostics = vscode.languages.createDiagnosticCollection("wireviz");
	
	context.subscriptions.push(
		wirevizDiagnostics,
		vscode.commands.registerCommand("wireviz.showPreview", async() => await showPreview()),
		vscode.workspace.onDidSaveTextDocument(onDocumentSaved),
		vscode.workspace.onDidOpenTextDocument(onDocumentOpened),
		vscode.workspace.onDidChangeTextDocument(onDocumentChanged)
	);
}
```

### 4. Add Document Event Handlers

Add handlers for document events to trigger validation:

```typescript
async function onDocumentOpened(doc: TextDocument) {
	if (isWirevizYamlFile(doc)) {
		validateWirevizDocument(doc);
	}
}

async function onDocumentChanged(evt: vscode.TextDocumentChangeEvent) {
	const doc = evt.document;
	if (isWirevizYamlFile(doc)) {
		// Debounce rapid changes
		clearTimeout(validationTimeout);
		validationTimeout = setTimeout(() => validateWirevizDocument(doc), 500);
	}
}

let validationTimeout: NodeJS.Timeout | undefined;
```

### 5. Implement YAML Validation Function

Create a function to validate YAML and display diagnostics:

```typescript
/**
 * Validates a WireViz YAML document and displays diagnostic markers
 */
function validateWirevizDocument(doc: TextDocument) {
	// Clear previous diagnostics for this document
	wirevizDiagnostics.delete(doc.uri);
	
	const diagnostics: Diagnostic[] = [];
	const text = doc.getText();
	
	// Skip empty documents
	if (!text || text.trim() === "") {
		return;
	}
	
	try {
		// Parse YAML
		const yamlData = yaml.load(text) as any;
		
		// Validate WireViz structure
		const validationErrors = validateWirevizStructure(yamlData, doc);
		diagnostics.push(...validationErrors);
		
	} catch (error: any) {
		// YAML syntax error
		if (error instanceof yaml.YAMLException) {
			const line = error.mark?.line ?? 0;
			const column = error.mark?.column ?? 0;
			
			const startPos = new vscode.Position(line, column);
			const endPos = new vscode.Position(line, column + 10);
			
			diagnostics.push({
				severity: DiagnosticSeverity.Error,
				message: error.message,
				range: new vscode.Range(startPos, endPos),
				source: "wireviz"
			});
		}
	}
	
	// Update diagnostics
	if (diagnostics.length > 0) {
		wirevizDiagnostics.set(doc.uri, diagnostics);
	}
}
```

### 6. Implement WireViz Structure Validation

Create a function to validate WireViz-specific structure:

```typescript
/**
 * Validates WireViz-specific structure and returns diagnostic errors
 */
function validateWirevizStructure(data: any, doc: TextDocument): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	
	// If data is not an object, it's not a valid WireViz file
	if (typeof data !== "object" || data === null) {
		const startPos = new vscode.Position(0, 0);
		const endPos = new vscode.Position(0, 10);
		
		diagnostics.push({
			severity: DiagnosticSeverity.Error,
			message: "WireViz file must contain a YAML mapping (object)",
			range: new vscode.Range(startPos, endPos),
			source: "wireviz"
		});
		
		return diagnostics;
	}
	
	const keys = Object.keys(data);
	
	// Check for at least one WireViz-specific key
	const wirevizKeys = ["connectors", "cables", "connections"];
	const hasWirevizKey = wirevizKeys.some(key => keys.includes(key));
	
	if (!hasWirevizKey) {
		// This might not be a WireViz file, but don't report an error
		// Just skip validation
		return diagnostics;
	}
	
	// Validate connectors
	if (data.connectors && typeof data.connectors === "object") {
		validateConnectors(data.connectors, diagnostics, doc);
	}
	
	// Validate cables
	if (data.cables && typeof data.cables === "object") {
		validateCables(data.cables, diagnostics, doc);
	}
	
	// Validate connections
	if (data.connections && Array.isArray(data.connections)) {
		validateConnections(data.connections, data.connectors, data.cables, diagnostics, doc);
	}
	
	return diagnostics;
}
```

### 7. Implement Individual Validation Functions

Create helper functions for validating each section:

```typescript
function validateConnectors(connectors: any, diagnostics: Diagnostic[], doc: TextDocument) {
	for (const [name, connector] of Object.entries(connectors)) {
		if (typeof connector !== "object" || connector === null) {
			const line = findLineNumber(doc, name);
			if (line >= 0) {
				diagnostics.push({
					severity: DiagnosticSeverity.Error,
					message: `Connector '${name}' must be an object`,
					range: new vscode.Range(line, 0, line, name.length),
					source: "wireviz"
				});
			}
			continue;
		}
		
		// Check for required or recommended fields
		if (connector.pincount !== undefined && typeof connector.pincount !== "number") {
			const line = findPropertyLine(doc, name, "pincount");
			if (line >= 0) {
				diagnostics.push({
					severity: DiagnosticSeverity.Warning,
					message: "pincount should be a number",
					range: new vscode.Range(line, 0, line, 20),
					source: "wireviz"
				});
			}
		}
	}
}

function validateCables(cables: any, diagnostics: Diagnostic[], doc: TextDocument) {
	for (const [name, cable] of Object.entries(cables)) {
		if (typeof cable !== "object" || cable === null) {
			const line = findLineNumber(doc, name);
			if (line >= 0) {
				diagnostics.push({
					severity: DiagnosticSeverity.Error,
					message: `Cable '${name}' must be an object`,
					range: new vscode.Range(line, 0, line, name.length),
					source: "wireviz"
				});
			}
			continue;
		}
		
		// Check for color_code validity
		if (cable.color_code !== undefined) {
			const validColorCodes = ["DIN", "IEC", "TEL", "TELALT", "T568A", "T568B", "BW"];
			if (!validColorCodes.includes(cable.color_code)) {
				const line = findPropertyLine(doc, name, "color_code");
				if (line >= 0) {
					diagnostics.push({
						severity: DiagnosticSeverity.Error,
						message: `Invalid color_code: '${cable.color_code}'. Valid values: ${validColorCodes.join(", ")}`,
						range: new vscode.Range(line, 0, line, 30),
						source: "wireviz"
					});
				}
			}
		}
	}
}

function validateConnections(connections: any[], connectors: any, cables: any, diagnostics: Diagnostic[], doc: TextDocument) {
	for (let i = 0; i < connections.length; i++) {
		const connection = connections[i];
		
		if (!Array.isArray(connection)) {
			const line = findArrayItemLine(doc, "connections", i);
			if (line >= 0) {
				diagnostics.push({
					severity: DiagnosticSeverity.Error,
					message: "Connection set must be an array",
					range: new vscode.Range(line, 0, line, 20),
					source: "wireviz"
				});
			}
			continue;
		}
		
		// Validate each item in the connection set
		for (let j = 0; j < connection.length; j++) {
			const item = connection[j];
			
			// Check if it's a string designator
			if (typeof item === "string") {
				// Check if it references a known connector or cable
				const isSpecialSymbol = ["--", "<--", "<-->", "-->", "==", "<==", "<==>", "==>"].includes(item);
				const isConnector = connectors && connectors[item];
				const isCable = cables && cables[item];
				
				if (!isSpecialSymbol && !isConnector && !isCable) {
					const line = findArrayItemLine(doc, "connections", i, j);
					if (line >= 0) {
						diagnostics.push({
							severity: DiagnosticSeverity.Warning,
							message: `Unknown designator: '${item}'. Not found in connectors or cables`,
							range: new vscode.Range(line, 0, line, item.length + 2),
							source: "wireviz"
						});
					}
				}
			}
		}
	}
}
```

### 8. Add Helper Functions

```typescript
/**
 * Finds the line number where a property is defined in a section
 */
function findPropertyLine(doc: TextDocument, sectionName: string, propertyName: string): number {
	const text = doc.getText();
	const lines = text.split("\n");
	
	let inSection = false;
	let indentLevel = 0;
	
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		
		// Check if we're entering the section
		if (line.includes(sectionName + ":")) {
			inSection = true;
			indentLevel = line.search(/\S/); // Find first non-whitespace
			continue;
		}
		
		// If we're in the section, check for the property
		if (inSection) {
			// Check if we've left the section (dedented to same or less level)
			const currentIndent = line.search(/\S/);
			if (currentIndent <= indentLevel && line.trim() !== "") {
				inSection = false;
			}
			
			// Check for the property
			if (line.includes(propertyName + ":")) {
				return i;
			}
		}
	}
	
	return -1;
}

/**
 * Finds the line number where a top-level key is defined
 */
function findLineNumber(doc: TextDocument, keyName: string): number {
	const text = doc.getText();
	const lines = text.split("\n");
	
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].includes(keyName + ":")) {
			return i;
		}
	}
	
	return -1;
}

/**
 * Finds the line number of a specific item in an array
 */
function findArrayItemLine(doc: TextDocument, arrayName: string, index: number, subIndex?: number): number {
	const text = doc.getText();
	const lines = text.split("\n");
	
	let inArray = false;
	let arrayIndent = 0;
	let itemCount = 0;
	
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		
		// Check if we're entering the array
		if (line.includes(arrayName + ":")) {
			inArray = true;
			arrayIndent = line.search(/\S/);
			continue;
		}
		
		// If we're in the array
		if (inArray) {
			const currentIndent = line.search(/\S/);
			
			// Check if we've left the array
			if (currentIndent <= arrayIndent && line.trim() !== "" && !line.trim().startsWith("-")) {
				inArray = false;
			}
			
			// Count array items
			if (line.trim().startsWith("-")) {
				if (itemCount === index) {
					if (subIndex === undefined) {
						return i;
					}
					// For sub-items, we need to track nested arrays
					// This is a simplified version
					if (subIndex === 0) {
						return i;
					}
				}
				itemCount++;
			}
		}
	}
	
	return -1;
}
```

### 9. Update showPreview Function

Modify the showPreview function to validate before execution:

```typescript
async function showPreview() {
	// Very basic locking to prevent concurrent calls
	if (isRunning) {
		return;
	}
	isRunning = true;

	try {
		const doc = window.activeTextEditor?.document;
		
		// Ensure we have a panel so we can show either output or errors
		createOrShowPreviewPanel(doc, "");
		
		show(MsgType.Info, "Validating YAML...");
		
		if (!doc || !isWirevizYamlFile(doc)) {
			show(MsgType.Err, "Not a WireViz YAML");
			return;
		}
		
		// Validate the document
		validateWirevizDocument(doc);
		
		// Check if there are validation errors
		const currentDiagnostics = wirevizDiagnostics.get(doc.uri);
		if (currentDiagnostics && currentDiagnostics.length > 0) {
			const errorCount = currentDiagnostics.filter(d => d.severity === DiagnosticSeverity.Error).length;
			if (errorCount > 0) {
				show(MsgType.Err, `Found ${errorCount} validation error(s). Please fix them before generating the diagram.`);
				return;
			}
		}
		
		if (await isAnyWirevizError()) {
			return;
		}
		
		// Rest of the existing function...
		
	} finally {
		isRunning = false;
	}
}
```

### 10. Update isWirevizYamlFile Function

Enhance the detection function:

```typescript
// Enhanced check for WireViz YAML files
const isWvContent: RegExp = /connections:|cables:|connectors:/gm;
function isWirevizYamlFile(doc: TextDocument) {
	return doc.languageId === "yaml"
		&& doc.getText()?.match(isWvContent)?.length >= 1;
}
```

## Testing

Test the implementation by:

1. Opening a valid WireViz YAML file - should show no diagnostics
2. Opening a YAML file with syntax errors - should show red squiggles
3. Opening a YAML file with invalid WireViz structure - should show warnings/errors
4. Attempting to preview a file with validation errors - should prevent execution

## Notes

- The validation is designed to be non-blocking for warnings, but blocking for errors
- Diagnostics appear in real-time as the user types (with a 500ms debounce)
- The validation only runs on files that appear to be WireViz files
- Consider adding more sophisticated validation rules over time
