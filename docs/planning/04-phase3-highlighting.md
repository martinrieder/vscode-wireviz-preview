# Phase 3: Advanced Highlighting Implementation

---

## Objective
Implement advanced highlighting in the BOM table that reflects the current selection in the YAML code. Highlight only the items that belong to the cursor position in the YAML code, including support for highlighting multiple items when the cursor is in a connection set that refers to multiple designators.

**Builds on**: Phase 2's View Management Architecture, HTML templates, and extensible message handler.

---

## Key Requirements
- **No new dependencies**: Cannot add `js-yaml` or similar libraries
- **Regex-based extraction**: Primary method for designator extraction
- **Highlight single items**: When cursor is on a connector/cable definition
- **Highlight multiple items**: When cursor is in a connection set with multiple designators
- **Real-time updates**: Highlighting updates as cursor moves
- **Integrates with Phase 2**: Uses Phase 2's message types, templates, and state management

---

## Architecture Overview

This phase **extends Phase 2's View Management Architecture** with cursor tracking and highlighting capabilities.

### Relationship to Phase 2

```
┌─────────────────────────────────────────────────────────────────┐
│                    Phase 2 Foundation                               │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │ Extension State  │    │ HTML Templates   │    │ Message      │ │
│  │ - viewMode      │    │ - bom.html       │    │ Handler      │ │
│  │ - bomData       │    │ - diagram.html   │    │ - Extensible │ │
│  │ - currentDoc    │    │ - combined.html  │    │   switch     │ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │                              │                    │
         ▼                              ▼                    ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐
│ Phase 3 Adds:    │    │ Phase 3 Adds:    │    │ Phase 3      │
│ - Cursor tracking│    │ - data-designators│   │ Extends:     │
│ - Designator    │    │   attributes     │    │ - highlight  │
│   extraction    │    │ - .highlighted   │    │ - clear      │
│ - Message posting│    │   CSS class      │    │   cases      │
└─────────────────┘    └─────────────────┘    └─────────────┘
```

### Designator Extraction Strategy

Since we cannot add `js-yaml` as a dependency and redhat-yaml does not provide syntax tree access, we use a **regex-based approach**:

1. **Context-aware parsing**: Determine which section (connectors, cables, connections) the cursor is in
2. **Pattern matching**: Extract designators using WireViz-specific regex patterns
3. **Connection set handling**: When in connections section, extract all designators from the connection set

### Highlighting Flow
```
Cursor Move → Determine Context → Extract Designators → Use Phase 2 State → Send Message → Phase 2 Template Handles Highlight
```

**Key Integration Points with Phase 2**:
- Uses Phase 2's `currentBomData` state for designator lookup
- Uses Phase 2's `viewPanel` for message posting
- Uses Phase 2's message handler (extended with new cases)
- Uses Phase 2's BOM template with `data-designators` attributes (already present)

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

## Integration with Phase 2

### Dependencies on Phase 2

Phase 3 **requires** the following from Phase 2:

1. **Message Type System**: `WebviewMessage` and `ExtensionMessage` types from `src/utils/webviewMessages.ts`
2. **Template Loader**: `loadTemplate()` function from `src/utils/templateLoader.ts`
3. **State Management**: `currentBomData` and `viewPanel` variables in `extension.ts`
4. **Extensible Handler**: `handleWebviewMessage()` function that Phase 3 will extend
5. **BOM Templates**: `bom.html` and `combined.html` templates with `data-designators` attributes

### What Phase 2 Provides for Phase 3

| Phase 2 Component | Phase 3 Usage |
|------------------|---------------|
| `currentBomData: { rows: BomRow[] }` | Access BOM rows for designator matching |
| `viewPanel: vscode.WebviewPanel` | Post highlight/clear messages to webview |
| `handleWebviewMessage()` | Extend with `highlightDesignators` and `clearHighlight` cases |
| `bom.html` template | Contains highlighting JavaScript and CSS |
| `combined.html` template | Contains highlighting JavaScript and CSS |
| `ViewMode` type | Track which view is active for highlighting |
| `WebviewMessage` type | Already includes `highlightDesignators` and `clearHighlight` |

**Note**: The BOM templates created in Phase 2 already include:
- `data-designators` attributes on table rows
- `.highlighted` CSS class for visual feedback
- JavaScript for `highlightDesignators()` and `clearHighlight()` functions
- Message listener for highlight messages from extension

---

## Implementation Details

### Step 1: Add Cursor Tracking (Integrated with Phase 2)

**File**: `src/extension.ts`

**Integrates with Phase 2's `createOrShowPreviewPanel`** - adds cursor tracking setup.

```typescript
// Add state variables for cursor tracking
let selectionDisposable: vscode.Disposable | null = null;
let designatorCache: Map<number, string[]> = new Map();

// Modify Phase 2's createOrShowPreviewPanel to include cursor tracking
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
    
    // Phase 3: Set up selection tracking for highlighting
    // Only if we have BOM data (from Phase 1/2)
    if (currentBomData.rows.length > 0) {
        setupSelectionTracking();
    }
}

/**
 * Sets up cursor position tracking for BOM highlighting
 * Uses Phase 2's currentBomData state
 */
function setupSelectionTracking() {
    // Clean up previous disposable
    if (selectionDisposable) {
        selectionDisposable.dispose();
    }
    
    const doc = window.activeTextEditor?.document;
    if (!doc || !viewPanel) return;
    
    // Check if current view shows BOM (from Phase 2 state)
    const shouldTrack = currentViewMode === 'bom' || currentViewMode === 'combined';
    if (!shouldTrack) {
        // Clear highlights if switching to diagram-only view
        viewPanel.webview.postMessage({ type: 'clearHighlight' });
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

Uses Phase 2's `BomRow` type for consistency.

```typescript
import * as vscode from 'vscode';
import { BomRow } from './webviewMessages';

/**
 * Extracts designators from YAML at cursor position using regex patterns.
 * Handles WireViz-specific YAML structure.
 * 
 * Used by Phase 3 cursor tracking to find which BOM items to highlight.
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
 * 
 * Returns ALL designators in the set for multi-item highlighting.
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

/**
 * Finds BOM rows that match the given designators
 * Uses Phase 2's currentBomData state
 */
export function findMatchingBomRows(designators: string[]): BomRow[] {
    const designatorSet = new Set(designators.map(d => d.trim()));
    return currentBomData.rows.filter(row => {
        const rowDesignators = (row.Designators || '')
            .split(',')
            .map(d => d.trim());
        return rowDesignators.some(d => designatorSet.has(d));
    });
}
```

---

### Step 3: Extend Phase 2's Message Handler

**File**: `src/extension.ts`

**Extends Phase 2's `handleWebviewMessage`** to add highlighting cases.

```typescript
// In handleWebviewMessage function, ADD these cases:

function handleWebviewMessage(message: ExtensionMessage) {
    switch (message.type) {
        case 'toggleView':
            toggleViewMode();
            break;
        
        case 'setViewMode':
            setViewMode(message.mode);
            break;
        
        case 'filterChanged':
            // Phase 1: Filter state tracking (optional)
            break;
        
        case 'sortChanged':
            // Phase 1: Sort state tracking (optional)
            break;
        
        // PHASE 3: Highlighting message handling
        // These messages are sent FROM webview TO extension
        // (e.g., when user clicks on a BOM row, we could highlight in YAML)
        // For now, we only send FROM extension TO webview
        
        // Note: The actual highlight/clear messages are sent BY extension
        // to webview via viewPanel.webview.postMessage(), so we don't
        // need to handle them here. The webview handles them directly.
    }
}
```

**Note**: The highlighting JavaScript and CSS are **already in Phase 2's templates** (`bom.html` and `combined.html`). No changes needed here.

---

### Step 4: Update Highlight From Cursor

**File**: `src/extension.ts`

**Uses Phase 2's `viewPanel` and message types** to send highlighting commands.

```typescript
// Import from Phase 2's message types
import { WebviewMessage } from './utils/webviewMessages';

/**
 * Updates BOM highlighting based on current cursor position
 * Uses Phase 2's viewPanel and currentBomData
 */
function updateHighlightFromCursor() {
    const doc = window.activeTextEditor?.document;
    if (!doc || !viewPanel) return;
    
    const selection = window.activeTextEditor?.selection;
    if (!selection) return;
    
    const cursorPosition = selection.active;
    const designators = extractDesignators(doc, cursorPosition);
    
    // Use Phase 2's message types
    const message: WebviewMessage = designators.length > 0
        ? { type: 'highlightDesignators', designators: designators }
        : { type: 'clearHighlight' };
    
    viewPanel.webview.postMessage(message);
}
```

**Note**: This sends messages to the webview where Phase 2's templates already have the JavaScript to handle `highlightDesignators` and `clearHighlight` messages.

---

### Step 5: Verify Phase 2's Message Handler Setup

**File**: `src/extension.ts`

**Phase 2 already sets up the message handler** in `createOrShowPreviewPanel`:

```typescript
// This is already in Phase 2's implementation:
if (viewPanel) {
    viewPanel.webview.onDidReceiveMessage((message: ExtensionMessage) => {
        handleWebviewMessage(message);
    });
}
```

**No changes needed** - Phase 2's extensible handler is ready for Phase 3.

---

## Testing Strategy

### Prerequisites
- Phase 1: BOM display working
- Phase 2: View toggling and templates working

### Unit Tests
- [ ] Designator extraction from connector definition
- [ ] Designator extraction from cable definition
- [ ] Designator extraction from connection set
- [ ] Multiple designators from connection set
- [ ] Edge cases (cursor on whitespace, comments, etc.)

### Integration Tests
- [ ] Highlight updates on cursor move (with Phase 2 templates)
- [ ] Highlight clears when cursor leaves relevant sections
- [ ] Multiple items highlighted for connection sets
- [ ] Highlighting works with Phase 2's filtering
- [ ] Highlight works in both 'bom' and 'combined' view modes
- [ ] Highlight clears when switching to 'diagram' view
- [ ] Highlight persists across view mode changes (bom ↔ combined)

### Edge Cases
- [ ] Cursor on comment line
- [ ] Cursor on empty line
- [ ] Cursor in metadata section
- [ ] Cursor in templates section
- [ ] Very long designator names
- [ ] Designators with special characters
- [ ] Rapid cursor movement (debounce test)
- [ ] Cursor in nested structures
- [ ] BOM with no designators column
- [ ] Empty BOM data

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

Phase 3 adds **cursor-position-based highlighting** to the BOM table by **extending Phase 2's architecture**:

### What Phase 3 Adds
1. **Cursor Tracking**: Monitors cursor position in YAML editor
2. **Designator Extraction**: Regex-based extraction utility (`designatorExtractor.ts`)
3. **Message Posting**: Sends highlight/clear messages to webview using Phase 2's types
4. **Context Awareness**: Handles single items and connection sets

### What Phase 3 Reuses from Phase 2
1. **Message Types**: `WebviewMessage` with `highlightDesignators` and `clearHighlight`
2. **Templates**: `bom.html` and `combined.html` with highlighting JavaScript and CSS
3. **State Management**: `currentBomData` and `viewPanel`
4. **Message Handler**: Extensible `handleWebviewMessage` function
5. **View Management**: Tracks which views support highlighting

### Integration Points
```
Phase 2 Provides:
├── Template Loader (loadTemplate)
├── HTML Templates (bom.html, combined.html) with:
│   ├── data-designators attributes
│   ├── .highlighted CSS class
│   └── highlightDesignators() JavaScript function
├── Message Types (WebviewMessage)
├── State (currentBomData, viewPanel, currentViewMode)
└── Message Handler (handleWebviewMessage)

Phase 3 Adds:
├── Cursor Tracking (setupSelectionTracking)
├── Designator Extraction (extractDesignators)
└── Message Posting (updateHighlightFromCursor)
```

This builds on Phase 1 (BOM display) and Phase 2 (view toggling + templates) without requiring any new dependencies. The highlighting functionality is **fully integrated** with Phase 2's architecture.
