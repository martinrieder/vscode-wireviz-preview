# Phase 2: View Toggle Implementation

---

## Objective
Implement a toggle mechanism to switch between different views: diagram-only, BOM-only, or combined view. This builds on Phase 1 which displays both diagram and BOM together.

---

## Prerequisites
- Phase 1: Core BOM Display must be implemented and working
- BOM data is being generated and parsed successfully

---

## View Management Architecture

### Core Principles
- **Separation of Concerns**: Extension manages state and data, webview handles rendering
- **Bidirectional Communication**: Extension ↔ Webview via `postMessage` and `onDidReceiveMessage`
- **State Tracking**: Extension maintains view mode and BOM data as single source of truth
- **Template-Based Rendering**: HTML templates loaded from files, populated with data

### Communication Flow
```
┌─────────────────┐         ┌─────────────────┐
│   Extension     │         │     Webview      │
│                 │         │                 │
│  • State:       │         │  • Render:       │
│    - viewMode   │◄───────►│    - diagram     │
│    - bomData    │  msg    │    - bom         │
│    - doc        │         │    - combined    │
│  • Commands:    │         │  • Events:       │
│    - toggleView │         │    - button click│
│    - showDiagram│         │    - filter      │
│    - showBom    │         │    - sort        │
│    - showCombined│        │                 │
└────────┬────────┘         └────────┬────────┘
         │                              │
         │ postMessage(type, data)      │
         │ onDidReceiveMessage         │
         ▼                              ▼
```

### View Options
1. **Combined View** (default): Diagram + BOM table beneath (Phase 1 behavior)
2. **Diagram Only**: Just the SVG diagram
3. **BOM Only**: Just the BOM table

### Enabling Phase 3
This architecture **explicitly enables Phase 3** by:
- Providing extensible message handler that Phase 3 can extend
- Maintaining BOM data state that Phase 3 can reference
- Establishing communication pattern for cursor-position messages
- Using template-based approach that Phase 3 can extend with highlighting

---

## Message Type System

### Unified Message Types (Extensible for Phase 3)

**File**: `src/utils/webviewMessages.ts` (new file - shared across all phases)

```typescript
// View mode type (Phase 2)
export type ViewMode = 'combined' | 'diagram' | 'bom';

// BOM Row data structure (Phase 1)
export interface BomRow {
    Id: string;
    Description: string;
    Qty: string;
    Unit: string;
    Designators: string;
}

// Message types for all phases
export type WebviewMessage =
    // Phase 2: View toggling
    | { type: 'setBomData', data: BomRow[] }
    | { type: 'toggleView' }
    | { type: 'setViewMode', mode: ViewMode }
    
    // Phase 3: Highlighting (forward declarations for extensibility)
    | { type: 'highlightDesignators', designators: string[] }
    | { type: 'clearHighlight' };

// Message types from webview to extension
export type ExtensionMessage =
    | { type: 'toggleView' }
    | { type: 'setViewMode', mode: ViewMode }
    | { type: 'filterChanged', filter: string }  // For Phase 1 filtering
    | { type: 'sortChanged', column: number, direction: number }; // For Phase 1 sorting
```

**Usage Pattern:**
```typescript
// In extension.ts
import { WebviewMessage, ExtensionMessage, ViewMode } from './utils/webviewMessages';

viewPanel.webview.onDidReceiveMessage((message: ExtensionMessage) => {
    handleWebviewMessage(message);
});

function handleWebviewMessage(message: ExtensionMessage) {
    switch (message.type) {
        case 'toggleView':
            toggleViewMode();
            break;
        case 'setViewMode':
            setViewMode(message.mode);
            break;
        // Phase 3 will add cases here
    }
}
```

---

## Implementation Details

### Step 1: Create HTML Template Files (MANDATORY FOUNDATION)

**Files**: Create `src/views/diagram.html`, `src/views/bom.html`, `src/views/combined.html`

These templates form the **integral foundation** for all phases, not optional cleanup.

**File**: `src/views/diagram.html`
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>{{{CSS}}}
        .diagram-container {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .diagram-container img {
            max-width: 100%;
            height: auto;
        }
        .diagram-caption {
            font-size: small;
            text-align: center;
            color: #888;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class="view-mode-indicator">
        View: <strong>diagram</strong>
        <button onclick="toggleView()" class="view-toggle-btn">Toggle</button>
    </div>
    <div class="diagram-container">
        <img src="{{{DIAGRAM_URI}}}" alt="Diagram">
        <div class="diagram-caption">{{{CAPTION}}}
    </div>
    <script>
        function toggleView() {
            const vscode = acquireVsCodeApi();
            vscode.postMessage({ type: 'toggleView' });
        }
    </script>
</body>
</html>
```

**File**: `src/views/bom.html`
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>{{{CSS}}}
        .bom-container {
            margin-top: 15px;
        }
        .bom-toolbar {
            display: flex;
            gap: 10px;
            margin-bottom: 8px;
            align-items: center;
        }
        .bom-toolbar input {
            flex: 1;
            padding: 4px 8px;
            border: 1px solid #666;
            border-radius: 3px;
            background-color: #1e1e1e;
            color: #ccc;
            font-size: 12px;
        }
        .bom-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        .bom-table th {
            background-color: #252526;
            color: #ccc;
            padding: 6px 8px;
            text-align: left;
            border-bottom: 2px solid #007acc;
            cursor: pointer;
        }
        .bom-table td {
            padding: 4px 8px;
            border-bottom: 1px solid #333;
            color: #ccc;
        }
        .bom-table tr:nth-child(even) td { background-color: #1e1e1e; }
        .bom-table tr:nth-child(odd) td { background-color: #252526; }
        .bom-table tr:hover td { background-color: #2d2d30; }
        .bom-table tbody tr.highlighted {
            background-color: #ffeb3b !important;
            color: #000 !important;
            font-weight: bold;
        }
        .bom-count { color: #888; font-size: 11px; }
    </style>
</head>
<body>
    <div class="view-mode-indicator">
        View: <strong>bom</strong>
        <button onclick="toggleView()" class="view-toggle-btn">Toggle</button>
    </div>
    <div class="bom-container">
        <div class="bom-toolbar">
            <input type="text" id="bom-filter" placeholder="Filter BOM...">
            <button id="bom-clear-filter" title="Clear filter">×</button>
            <span class="bom-count">{{{ITEM_COUNT}}} items</span>
        </div>
        <table class="bom-table">
            <thead>
                <tr>
                    <th class="col-id" data-col="0">ID ↑</th>
                    <th class="col-description" data-col="1">Description ↑</th>
                    <th class="col-qty" data-col="2">Qty ↑</th>
                    <th class="col-unit" data-col="3">Unit ↑</th>
                    <th class="col-designators" data-col="4">Designators ↑</th>
                </tr>
            </thead>
            <tbody>
                {{{BOM_ROWS}}}
            </tbody>
        </table>
    </div>
    <script>
        // Filtering and sorting (Phase 1 functionality)
        (function() {
            'use strict';
            let sortColumn = 0, sortDirection = 1, filterText = '';
            const bomBody = document.querySelector('.bom-table tbody');
            const filterInput = document.getElementById('bom-filter');
            const clearFilterBtn = document.getElementById('bom-clear-filter');
            const headers = document.querySelectorAll('.bom-table th');
            const summaryEl = document.querySelector('.bom-count');
            const originalRows = Array.from(bomBody?.querySelectorAll('tr') || []);
            
            filterInput?.addEventListener('input', (e) => {
                filterText = (e.target as HTMLInputElement).value.toLowerCase();
                applySortAndFilter();
                const vscode = acquireVsCodeApi();
                vscode.postMessage({ type: 'filterChanged', filter: filterText });
            });
            
            clearFilterBtn?.addEventListener('click', () => {
                if (filterInput) { filterInput.value = ''; filterText = ''; applySortAndFilter(); }
            });
            
            headers.forEach((th, index) => {
                th.addEventListener('click', () => {
                    if (sortColumn === index) sortDirection *= -1;
                    else { sortColumn = index; sortDirection = 1; }
                    applySortAndFilter();
                    updateHeaderIndicators();
                    const vscode = acquireVsCodeApi();
                    vscode.postMessage({ type: 'sortChanged', column: sortColumn, direction: sortDirection });
                });
            });
            
            function applySortAndFilter() {
                if (!bomBody || !originalRows.length) return;
                const rows = originalRows.filter(row => 
                    !filterText || row.textContent.toLowerCase().includes(filterText)
                );
                const sorted = [...rows].sort((a, b) => {
                    const aVal = a.querySelector(`td:nth-child(${sortColumn + 1})`)?.textContent || '';
                    const bVal = b.querySelector(`td:nth-child(${sortColumn + 1})`)?.textContent || '';
                    if (sortColumn === 2) {
                        const aNum = parseFloat(aVal) || 0, bNum = parseFloat(bVal) || 0;
                        return (aNum - bNum) * sortDirection;
                    }
                    return aVal.localeCompare(bVal) * sortDirection;
                });
                bomBody.innerHTML = '';
                sorted.forEach(row => bomBody.appendChild(row.cloneNode(true)));
                if (summaryEl) summaryEl.textContent = `${rows.length} of ${originalRows.length} items`;
            }
            
            function updateHeaderIndicators() {
                headers.forEach((h, idx) => {
                    const indicator = sortColumn === idx ? (sortDirection === 1 ? '↑' : '↓') : '↑';
                    h.innerHTML = h.textContent.replace(/[↑↓]/g, '') + ' ' + indicator;
                });
            }
            
            // Phase 3: Highlighting support
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.type === 'highlightDesignators') {
                    highlightDesignators(message.designators);
                } else if (message.type === 'clearHighlight') {
                    clearHighlight();
                }
            });
            
            function highlightDesignators(designators) {
                if (!designators || designators.length === 0) { clearHighlight(); return; }
                const designatorSet = new Set(designators.map(d => d.trim()));
                document.querySelectorAll('.bom-table tbody tr').forEach(row => {
                    const rowDesignators = (row.getAttribute('data-designators') || '')
                        .split(',').map(d => d.trim());
                    const hasMatch = rowDesignators.some(d => designatorSet.has(d));
                    if (hasMatch) row.classList.add('highlighted');
                    else row.classList.remove('highlighted');
                });
            }
            
            function clearHighlight() {
                document.querySelectorAll('.bom-table tbody tr').forEach(row => {
                    row.classList.remove('highlighted');
                });
            }
            
            function toggleView() {
                const vscode = acquireVsCodeApi();
                vscode.postMessage({ type: 'toggleView' });
            }
            
            applySortAndFilter();
        })();
    </script>
</body>
</html>
```

**File**: `src/views/combined.html`
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>{{{CSS}}}
        .diagram-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-bottom: 15px;
            border-bottom: 1px solid #444;
            padding-bottom: 10px;
        }
        .diagram-container img {
            max-width: 100%;
            height: auto;
        }
        .diagram-caption {
            font-size: small;
            text-align: center;
            color: #888;
            margin-top: 5px;
        }
        .bom-container {
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="view-mode-indicator">
        View: <strong>combined</strong>
        <button onclick="toggleView()" class="view-toggle-btn">Toggle</button>
    </div>
    <div class="diagram-container">
        <img src="{{{DIAGRAM_URI}}}" alt="Diagram">
        <div class="diagram-caption">{{{CAPTION}}}
    </div>
    <div class="bom-container">
        <div class="bom-toolbar">
            <input type="text" id="bom-filter" placeholder="Filter BOM...">
            <button id="bom-clear-filter" title="Clear filter">×</button>
            <span class="bom-count">{{{ITEM_COUNT}}} items</span>
        </div>
        <table class="bom-table">
            <thead>
                <tr>
                    <th class="col-id" data-col="0">ID ↑</th>
                    <th class="col-description" data-col="1">Description ↑</th>
                    <th class="col-qty" data-col="2">Qty ↑</th>
                    <th class="col-unit" data-col="3">Unit ↑</th>
                    <th class="col-designators" data-col="4">Designators ↑</th>
                </tr>
            </thead>
            <tbody>
                {{{BOM_ROWS}}}
            </tbody>
        </table>
    </div>
    <script>
        // Same filtering, sorting, and highlighting JavaScript as bom.html
        // (Copy the script block from bom.html here)
    </script>
</body>
</html>
```

### Step 2: Create Template Loader Utility

**File**: `src/utils/templateLoader.ts` (new file)

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { BomRow } from './webviewMessages';

/**
 * Replaces template placeholders with actual values
 */
export function replaceTemplatePlaceholders(
    template: string,
    replacements: Record<string, string>
): string {
    return template.replace(/\{\{\{([^\}]+)\}\}\}/g, (match, placeholder) => {
        return replacements[placeholder] || match;
    });
}

/**
 * Escapes HTML special characters
 */
export function escapeHtml(text: string): string {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Generates BOM row HTML with data-designators attribute (for Phase 3)
 */
export function generateBomRowHtml(row: BomRow): string {
    const normalizedDesignators = (row.Designators || '')
        .split(',')
        .map(d => d.trim())
        .filter(d => d.length > 0)
        .join(',');
    
    return `
        <tr data-designators="${escapeHtml(normalizedDesignators)}">
            <td class="col-id">${escapeHtml(row.Id)}</td>
            <td class="col-description">${escapeHtml(row.Description)}</td>
            <td class="col-qty">${escapeHtml(row.Qty)}</td>
            <td class="col-unit">${escapeHtml(row.Unit)}</td>
            <td class="col-designators">${escapeHtml(row.Designators)}</td>
        </tr>
    `;
}

/**
 * Loads a template file and populates it with data
 */
export function loadTemplate(
    templateName: 'diagram' | 'bom' | 'combined',
    data: {
        css?: string;
        diagramUri?: string;
        caption?: string;
        bomRows?: BomRow[];
        itemCount?: number;
    }
): string {
    const templatePath = path.join(__dirname, '..', 'views', `${templateName}.html`);
    let html = fs.readFileSync(templatePath, 'utf8');
    
    // Build replacements
    const replacements: Record<string, string> = {
        CSS: data.css || '',
        DIAGRAM_URI: data.diagramUri || '',
        CAPTION: data.caption || '',
        ITEM_COUNT: data.itemCount?.toString() || '0',
        BOM_ROWS: data.bomRows?.map(row => generateBomRowHtml(row)).join('') || ''
    };
    
    return replaceTemplatePlaceholders(html, replacements);
}
```

### Step 3: Add View Mode Type and State

**File**: `src/extension.ts`

```typescript
// Import message types
import { ViewMode, WebviewMessage, BomRow } from './utils/webviewMessages';
import { loadTemplate } from './utils/templateLoader';

// Add state variables
let currentViewMode: ViewMode = 'combined'; // Default to Phase 1 behavior
let currentBomData: { rows: BomRow[] } = { rows: [] };
```

---

## Implementation Details

### Step 1: Add View Mode Type and State

**File**: `src/extension.ts`

```typescript
// Add type for view modes
type ViewMode = 'combined' | 'diagram' | 'bom';

// Add state variable
let currentViewMode: ViewMode = 'combined'; // Default to Phase 1 behavior
```

---

### Step 2: Add View Toggle Commands

**File**: `src/extension.ts`

```typescript
// In activate function, add commands:
export async function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand("wireviz.showPreview", async() => await showPreview()),
        vscode.commands.registerCommand("wireviz.showDiagram", async() => setViewMode('diagram')),
        vscode.commands.registerCommand("wireviz.showBom", async() => setViewMode('bom')),
        vscode.commands.registerCommand("wireviz.showCombined", async() => setViewMode('combined')),
        vscode.commands.registerCommand("wireviz.toggleView", async() => toggleViewMode()),
        vscode.workspace.onDidSaveTextDocument(onDocumentSaved)
    );
}

/**
 * Sets the view mode and refreshes the display
 */
function setViewMode(mode: ViewMode) {
    currentViewMode = mode;
    const doc = window.activeTextEditor?.document;
    if (doc && viewPanel) {
        const cfgArgs = getArgsFromConfig(doc.fileName);
        const outFile = getOutputFileFullpath(doc.fileName, cfgArgs);
        showCurrentView(outFile);
    }
}

/**
 * Toggles between view modes
 */
function toggleViewMode() {
    const modes: ViewMode[] = ['combined', 'diagram', 'bom'];
    const currentIndex = modes.indexOf(currentViewMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setViewMode(modes[nextIndex]);
}
```

---

### Step 3: Update showImg to Respect View Mode

**File**: `src/extension.ts`

```typescript
// Replace showImg with view-mode-aware function
function showCurrentView(imgFileName: string) {
    if (!viewPanel) return;
    
    const uri = Uri.file(imgFileName);
    const webviewUri = viewPanel.webview.asWebviewUri(uri);
    
    switch (currentViewMode) {
        case 'diagram':
            viewPanel.webview.html = `
                <html><head>${ViewPanelCss}</head><body>
                    <figure>
                        <img src="${webviewUri}" alt="Diagram">
                        <figcaption>${imgFileName}</figcaption>
                    </figure>
                </body></html>`;
            break;
            
        case 'bom':
            viewPanel.webview.html = `
                <html><head>${ViewPanelCss}</head><body>
                    ${generateBomTableHtml(currentBomData)}
                </body></html>`;
            break;
            
        case 'combined':
        default:
            viewPanel.webview.html = `
                <html><head>${ViewPanelCss}</head><body>
                    <figure>
                        <img src="${webviewUri}" alt="Diagram">
                        <figcaption>${imgFileName}</figcaption>
                    </figure>
                    ${generateBomTableHtml(currentBomData)}
                </body></html>`;
            break;
    }
}

// Update showPreview to use showCurrentView instead of showImg
// In showPreview function:
// Change: showImg(outFile);
// To:     showCurrentView(outFile);
```

---

### Step 4: Implement showCurrentView with Template Loader

**File**: `src/extension.ts`

```typescript
/**
 * Shows the current view based on view mode using templates
 */
function showCurrentView(imgFileName: string) {
    if (!viewPanel) return;
    
    const uri = Uri.file(imgFileName);
    const webviewUri = viewPanel.webview.asWebviewUri(uri);
    
    const filename = path.basename(imgFileName);
    
    switch (currentViewMode) {
        case 'diagram':
            viewPanel.webview.html = loadTemplate('diagram', {
                css: ViewPanelCss,
                diagramUri: webviewUri.toString(),
                caption: filename
            });
            break;
            
        case 'bom':
            viewPanel.webview.html = loadTemplate('bom', {
                css: ViewPanelCss,
                bomRows: currentBomData.rows,
                itemCount: currentBomData.rows.length
            });
            break;
            
        case 'combined':
        default:
            viewPanel.webview.html = loadTemplate('combined', {
                css: ViewPanelCss,
                diagramUri: webviewUri.toString(),
                caption: filename,
                bomRows: currentBomData.rows,
                itemCount: currentBomData.rows.length
            });
            break;
    }
}
```

**Note**: The CSS for view mode indicator and toggle button is now defined in the template files, not in `ViewPanelCss`.

### Step 5: Create Extensible Message Handler

**File**: `src/extension.ts`

```typescript
// Import message types
import { ExtensionMessage } from './utils/webviewMessages';

/**
 * Handles messages from webview
 * EXTENSIBLE: Phase 3 will add more cases here
 */
function handleWebviewMessage(message: ExtensionMessage) {
    switch (message.type) {
        case 'toggleView':
            toggleViewMode();
            break;
        
        case 'setViewMode':
            setViewMode(message.mode);
            break;
        
        case 'filterChanged':
            // Phase 1: Filter state can be tracked if needed
            // For now, filtering is client-side in webview
            break;
        
        case 'sortChanged':
            // Phase 1: Sort state can be tracked if needed
            // For now, sorting is client-side in webview
            break;
        
        // Phase 3 will add:
        // case 'highlightDesignators':
        // case 'clearHighlight':
    }
}

// Set up webview message handler in createOrShowPreviewPanel:
if (viewPanel) {
    viewPanel.webview.onDidReceiveMessage((message: ExtensionMessage) => {
        handleWebviewMessage(message);
    });
}
```

### Step 6: Update showPreview to Store BOM Data

**File**: `src/extension.ts`

```typescript
// In showPreview function, after reading BOM file:
const bomFile = getBomFileFullpath(doc.fileName, cfgArgs);
try {
    const bomContent = await fs.promises.readFile(bomFile, 'utf8');
    const parsed = parseBomTsv(bomContent);
    currentBomData = { rows: parsed.rows };
} catch (bomError) {
    console.warn('Could not read BOM file:', bomError);
    currentBomData = { rows: [] };
}

// Then call showCurrentView instead of showImg:
showCurrentView(outFile);
```

---

### Step 5: Handle Webview Messages

**File**: `src/extension.ts`

```typescript
// Set up webview message handler
viewPanel.webview.onDidReceiveMessage(message => {
    switch (message.type) {
        case 'toggleView':
            toggleViewMode();
            break;
    }
});
```

---

### Step 6: Update Package.json

Add new commands to `package.json`:

```json
{
    "contributes": {
        "commands": [
            {
                "command": "wireviz.showPreview",
                "title": "WireViz: Preview"
            },
            {
                "command": "wireviz.showDiagram",
                "title": "WireViz: Show Diagram Only"
            },
            {
                "command": "wireviz.showBom",
                "title": "WireViz: Show BOM Only"
            },
            {
                "command": "wireviz.showCombined",
                "title": "WireViz: Show Combined View"
            },
            {
                "command": "wireviz.toggleView",
                "title": "WireViz: Toggle View"
            }
        ],
        "menus": {
            "editor/title": [
                {
                    "when": "resourceLangId == yaml",
                    "command": "wireviz.showPreview",
                    "group": "navigation"
                }
            ],
            "commandPalette": [
                {
                    "command": "wireviz.showDiagram",
                    "when": "editorTextFocus && resourceLangId == yaml"
                },
                {
                    "command": "wireviz.showBom",
                    "when": "editorTextFocus && resourceLangId == yaml"
                },
                {
                    "command": "wireviz.showCombined",
                    "when": "editorTextFocus && resourceLangId == yaml"
                },
                {
                    "command": "wireviz.toggleView",
                    "when": "editorTextFocus && resourceLangId == yaml"
                }
            ]
        }
    }
}
```

---

---

## User Experience Considerations

### View State Persistence (Optional Enhancement)
```typescript
// Save view mode preference
const VIEW_MODE_KEY = 'wireviz.viewMode';

// Load saved preference
currentViewMode = (context.workspaceState.get(VIEW_MODE_KEY) as ViewMode) || 'combined';

// Save when changed
function setViewMode(mode: ViewMode) {
    currentViewMode = mode;
    context.workspaceState.update(VIEW_MODE_KEY, mode);
    // ... refresh display ...
}
```

### Visual Feedback
- Show current view mode in panel title
- Add visual indicator of current view
- Smooth transitions between views

### Error Handling
- Handle missing BOM file gracefully (fall back to diagram-only)
- Show fallback message when BOM is empty
- Preserve existing functionality

---

## Testing Strategy

### Functional Tests
- [ ] Toggle from combined to diagram-only
- [ ] Toggle from diagram-only to BOM-only
- [ ] Toggle from BOM-only to combined
- [ ] Toggle cycles through all modes
- [ ] Direct commands work for each view
- [ ] Toggle when no preview exists
- [ ] Toggle with non-WireViz file
- [ ] Toggle with missing BOM file

### UI Tests
- [ ] View transitions are smooth
- [ ] Panel title updates correctly
- [ ] View mode indicator visible and accurate
- [ ] Toggle button works

### Edge Cases
- [ ] Rapid toggling
- [ ] Toggle during generation
- [ ] Toggle with very large BOM
- [ ] Toggle with corrupted BOM file

---

## Success Criteria

- [ ] All view modes display correctly
- [ ] Toggle command cycles through all modes
- [ ] Direct view commands work
- [ ] View mode persists across preview refreshes (optional)
- [ ] Error cases handled gracefully
- [ ] No memory leaks from repeated toggling
- [ ] Existing Phase 1 functionality unchanged

---

## How This Enables Phase 3

This architecture **explicitly enables Phase 3** through:

1. **Extensible Message Handler**: Phase 3 can add `highlightDesignators` and `clearHighlight` cases
2. **BOM Data State**: `currentBomData` is maintained and accessible for cursor tracking
3. **Template-Based Approach**: BOM template includes `data-designators` attributes for highlighting
4. **Bidirectional Communication**: Pattern established for Phase 3's cursor-position messages
5. **View Management**: State tracking pattern that Phase 3 can extend

Phase 3 will:
- Add cursor tracking to `createOrShowPreviewPanel`
- Add designator extraction utility
- Extend `handleWebviewMessage` with highlighting cases
- Use existing template loader with highlighting CSS already in templates

---

## What Was Moved from Phase 1

The following items were **moved from Phase 1 to Phase 2**:

- ✅ Separate HTML template files (`diagram.html`, `bom.html`, `combined.html`) - **MANDATORY FOUNDATION**
- ✅ Template loader utility
- ✅ Toggle command and view switching logic
- ✅ View state persistence
- ✅ Unified message type system
- ✅ Extensible message handler
- ✅ View Management Architecture

---

## Next Phase
Once Phase 2 is complete and tested, proceed to [Phase 3: Advanced Highlighting](./04-phase3-highlighting.md)
