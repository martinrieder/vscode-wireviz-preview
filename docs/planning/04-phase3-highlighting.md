# Phase 3: Advanced Highlighting Implementation

---

## Objective
Implement advanced highlighting in the BOM table that reflects the current selection in the YAML code. Highlight only the items that belong to the cursor position in the YAML code, including support for highlighting multiple items when the cursor is in a connection set that refers to multiple designators.

---

## Key Requirements
- **No new dependencies**: Cannot add `js-yaml` or similar libraries
- **Regex-based extraction**: Primary method for designator extraction
- **Highlight single items**: When cursor is on a connector/cable definition
- **Highlight multiple items**: When cursor is in a connection set with multiple designators
- **Real-time updates**: Highlighting updates as cursor moves

---

## Architecture Overview

### Designator Extraction Strategy

Since we cannot add `js-yaml` as a dependency and redhat-yaml does not provide syntax tree access, we use a **regex-based approach**:

1. **Context-aware parsing**: Determine which section (connectors, cables, connections) the cursor is in
2. **Pattern matching**: Extract designators using WireViz-specific regex patterns
3. **Connection set handling**: When in connections section, extract all designators from the connection set

### Highlighting Flow
```
Cursor Move → Determine Context → Extract Designators → Map to BOM Rows → Send to Webview → Highlight
```

---

## Research Findings

### redhat-yaml Extension API Analysis
The `redhat.vscode-yaml` extension **does NOT provide** an API for:
- Getting the YAML syntax tree
- Getting the node at a specific position
- Parsing YAML documents programmatically

The extension only provides:
- Schema contributor registration
- Schema modification

**Conclusion**: We cannot use redhat-yaml for syntax tree access. Regex-based extraction is the only viable approach.

---

## Implementation Details

### Step 1: Add Cursor Tracking

**File**: `src/extension.ts`

```typescript
// Add state variables
let selectionDisposable: vscode.Disposable | null = null;
let designatorCache: Map<number, string[]> = new Map();
let cacheDocVersion: number = -1;

// Modify createOrShowPreviewPanel to set up selection tracking
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
    
    // Only track if we have BOM data with designators
    const hasDesignators = currentBomData.rows.some(r => r.Designators);
    if (!hasDesignators) {
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
    const selectionChangeDisposable = window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor.document !== doc) return;
        debouncedUpdate();
    });
    
    // Also track document changes (cursor might move on edit)
    const docChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document !== doc) return;
        // Invalidate cache
        designatorCache.clear();
        debouncedUpdate();
    });
    
    // Combine disposables
    selectionDisposable = {
        dispose: () => {
            if (timeout) {
                clearTimeout(timeout);
            }
            selectionChangeDisposable.dispose();
            docChangeDisposable.dispose();
        }
    };
    
    // Initial update
    updateHighlightFromCursor();
}
```

---

### Step 2: Create Designator Extractor Utility

**File**: `src/utils/designatorExtractor.ts` (new file)

```typescript
import * as vscode from 'vscode';

/**
 * Extracts designators from YAML at cursor position using regex patterns.
 * Handles WireViz-specific YAML structure.
 */
export function extractDesignators(
    doc: vscode.TextDocument,
    position: vscode.Position
): string[] {
    const lineNumber = position.line;
    const line = doc.lineAt(lineNumber).text;
    
    // Get current section context
    const currentSection = getCurrentSection(doc, lineNumber);
    
    switch (currentSection) {
        case 'connectors':
        case 'cables':
            return extractDefinitionDesignator(line);
        
        case 'connections':
            return extractConnectionSetDesignators(doc, lineNumber);
        
        default:
            // Try to extract from any line
            return extractAnyDesignator(line);
    }
}

/**
 * Gets the current YAML section (connectors, cables, connections, etc.)
 */
function getCurrentSection(doc: vscode.TextDocument, lineNumber: number): string | null {
    // Look backwards for section headers (max 50 lines back)
    const startLine = Math.max(0, lineNumber - 50);
    
    for (let i = lineNumber; i >= startLine; i--) {
        const line = doc.lineAt(i).text.trim();
        
        // Check for top-level section headers
        if (line === 'connectors:' || line === 'cables:' || line === 'connections:') {
            return line.replace(':', '');
        }
        
        // Stop at top-level (non-indented line that's not a list item)
        if (line.length > 0 && 
            !line.startsWith(' ') && 
            !line.startsWith('\t') &&
            !line.startsWith('-')) {
            break;
        }
    }
    return null;
}

/**
 * Extracts designator from a connector/cable definition line
 * Example: "X1:" or "  X1:"
 */
function extractDefinitionDesignator(line: string): string[] {
    // Pattern: optional whitespace, optional "-", designator, colon
    // Matches: "X1:", "  X1:", "- X1:"
    const pattern = /^(\s*(?:-\s*)?)([A-Za-z][A-Za-z0-9_.]*)\s*:/;
    const match = line.match(pattern);
    
    if (match) {
        return [match[2]]; // Return the designator
    }
    
    return [];
}

/**
 * Extracts all designators from a connection set
 * Example connection set:
 * connections:
 *   -
 *     - X1: [1-4]
 *     - W1: [1-4]
 *     - X2: [1-4]
 */
function extractConnectionSetDesignators(doc: vscode.TextDocument, lineNumber: number): string[] {
    const designators: Set<string> = new Set();
    
    // Find the start of the connection set (line starting with "-")
    let startLine = lineNumber;
    while (startLine >= Math.max(0, lineNumber - 50)) {
        const line = doc.lineAt(startLine).text.trim();
        
        // Found the start of the connection set
        if (line.startsWith('-') && line !== '-') {
            break;
        }
        
        // Stop if we hit a non-connection line at top level
        if (line.length > 0 && 
            !line.startsWith(' ') && 
            !line.startsWith('\t') &&
            !line.startsWith('-')) {
            return [];
        }
        
        startLine--;
    }
    
    // Collect all lines in this connection set
    const connectionLines: string[] = [];
    for (let i = startLine; i < doc.lineCount && i <= lineNumber + 50; i++) {
        const line = doc.lineAt(i).text;
        const trimmed = line.trim();
        
        // Connection set items start with "-"
        if (trimmed.startsWith('-') && trimmed !== '-') {
            connectionLines.push(line);
        }
        // Continuation lines (indented)
        else if (trimmed.length > 0 && (trimmed.startsWith(' ') || trimmed.startsWith('\t'))) {
            connectionLines.push(line);
        }
        // End of connection set (non-indented, non-list line)
        else if (trimmed.length > 0) {
            break;
        }
    }
    
    // Extract designators from all lines
    // Pattern: optional whitespace, "-", whitespace, designator, colon
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
 * Attempts to extract designator from any line
 * Used as fallback when section context is unknown
 */
function extractAnyDesignator(line: string): string[] {
    const designators: string[] = [];
    
    // Pattern 1: Direct key at start (with optional list marker)
    const keyPattern = /^(\s*(?:-\s*)?)([A-Za-z][A-Za-z0-9_.]*)\s*:/;
    const keyMatch = line.match(keyPattern);
    if (keyMatch) {
        designators.push(keyMatch[2]);
    }
    
    // Pattern 2: Designator with pin reference
    // Matches: "X1: [1-4]" or "W1: [1]"
    const refPattern = /([A-Za-z][A-Za-z0-9_.]*)\s*:\s*\[/g;
    let refMatch: RegExpExecArray | null;
    while ((refMatch = refPattern.exec(line)) !== null) {
        designators.push(refMatch[1]);
    }
    
    return designators;
}
```

---

### Step 3: Update Webview for Highlighting

**File**: `src/extension.ts`

```typescript
// Update generateBomTableHtml to include data-designators attribute
function generateBomTableHtml(bomData: BomData): string {
    if (!bomData || bomData.rows.length === 0) {
        return '<div class="bom-empty">No BOM data available</div>';
    }
    
    const rowsHtml = bomData.rows.map(row => {
        // Normalize designators (split by comma, trim whitespace)
        const normalizedDesignators = (row.Designators || '')
            .split(',')
            .map(d => d.trim())
            .filter(d => d.length > 0)
            .join(',');
        
        return `
            <tr data-designators="${normalizedDesignators}">
                <td class="col-id">${escapeHtml(row.Id)}</td>
                <td class="col-description">${escapeHtml(row.Description)}</td>
                <td class="col-qty">${escapeHtml(row.Qty)}</td>
                <td class="col-unit">${escapeHtml(row.Unit)}</td>
                <td class="col-designators">${escapeHtml(row.Designators)}</td>
            </tr>
        `;
    }).join('');
    
    return `
        <div class="bom-container">
            <div class="bom-toolbar">
                <input type="text" id="bom-filter" placeholder="Filter BOM...">
                <span class="bom-count">${bomData.rows.length} items</span>
            </div>
            <table class="bom-table">
                <thead>
                    <tr>
                        <th class="col-id">ID</th>
                        <th class="col-description">Description</th>
                        <th class="col-qty">Qty</th>
                        <th class="col-unit">Unit</th>
                        <th class="col-designators">Designators</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
        <script>
            // Filtering
            document.getElementById('bom-filter')?.addEventListener('input', (e) => {
                const filter = e.target.value.toLowerCase();
                document.querySelectorAll('.bom-table tbody tr').forEach(row => {
                    const text = row.textContent.toLowerCase();
                    row.style.display = text.includes(filter) ? '' : 'none';
                });
            });
            
            // Highlighting (receive from extension)
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.type === 'highlightDesignators') {
                    highlightDesignators(message.designators);
                } else if (message.type === 'clearHighlight') {
                    clearHighlight();
                }
            });
            
            function highlightDesignators(designators) {
                if (!designators || designators.length === 0) {
                    clearHighlight();
                    return;
                }
                
                const designatorSet = new Set(designators.map(d => d.trim()));
                
                document.querySelectorAll('.bom-table tbody tr').forEach(row => {
                    const rowDesignators = (row.getAttribute('data-designators') || '')
                        .split(',')
                        .map(d => d.trim());
                    const hasMatch = rowDesignators.some(d => designatorSet.has(d));
                    
                    if (hasMatch) {
                        row.classList.add('highlighted');
                    } else {
                        row.classList.remove('highlighted');
                    }
                });
            }
            
            function clearHighlight() {
                document.querySelectorAll('.bom-table tbody tr').forEach(row => {
                    row.classList.remove('highlighted');
                });
            }
        </script>
    `;
}
```

Add CSS for highlighting:

```typescript
// Add to ViewPanelCss:
.bom-table tbody tr.highlighted {
    background-color: #ffeb3b !important;
    color: #000 !important;
    font-weight: bold;
}
.bom-table tbody tr.highlighted:hover td {
    background-color: #ffeb3b !important;
}
.bom-table tbody tr.highlighted td {
    border-bottom-color: #ffeb3b;
}
```

---

### Step 4: Update Highlight From Cursor

**File**: `src/extension.ts`

```typescript
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

---

### Step 5: Handle Webview Messages

**File**: `src/extension.ts`

```typescript
// In createOrShowPreviewPanel, set up message handler:
if (viewPanel) {
    viewPanel.webview.onDidReceiveMessage(message => {
        // Handle messages from webview
        // (Currently no messages from webview for highlighting)
    });
}
```

---

## Testing Strategy

### Unit Tests
- [ ] Designator extraction from connector definition
- [ ] Designator extraction from cable definition
- [ ] Designator extraction from connection set
- [ ] Multiple designators from connection set
- [ ] Edge cases (cursor on whitespace, comments, etc.)

### Integration Tests
- [ ] Highlight updates on cursor move
- [ ] Highlight clears when cursor leaves relevant sections
- [ ] Multiple items highlighted for connection sets
- [ ] Highlighting works with filtering
- [ ] Highlight persists across view mode changes

### Edge Cases
- [ ] Cursor on comment line
- [ ] Cursor on empty line
- [ ] Cursor in metadata section
- [ ] Cursor in templates section
- [ ] Very long designator names
- [ ] Designators with special characters
- [ ] Rapid cursor movement
- [ ] Cursor in nested structures

---

## Performance Considerations

| Operation | Frequency | Optimization |
|-----------|-----------|--------------|
| Cursor move detection | High | Debounced (100ms) |
| Designator extraction | High | Cached per line, context-aware |
| BOM row lookup | High | Use data attributes, Set for O(1) lookup |
| DOM updates | Medium | Batch updates, minimize reflows |

### Optimization Techniques

1. **Debouncing**: Delay highlight updates by 100ms after cursor stops moving
2. **Caching**: Cache extracted designators per line number
3. **Efficient Lookup**: Use JavaScript Set for O(1) designator lookups
4. **Minimal DOM Updates**: Only update classes, not recreate rows

---

## Success Criteria

- [ ] Single designator highlights correctly
- [ ] Connection sets highlight all related BOM items
- [ ] Highlighting updates in real-time (with debounce)
- [ ] Highlighting works with regex extraction
- [ ] No performance issues with large BOMs
- [ ] Highlights are visually clear and distinct
- [ ] Highlights clear when cursor leaves relevant sections
- [ ] Existing Phase 1 and 2 functionality unchanged

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

## Summary

Phase 3 adds **cursor-position-based highlighting** to the BOM table:

1. Tracks cursor position in YAML editor
2. Extracts designator(s) using regex patterns (no dependencies)
3. Maps designators to BOM rows via `data-designators` attribute
4. Highlights matching rows with visual feedback
5. Handles both single items and connection sets
6. Includes debouncing for performance

This builds on Phase 1 (BOM display) and Phase 2 (view toggling) without requiring any new dependencies.
