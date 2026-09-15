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

The `js-yaml` dependency is already present in `package.json` (see PLAN Step 4); no changes to `package.json` are required for this step.

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
	
	// Per syntax.md, a harness is described by the connectors, cables and
	// connections sections. If any are absent, flag them as missing rather
	// than silently skipping validation.
	for (const section of wirevizKeys) {
		if (!keys.includes(section)) {
			const line = findLineNumber(doc, section);
			const range = new vscode.Range(
				new vscode.Position(line >= 0 ? line : 0, 0),
				new vscode.Position(line >= 0 ? line : 0, section.length)
			);
			diagnostics.push({
				severity: DiagnosticSeverity.Warning,
				message: `Missing WireViz section: '${section}'`,
				range,
				source: "wireviz"
			});
		}
	}
	
	// Validate connectors
	if (data.connectors && typeof data.connectors === "object") {
		validateConnectors(data.connectors, diagnostics, doc);
	}
	
	// Validate cables
	if (data.cables && typeof data.cables === "object") {
		validateCables(data.cables, diagnostics, doc);
	}
	
	// Validate connections. Per syntax.md `connections:` must be a list of
	// connection sets; a mapping is a structural error, not something to
	// silently skip.
	if (data.connections !== undefined) {
		if (!Array.isArray(data.connections)) {
			const line = findLineNumber(doc, "connections");
			if (line >= 0) {
				diagnostics.push({
					severity: DiagnosticSeverity.Error,
					message: "'connections' must be a list of connection sets",
					range: new vscode.Range(line, 0, line, "connections:".length),
					source: "wireviz"
				});
			}
		} else {
			const templateSeparator = data.options?.template_separator ?? ".";
			validateConnections(
				data.connections, data.connectors, data.cables,
				templateSeparator, diagnostics, doc
			);
		}
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

		// Per syntax.md, only the following conductor-info combinations are
		// permitted: wirecount only, colors only, or wirecount + color_code.
		// Using colors together with color_code is invalid.
		const hasWirecount = cable.wirecount !== undefined;
		const hasColors = cable.colors !== undefined;
		const hasColorCode = cable.color_code !== undefined;
		if (hasColors && hasColorCode) {
			const line = findPropertyLine(doc, name, "colors") >= 0
				? findPropertyLine(doc, name, "colors")
				: findPropertyLine(doc, name, "color_code");
			if (line >= 0) {
				diagnostics.push({
					severity: DiagnosticSeverity.Error,
					message: `Cable '${name}' cannot specify both 'colors' and 'color_code'. Permitted: colors only, wirecount only, or wirecount + color_code.`,
					range: new vscode.Range(line, 0, line, 40),
					source: "wireviz"
				});
			}
		}
		if (hasWirecount && hasColors) {
			const line = findPropertyLine(doc, name, "colors") >= 0
				? findPropertyLine(doc, name, "colors")
				: findPropertyLine(doc, name, "wirecount");
			if (line >= 0) {
				diagnostics.push({
					severity: DiagnosticSeverity.Warning,
					message: `Cable '${name}' specifies both 'wirecount' and 'colors'; wirecount is inferred from the colors list length.`,
					range: new vscode.Range(line, 0, line, 40),
					source: "wireviz"
				});
			}
		}
	}
}


// Symbols that may appear as a connection item instead of a designator.
const SINGLE_ARROWS = ["--", "<--", "<-->", "-->"];
const DOUBLE_ARROWS = ["==", "<==", "<==>", "==>"];

/**
 * Resolves a connection-item designator to the section it belongs to
 * ("connectors" | "cables") or undefined when unknown.
 *
 * Handles the three forms described in syntax.md:
 *  - mapping key: `<designator>: <pin|wire|list|s>` -> key is the designator
 *  - bare string designator: `<designator>` (simple connectors, double-arrow mates)
 *  - autogeneration: `<template><sep>[instance]`, e.g. `Y.Y1`, `Z.` (unnamed)
 * The designator may itself be a list `[<designator>, ...]` for parallel
 * single-pin connectors; in that case every entry must resolve.
 */
function resolveDesignator(
	item: any, connectors: any, cables: any, templateSeparator: string
): "connectors" | "cables" | undefined {
	// A list of designators resolves only if every element resolves to the
	// same section.
	if (Array.isArray(item)) {
		let section: "connectors" | "cables" | undefined;
		for (const sub of item) {
			const subSection = resolveDesignator(sub, connectors, cables, templateSeparator);
			if (subSection === undefined) {
				return undefined;
			}
			if (section === undefined) {
				section = subSection;
			} else if (section !== subSection) {
				return undefined;
			}
		}
		return section;
	}

	// Determine the designator string. A mapping item uses its single key as
	// the designator; a string item IS the designator.
	let designator: string | undefined;
	if (item !== null && typeof item === "object") {
		const entries = Object.entries(item);
		if (entries.length === 1) {
			designator = entries[0][0] as string;
		}
	} else if (typeof item === "string") {
		designator = item;
	}

	if (designator === undefined) {
		return undefined;
	}

	// Arrows are not components; they belong to neither section.
	if (SINGLE_ARROWS.includes(designator) || DOUBLE_ARROWS.includes(designator)) {
		return undefined;
	}

	// Direct lookup first.
	if (connectors && connectors[designator]) {
		return "connectors";
	}
	if (cables && cables[designator]) {
		return "cables";
	}

	// Autogeneration: `<template><sep>[instance]` or `<template><sep>` (unnamed).
	// The default separator is '.' and may be overridden via options.template_separator.
	const sepIndex = designator.indexOf(templateSeparator);
	if (sepIndex > 0) {
		const template = designator.slice(0, sepIndex);
		if (template && connectors && connectors[template]) {
			return "connectors";
		}
		if (template && cables && cables[template]) {
			return "cables";
		}
	}

	return undefined;
}

function validateConnections(
	connections: any[], connectors: any, cables: any,
	templateSeparator: string, diagnostics: Diagnostic[], doc: TextDocument
) {
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

		// Validate each item in the connection set and track which section
		// each item belongs to so we can enforce alternation.
		let previousSection: "connectors" | "cables" | undefined;
		for (let j = 0; j < connection.length; j++) {
			const item = connection[j];
			const line = findArrayItemLine(doc, "connections", i, j);

			// Resolve the designator for both mapping and string forms,
			// including autogeneration (`Y.Y1`, `Z.` with template_separator).
			const section = resolveDesignator(item, connectors, cables, templateSeparator);

			const isArrow = typeof item === "string"
				? SINGLE_ARROWS.includes(item) || DOUBLE_ARROWS.includes(item)
				: Array.isArray(item) && item.length > 0 && item.every(
					(a: any) => typeof a === "string"
						&& (SINGLE_ARROWS.includes(a) || DOUBLE_ARROWS.includes(a))
				);

			if (section === undefined && !isArrow) {
				// Not a component and not an arrow -> unknown designator.
				const designator = typeof item === "string"
					? item
					: (item !== null && typeof item === "object")
						? Object.keys(item)[0]
						: undefined;
				if (designator !== undefined && line >= 0) {
					diagnostics.push({
						severity: DiagnosticSeverity.Warning,
						message: `Unknown designator: '${designator}'. Not found in connectors or cables`,
						range: new vscode.Range(line, 0, line, designator.length + 2),
						source: "wireviz"
					});
				}
			}

			// Enforce the alternation rule: connection items must alternatingly
			// belong to the connectors and cables sections. Arrows sit between
			// two connector items and are skipped for this check.
			if (section === "connectors" || section === "cables") {
				if (previousSection === section && line >= 0) {
					const designator = typeof item === "string"
						? item
						: Object.keys(item)[0];
					diagnostics.push({
						severity: DiagnosticSeverity.Warning,
						message: `Connection items must alternatingly belong to connectors and cables; '${designator}' repeats '${section}'`,
						range: new vscode.Range(line, 0, line, 20),
						source: "wireviz"
					});
				}
				previousSection = section;
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
	let itemIndent = 0;
	let itemCount = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Check if we're entering the array
		if (line.includes(arrayName + ":")) {
			inArray = true;
			arrayIndent = line.search(/\S/);
			continue;
		}

		if (!inArray) {
			continue;
		}

		const trimmed = line.trim();
		if (trimmed === "") {
			continue;
		}
		const currentIndent = line.search(/\S/);

		// Left the array once we dedent to the array's level (or above) on a
		// non-array line.
		if (currentIndent <= arrayIndent && !trimmed.startsWith("-")) {
			inArray = false;
			continue;
		}

		// Top-level connection-set entries start with "-" at the array's
		// child indentation level.
		if (trimmed.startsWith("-") && currentIndent > arrayIndent) {
			if (itemCount === index) {
				itemIndent = currentIndent;
				if (subIndex === undefined) {
					return i;
				}
				// Walk forward collecting the sub-items of this connection
				// set: every following line whose "- " is indented deeper
				// than the set entry itself. This resolves sub-indices beyond 0.
				let subCount = 0;
				for (let j = i; j < lines.length; j++) {
					const subLine = lines[j];
					if (subLine.trim() === "") {
						continue;
					}
					// A new top-level set entry or a dedent ends the set.
					if (j > i) {
						const subIndent = subLine.search(/\S/);
						if (subLine.trim().startsWith("-") && subIndent <= itemIndent) {
							// Next connection set starts here; stop.
							break;
						}
						if (subIndent <= arrayIndent) {
							break;
						}
					}
					if (subLine.trim().startsWith("-")) {
						if (subCount === subIndex) {
							return j;
						}
						subCount++;
					}
				}
				return -1;
			}
			itemCount++;
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
		
		if (!doc || !isWirevizYamlFile(doc)) {
			createOrShowPreviewPanel(doc, "");
			show(MsgType.Err, "Not a WireViz YAML");
			return;
		}
		
		// Ensure we have a panel so we can show either output or errors
		createOrShowPreviewPanel(doc, "");
		
		show(MsgType.Info, "Validating YAML...");
		
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
