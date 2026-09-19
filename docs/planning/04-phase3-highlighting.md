# Phase 3: Advanced Highlighting Implementation

---

## Objective
Implement advanced highlighting in the BOM table that reflects the current selection in the YAML code. Highlight only the items that belong to the cursor position in the YAML code, including support for highlighting multiple items when the cursor is in a connection set that refers to multiple designators.

---

## Key Requirements
- **No new dependencies**: Cannot add `js-yaml` or similar libraries
- **Optional redhat-yaml**: Can leverage if installed, but must have fallback
- **Highlight single items**: When cursor is on a connector/cable definition
- **Highlight multiple items**: When cursor is in a connection set with multiple designators
- **Real-time updates**: Highlighting updates as cursor moves

---

## Architecture Overview

### Designator Extraction Strategy

Since we cannot add `js-yaml` as a dependency, we use a **two-tier approach**:

1. **Primary**: Use `redhat-yaml` extension API (if available)
   - Provides full YAML AST
   - Accurate node identification
   - Handles complex YAML structures

2. **Fallback**: Regex-based extraction
   - Line-based parsing
   - Pattern matching for WireViz-specific structures
   - Handles most common cases

### Highlighting Flow
```
Cursor Move → Extract Designators → Map to BOM Rows → Send to Webview → Highlight
```

---

## Implementation Details

### Step 1: Check for redhat-yaml Extension

Add utility to check if redhat-yaml is available:

```typescript
// src/utils/yamlHelper.ts
import * as vscode from 'vscode';

/**
 * Checks if redhat-yaml extension is installed and activated
 */
export function isRedhatYamlAvailable(): boolean {
    const yamlExt = vscode.extensions.getExtension('redhat.vscode-yaml');
    return yamlExt !== undefined;
}

/**
 * Gets the YAML extension API if available
 */
export function getYamlApi() {
    const yamlExt = vscode.extensions.getExtension('redhat.vscode-yaml');
    if (yamlExt && yamlExt.isActive) {
        return yamlExt.exports;
    }
    return null;
}
```

### Step 2: Designator Extraction with redhat-yaml

If redhat-yaml is available, use its API to get the syntax tree:

```typescript
// src/utils/designatorExtractor.ts
import * as vscode from 'vscode';
import { isRedhatYamlAvailable, getYamlApi } from './yamlHelper';

/**
 * Extracts designators from YAML at cursor position using redhat-yaml
 */
export function extractDesignatorsWithYamlApi(
    doc: vscode.TextDocument,
    position: vscode.Position
): string[] {
    try {
        const yamlApi = getYamlApi();
        if (!yamlApi || !yamlApi.parseYAML) {
            return [];
        }
        
        const text = doc.getText();
        const yamlDoc = yamlApi.parseYAML(text);
        
        // Find node at position
        const offset = doc.offsetAt(position);
        const node = findNodeAtOffset(yamlDoc, offset);
        
        if (!node) {
            return [];
        }
        
        // Extract designator from node
        return extractDesignatorsFromNode(node, yamlDoc);
        
    } catch (error) {
        console.warn('Failed to extract designators with YAML API:', error);
        return [];
    }
}

/**
 * Recursively finds the YAML node at a given offset
 */
function findNodeAtOffset(node: any, offset: number): any | null {
    if (!node) return null;
    
    // Check if this node contains the offset
    if (node.offset !== undefined && node.length !== undefined) {
        if (offset >= node.offset && offset < node.offset + node.length) {
            // Found containing node, check children
            if (node.children || node.mappings || node.items) {
                const children = node.children || node.mappings || node.items || [];
                for (const child of children) {
                    const result = findNodeAtOffset(child, offset);
                    if (result) return result;
                }
            }
            return node;
        }
        return null;
    }
    
    // Handle different node types
    if (node.kind && node.startPosition && node.endPosition) {
        const startOffset = node.startPosition;
        const endOffset = node.endPosition;
        if (offset >= startOffset && offset < endOffset) {
            if (node.properties || node.entries) {
                const children = node.properties || node.entries || [];
                for (const child of children) {
                    const result = findNodeAtOffset(child, offset);
                    if (result) return result;
                }
            }
            return node;
        }
        return null;
    }
    
    return null;
}

/**
 * Extracts designators from a YAML node
 */
function extractDesignatorsFromNode(node: any, root: any): string[] {
    const designators: string[] = [];
    
    // If node is a mapping key (e.g., "X1:", "W1:")
    if (node.key && typeof node.key.value === 'string') {
        const key = node.key.value;
        // Check if it's a WireViz designator (starts with letter, may contain numbers, dots, underscores)
        if (/^[A-Za-z][A-Za-z0-9_.]*$/.test(key)) {
            designators.push(key);
        }
    }
    
    // If node is in a connections array
    if (node.parent && node.parent.key && node.parent.key.value === 'connections') {
        // Extract all designators from the connection set
        const connection = node.parent;
        if (connection.items || connection.mappings) {
            const items = connection.items || connection.mappings || [];
            for (const item of items) {
                if (item.key && typeof item.key.value === 'string') {
                    const key = item.key.value;
                    if (/^[A-Za-z][A-Za-z0-9_.]*$/.test(key)) {
                        designators.push(key);
                    }
                }
            }
        }
    }
    
    // If node is in connectors or cables section
    if (node.parent && node.parent.key) {
        const parentKey = node.parent.key.value;
        if (parentKey === 'connectors' || parentKey === 'cables') {
            if (node.key && typeof node.key.value === 'string') {
                const key = node.key.value;
                if (/^[A-Za-z][A-Za-z0-9_.]*$/.test(key)) {
                    designators.push(key);
                }
            }
        }
    }
    
    return [...new Set(designators)]; // Deduplicate
}
```

### Step 3: Fallback Regex-Based Extraction

When redhat-yaml is not available, use regex patterns:

```typescript
// src/utils/designatorExtractor.ts (continued)

/**
 * Extracts designators using regex patterns (fallback method)
 */
export function extractDesignatorsWithRegex(
    doc: vscode.TextDocument,
    position: vscode.Position
): string[] {
    const line = doc.lineAt(position.line).text;
    const lineNumber = position.line;
    
    // Pattern 1: Direct key match (e.g., "X1:", "W1:", "F:")
    const keyPattern = /^(\s*)([A-Za-z][A-Za-z0-9_.]*)\s*:/;
    const keyMatch = line.match(keyPattern);
    if (keyMatch) {
        return [keyMatch[2]];
    }
    
    // Pattern 2: Connection set item (e.g., "- X1: [1-4]")
    const connectionPattern = /-\s*([A-Za-z][A-Za-z0-9_.]*)\s*:/g;
    let matches: RegExpExecArray | null;
    const connectionDesignators: string[] = [];
    
    while ((matches = connectionPattern.exec(line)) !== null) {
        connectionDesignators.push(matches[1]);
    }
    
    if (connectionDesignators.length > 0) {
        return connectionDesignators;
    }
    
    // Pattern 3: Multi-line connection set
    // Check if we're in a connections array by looking at nearby lines
    const isInConnections = isLineInConnectionsBlock(doc, lineNumber);
    if (isInConnections) {
        // Extract all designators from the connection set
        return extractConnectionDesignators(doc, lineNumber);
    }
    
    // Pattern 4: Check if line contains a designator reference in a connection
    const refPattern = /([A-Za-z][A-Za-z0-9_.]*)\s*:\s*\[/g;
    const refDesignators: string[] = [];
    let refMatch: RegExpExecArray | null;
    
    while ((refMatch = refPattern.exec(line)) !== null) {
        refDesignators.push(refMatch[1]);
    }
    
    if (refDesignators.length > 0) {
        return refDesignators;
    }
    
    return [];
}

/**
 * Checks if a line is within a connections block
 */
function isLineInConnectionsBlock(doc: vscode.TextDocument, lineNumber: number): boolean {
    // Look backwards for "connections:" line
    for (let i = lineNumber; i >= 0; i--) {
        const line = doc.lineAt(i).text.trim();
        if (line === 'connections:' || line === '- connections:') {
            return true;
        }
        if (line.length > 0 && !line.startsWith('-') && !line.startsWith(' ')) {
            break; // Reached a non-indented line
        }
    }
    return false;
}

/**
 * Extracts all designators from a connection set
 */
function extractConnectionDesignators(doc: vscode.TextDocument, lineNumber: number): string[] {
    const designators: Set<string> = new Set();
    
    // Find the start of the connection set
    let startLine = lineNumber;
    while (startLine >= 0) {
        const line = doc.lineAt(startLine).text;
        if (line.trim().startsWith('-')) {
            break;
        }
        startLine--;
    }
    
    // Collect all lines in the connection set
    const connectionLines: string[] = [];
    for (let i = startLine; i < doc.lineCount; i++) {
        const line = doc.lineAt(i).text;
        if (line.trim().startsWith('-') && line.trim() !== '-') {
            connectionLines.push(line);
        } else if (line.trim() === '-' || line.trim().length === 0) {
            continue;
        } else if (line.trim() && !line.startsWith(' ') && !line.startsWith('\t')) {
            break; // End of connection set
        } else {
            connectionLines.push(line);
        }
    }
    
    // Extract designators from each line
    const pattern = /-\s*([A-Za-z][A-Za-z0-9_.]*)\s*:/g;
    for (const line of connectionLines) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line)) !== null) {
            designators.add(match[1]);
        }
    }
    
    return Array.from(designators);
}

/**
 * Main designator extraction function
 * Uses redhat-yaml if available, falls back to regex
 */
export function extractDesignators(
    doc: vscode.TextDocument,
    position: vscode.Position
): string[] {
    if (isRedhatYamlAvailable()) {
        const designators = extractDesignatorsWithYamlApi(doc, position);
        if (designators.length > 0) {
            return designators;
        }
    }
    
    // Fallback to regex
    return extractDesignatorsWithRegex(doc, position);
}
```

### Step 4: Integration with Extension

Update `src/extension.ts` to track cursor position and send highlights:

```typescript
// Add state variable
let selectionDisposable: vscode.Disposable | null = null;

// Update createOrShowPreviewPanel to set up selection tracking
function createOrShowPreviewPanel(doc: TextDocument | undefined, outputDir: string) {
    const docColumn = window.activeTextEditor?.viewColumn;

    if (viewPanel) {
        viewPanel.webview.options = getWebviewOptions(outputDir);
        if (!viewPanel.visible) {
            viewPanel.reveal();
        }
    }
    else {
        viewPanel = window.createWebviewPanel(
            "WireVizPreview",
            "WireViz Preview",
            vscode.ViewColumn.Beside,
            getWebviewOptions(outputDir)
        );
        viewPanel.onDidDispose(() => {
            viewPanel = undefined;
            // Clean up selection tracking
            if (selectionDisposable) {
                selectionDisposable.dispose();
                selectionDisposable = null;
            }
        });

        // Return focus to text document
        if (doc && window.activeTextEditor && docColumn !== viewPanel.viewColumn) {
            window.showTextDocument(doc, docColumn);
        }
    }
    
    // Set up selection tracking for advanced highlighting
    setupSelectionTracking();
}

/**
 * Sets up cursor position tracking for BOM highlighting
 */
function setupSelectionTracking() {
    // Clean up previous disposable
    if (selectionDisposable) {
        selectionDisposable.dispose();
    }
    
    const doc = window.activeTextEditor?.document;
    if (!doc || !viewPanel) return;
    
    // Only track if we have BOM data and are in BOM view
    const shouldTrack = currentBomData.rows.length > 0 && currentView === 'bom';
    
    if (!shouldTrack) {
        // Clear any existing highlights
        if (viewPanel) {
            viewPanel.webview.postMessage({ type: 'clearHighlight' });
        }
        return;
    }
    
    // Debounce function to avoid excessive updates
    let timeout: NodeJS.Timeout | null = null;
    const debouncedUpdate = () => {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            updateHighlightFromCursor();
        }, 100); // 100ms debounce
    };
    
    // Track cursor position changes
    selectionDisposable = window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor.document !== doc) return;
        debouncedUpdate();
    });
    
    // Also track document changes (cursor might move on edit)
    const docChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document !== doc) return;
        debouncedUpdate();
    });
    
    // Combine disposables
    selectionDisposable = {
        dispose: () => {
            if (selectionDisposable) {
                selectionDisposable.dispose();
            }
            docChangeDisposable.dispose();
            if (timeout) {
                clearTimeout(timeout);
            }
        }
    };
    
    // Initial update
    updateHighlightFromCursor();
}

/**
 * Updates BOM highlighting based on current cursor position
 */
function updateHighlightFromCursor() {
    const doc = window.activeTextEditor?.document;
    if (!doc || !viewPanel) return;
    
    const selection = window.activeTextEditor?.selection;
    if (!selection) return;
    
    const cursorPosition = selection.active;
    const designators = extractDesignators(doc, cursorPosition);
    
    if (designators.length > 0) {
        viewPanel.webview.postMessage({
            type: 'highlightDesignators',
            designators: designators
        });
    } else {
        viewPanel.webview.postMessage({ type: 'clearHighlight' });
    }
}
```

### Step 5: Update BOM HTML for Highlighting

Add CSS for highlighting in `src/views/bom.html`:

```html
<style>
    /* Add to existing styles */
    table.bom-table tbody tr.highlighted {
        background-color: #ffeb3b !important;
        color: #000 !important;
        font-weight: bold;
    }
    
    table.bom-table tbody tr.highlighted:hover td {
        background-color: #ffeb3b !important;
    }
    
    table.bom-table tbody tr.highlighted td {
        border-bottom-color: #ffeb3b;
    }
</style>
```

Update the JavaScript in `src/views/bom.html` to handle highlighting:

```javascript
// In the message handler, add cases:
switch (message.type) {
    case 'setBomData':
        // ... existing code ...
        break;
        
    case 'highlightDesignators':
        highlightDesignators(message.designators);
        break;
        
    case 'clearHighlight':
        clearHighlight();
        break;
}

// Add these functions:
function highlightDesignators(designators) {
    if (!designators || designators.length === 0) {
        clearHighlight();
        return;
    }
    
    const designatorSet = new Set(designators.map(d => d.trim()));
    
    document.querySelectorAll('#bom-body tr').forEach(row => {
        const rowDesignators = (row.getAttribute('data-designators') || '').split(',').map(d => d.trim());
        const hasMatch = rowDesignators.some(d => designatorSet.has(d));
        
        if (hasMatch) {
            row.classList.add('highlighted');
            // Scroll first matching row into view
            if (row === document.querySelector('#bom-body tr.highlighted:first-child')) {
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } else {
            row.classList.remove('highlighted');
        }
    });
}

function clearHighlight() {
    document.querySelectorAll('#bom-body tr').forEach(row => {
        row.classList.remove('highlighted');
    });
}
```

### Step 6: Update BOM Row Data Attributes

Ensure BOM rows have proper designator data attributes:

```typescript
// In src/extension.ts, when sending BOM data:
viewPanel.webview.postMessage({
    type: 'setBomData',
    data: currentBomData.rows.map(row => ({
        ...row,
        // Ensure Designators is always a string
        Designators: row.Designators || ''
    }))
});
```

In the BOM HTML table rendering:

```javascript
// Update the row generation in renderTable:
const rows = sorted.map(row => {
    const cells = Object.values(row).map((val, idx) => {
        const colClass = headers[idx].classList.contains('col-id') ? 'col-id' :
                       headers[idx].classList.contains('col-description') ? 'col-description' :
                       headers[idx].classList.contains('col-qty') ? 'col-qty' :
                       headers[idx].classList.contains('col-unit') ? 'col-unit' : 'col-designators';
        return `<td class="${colClass}">${escapeHtml(val)}</td>`;
    }).join('');
    return `<tr data-designators="${(row.Designators || '').split(',').map(d => d.trim()).join(',')}">${cells}</tr>`;
});
```

---

## Testing Strategy

### Unit Tests
- [ ] Designator extraction with redhat-yaml
- [ ] Designator extraction with regex (fallback)
- [ ] Single designator extraction
- [ ] Multiple designators from connection set
- [ ] Edge cases (cursor on whitespace, comments, etc.)

### Integration Tests
- [ ] Highlight updates on cursor move
- [ ] Highlight clears when cursor leaves YAML
- [ ] Multiple items highlighted for connection sets
- [ ] Highlight persists across view toggles
- [ ] Highlight updates when document changes

### Edge Cases
- [ ] Cursor on comment line
- [ ] Cursor on empty line
- [ ] Cursor in metadata section
- [ ] Cursor in templates section
- [ ] Very long designator names
- [ ] Designators with special characters
- [ ] Rapid cursor movement

---

## Performance Considerations

| Operation | Frequency | Optimization |
|-----------|-----------|--------------|
| Cursor move detection | High | Debounced (100ms) |
| Designator extraction | High | Cached, tiered approach |
| BOM row lookup | High | Use data attributes, Set for O(1) lookup |
| DOM updates | Medium | Batch updates, minimize reflows |
| Scroll into view | Low | Only for first match |

### Optimization Techniques

1. **Debouncing**: Delay highlight updates by 100ms after cursor stops moving
2. **Caching**: Cache extracted designators for each line
3. **Efficient Lookup**: Use JavaScript Set for O(1) designator lookups
4. **Minimal DOM Updates**: Only update classes, not recreate rows
5. **Selective Scrolling**: Only scroll first matching row into view

---

## Success Criteria

- [ ] Single designator highlights correctly
- [ ] Connection sets highlight all related BOM items
- [ ] Highlighting updates in real-time (with debounce)
- [ ] Highlighting works with redhat-yaml (when available)
- [ ] Highlighting works with regex fallback
- [ ] No performance issues with large BOMs
- [ ] Highlights are visually clear and distinct
- [ ] Highlights clear when cursor leaves relevant sections

---

## Fallback Behavior

If designator extraction fails or returns no results:
1. Clear all highlights
2. Log debug message (not error)
3. Continue normal operation
4. Retry on next cursor move

---

## Configuration Options (Optional)

Consider adding these configuration options:

```json
{
    "wireviz.highlightDelay": {
        "type": "number",
        "default": 100,
        "description": "Delay in milliseconds before updating BOM highlighting (debounce)"
    },
    "wireviz.enableBomHighlighting": {
        "type": "boolean",
        "default": true,
        "description": "Enable BOM highlighting based on cursor position"
    }
}
```

---

## Completion

Once Phase 3 is implemented and tested, the BOM feature will be complete with:
- Core BOM display with sorting and filtering
- Toggle between diagram and BOM views
- Advanced highlighting based on YAML cursor position
- Support for single and multiple designator highlighting
- No new dependencies required
- Optional enhancement with redhat-yaml
