# Phase 1: Core BOM Display Implementation

---

## Objective
Implement the core Bill of Materials display functionality with table view, basic sorting, and filtering capabilities.

---

## Prerequisites
- WireViz 0.4.0+ (already enforced by extension)
- No new dependencies required

---

## Implementation Steps

### Step 1: Create BOM HTML View Template

Create a new file `src/views/bom.html` with the following structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WireViz BOM</title>
    <style>
        body {
            background-color: transparent;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            font-size: 13px;
            padding: 10px;
            margin: 0;
            height: 100%;
            overflow: hidden;
        }
        
        .bom-container {
            height: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .bom-toolbar {
            display: flex;
            gap: 10px;
            padding: 8px 0;
            border-bottom: 1px solid #444;
            margin-bottom: 8px;
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
        
        .bom-toolbar input:focus {
            outline: none;
            border-color: #007acc;
        }
        
        .bom-toolbar button {
            padding: 4px 12px;
            border: 1px solid #666;
            border-radius: 3px;
            background-color: #333;
            color: #ccc;
            cursor: pointer;
            font-size: 12px;
        }
        
        .bom-toolbar button:hover {
            background-color: #444;
        }
        
        .bom-toolbar button.active {
            background-color: #007acc;
            border-color: #007acc;
            color: white;
        }
        
        .bom-table-container {
            flex: 1;
            overflow: auto;
            border: 1px solid #444;
            border-radius: 3px;
        }
        
        table.bom-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }
        
        table.bom-table th {
            position: sticky;
            top: 0;
            background-color: #252526;
            color: #ccc;
            padding: 6px 8px;
            border-bottom: 2px solid #007acc;
            font-weight: normal;
            cursor: pointer;
            user-select: none;
            z-index: 10;
        }
        
        table.bom-table th:hover {
            background-color: #2d2d30;
        }
        
        table.bom-table th.sorted-asc::after {
            content: ' ↑';
        }
        
        table.bom-table th.sorted-desc::after {
            content: ' ↓';
        }
        
        table.bom-table td {
            padding: 4px 8px;
            border-bottom: 1px solid #333;
            color: #ccc;
        }
        
        table.bom-table tr:nth-child(even) td {
            background-color: #1e1e1e;
        }
        
        table.bom-table tr:nth-child(odd) td {
            background-color: #252526;
        }
        
        table.bom-table tr:hover td {
            background-color: #2d2d30;
        }
        
        table.bom-table tr.filtered-out {
            display: none;
        }
        
        /* Column widths */
        table.bom-table .col-id { width: 40px; text-align: center; }
        table.bom-table .col-description { width: 40%; }
        table.bom-table .col-qty { width: 60px; text-align: right; }
        table.bom-table .col-unit { width: 60px; text-align: center; }
        table.bom-table .col-designators { width: 30%; }
        
        .bom-empty {
            color: #666;
            text-align: center;
            padding: 20px;
            font-style: italic;
        }
        
        .bom-summary {
            padding: 8px 0;
            color: #888;
            font-size: 11px;
            text-align: right;
        }
    </style>
</head>
<body>
    <div class="bom-container">
        <div class="bom-toolbar">
            <input type="text" id="bom-filter" placeholder="Filter (Ctrl+F)">
            <button id="bom-clear-filter" title="Clear filter">×</button>
        </div>
        <div class="bom-table-container">
            <table class="bom-table">
                <thead>
                    <tr>
                        <th class="col-id" data-col="0">ID</th>
                        <th class="col-description" data-col="1">Description</th>
                        <th class="col-qty" data-col="2">Qty</th>
                        <th class="col-unit" data-col="3">Unit</th>
                        <th class="col-designators" data-col="4">Designators</th>
                    </tr>
                </thead>
                <tbody id="bom-body">
                    <!-- BOM rows will be inserted here -->
                </tbody>
            </table>
        </div>
        <div class="bom-summary" id="bom-summary"></div>
    </div>
    
    <script>
        // This script runs in the webview context
        (function() {
            'use strict';
            
            const vscode = acquireVsCodeApi();
            
            // State
            let bomData = [];
            let sortColumn = 0;
            let sortDirection = 1; // 1 = asc, -1 = desc
            let filterText = '';
            
            // DOM elements
            const bomBody = document.getElementById('bom-body');
            const filterInput = document.getElementById('bom-filter');
            const clearFilterBtn = document.getElementById('bom-clear-filter');
            const summaryEl = document.getElementById('bom-summary');
            const headers = document.querySelectorAll('table.bom-table th');
            
            // Listen for messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.type) {
                    case 'setBomData':
                        bomData = message.data;
                        sortColumn = message.sortColumn || 0;
                        sortDirection = message.sortDirection || 1;
                        renderTable();
                        updateSummary();
                        break;
                        
                    case 'highlightDesignators':
                        highlightDesignators(message.designators);
                        break;
                        
                    case 'clearHighlight':
                        clearHighlight();
                        break;
                }
            });
            
            // Filter input
            filterInput.addEventListener('input', (e) => {
                filterText = e.target.value.toLowerCase();
                renderTable();
                updateSummary();
            });
            
            // Clear filter button
            clearFilterBtn.addEventListener('click', () => {
                filterInput.value = '';
                filterText = '';
                renderTable();
                updateSummary();
            });
            
            // Column header clicks for sorting
            headers.forEach((th, index) => {
                th.addEventListener('click', () => {
                    if (sortColumn === index) {
                        sortDirection *= -1; // Toggle direction
                    } else {
                        sortColumn = index;
                        sortDirection = 1;
                    }
                    renderTable();
                    
                    // Update header UI
                    headers.forEach(h => {
                        h.classList.remove('sorted-asc', 'sorted-desc');
                    });
                    th.classList.add(sortDirection === 1 ? 'sorted-asc' : 'sorted-desc');
                    
                    // Notify extension of sort change
                    vscode.postMessage({
                        type: 'sortChanged',
                        column: index,
                        direction: sortDirection
                    });
                });
            });
            
            // Render table with current data, sort, and filter
            function renderTable() {
                if (!bomData || bomData.length === 0) {
                    bomBody.innerHTML = '<tr><td colspan="5" class="bom-empty">No BOM data available</td></tr>';
                    return;
                }
                
                // Filter and sort
                const filtered = bomData.filter(row => {
                    if (!filterText) return true;
                    return Object.values(row).some(val => 
                        String(val).toLowerCase().includes(filterText)
                    );
                });
                
                const sorted = [...filtered].sort((a, b) => {
                    const col = Object.keys(a)[sortColumn];
                    const aVal = a[col];
                    const bVal = b[col];
                    
                    // Numeric sort for Qty column
                    if (sortColumn === 2) {
                        const aNum = parseFloat(aVal) || 0;
                        const bNum = parseFloat(bVal) || 0;
                        return (aNum - bNum) * sortDirection;
                    }
                    
                    // String sort for others
                    return String(aVal).localeCompare(String(bVal)) * sortDirection;
                });
                
                // Generate HTML
                const rows = sorted.map(row => {
                    const cells = Object.values(row).map((val, idx) => {
                        const colClass = headers[idx].classList.contains('col-id') ? 'col-id' :
                                       headers[idx].classList.contains('col-description') ? 'col-description' :
                                       headers[idx].classList.contains('col-qty') ? 'col-qty' :
                                       headers[idx].classList.contains('col-unit') ? 'col-unit' : 'col-designators';
                        return `<td class="${colClass}">${escapeHtml(val)}</td>`;
                    }).join('');
                    return `<tr data-designators="${row.Designators || ''}">${cells}</tr>`;
                });
                
                bomBody.innerHTML = rows.join('');
            }
            
            // Highlight rows matching designators
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
                    } else {
                        row.classList.remove('highlighted');
                    }
                });
            }
            
            // Clear all highlights
            function clearHighlight() {
                document.querySelectorAll('#bom-body tr').forEach(row => {
                    row.classList.remove('highlighted');
                });
            }
            
            // Update summary text
            function updateSummary() {
                const visibleRows = document.querySelectorAll('#bom-body tr:not(.filtered-out)');
                const totalRows = bomData.length;
                summaryEl.textContent = `${visibleRows.length} of ${totalRows} items`;
            }
            
            // Escape HTML special characters
            function escapeHtml(text) {
                if (text === null || text === undefined) return '';
                const div = document.createElement('div');
                div.textContent = String(text);
                return div.innerHTML;
            }
            
            // Initial render
            renderTable();
        })();
    </script>
</body>
</html>
```

### Step 2: Create Diagram HTML View Template

Create `src/views/diagram.html` to separate the existing diagram view:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>WireViz Preview</title>
    <style>
        body {
            background-color: transparent;
            font-size: medium;
            padding: 5pt;
            margin: 0;
            height: 100%;
            overflow: auto;
        }
        figure, img {
            width: 100%;
            padding: 0;
            margin: 0;
        }
        figcaption {
            font-size: small;
            text-align: center;
            color: #888;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <figure>
        <img src="" alt="Diagram" id="diagram-img">
        <figcaption id="diagram-caption"></figcaption>
    </figure>
</body>
</html>
```

### Step 3: Create BOM Parser Utility

Create `src/utils/bomParser.ts`:

```typescript
/**
 * Parses TSV (Tab-Separated Values) BOM data from WireViz
 */
export interface BomRow {
    Id: string;
    Description: string;
    Qty: string;
    Unit: string;
    Designators: string;
}

export interface BomData {
    rows: BomRow[];
    headers: string[];
}

/**
 * Parses TSV content into BOM data structure
 * @param tsvContent The raw TSV content
 * @returns Parsed BOM data with headers and rows
 */
export function parseBomTsv(tsvContent: string): BomData {
    const lines = tsvContent.split('\n');
    
    // Filter out empty lines
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    
    if (nonEmptyLines.length < 2) {
        return { headers: [], rows: [] };
    }
    
    // Parse header row
    const headers = parseTsvLine(nonEmptyLines[0]);
    
    // Parse data rows
    const rows: BomRow[] = [];
    for (let i = 1; i < nonEmptyLines.length; i++) {
        const values = parseTsvLine(nonEmptyLines[i]);
        
        // Ensure we have the right number of values
        while (values.length < headers.length) {
            values.push('');
        }
        
        // Create row object
        const row: any = {};
        for (let j = 0; j < headers.length && j < values.length; j++) {
            const header = headers[j].trim();
            const value = values[j].trim();
            row[header] = value;
        }
        
        // Ensure all required fields exist
        const bomRow: BomRow = {
            Id: row['Id'] || row['ID'] || '',
            Description: row['Description'] || '',
            Qty: row['Qty'] || row['Quantity'] || '',
            Unit: row['Unit'] || '',
            Designators: row['Designators'] || row['Designators'] || ''
        };
        
        rows.push(bomRow);
    }
    
    return { headers, rows };
}

/**
 * Parses a single TSV line, handling quoted fields and escaped characters
 * @param line The TSV line to parse
 * @returns Array of field values
 */
function parseTsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    let escapeNext = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (escapeNext) {
            current += char;
            escapeNext = false;
            continue;
        }
        
        if (char === '\\') {
            escapeNext = true;
            continue;
        }
        
        if (inQuotes) {
            if (char === '"') {
                // Check if this is an escaped quote or end of quoted field
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++; // Skip next quote
                } else {
                    inQuotes = false;
                }
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === '\t') {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
    }
    
    // Add the last field
    values.push(current);
    
    return values;
}

/**
 * Reads and parses BOM TSV file
 * @param filePath Path to the .bom.tsv file
 * @returns Promise resolving to parsed BOM data
 */
export async function readBomFile(filePath: string): Promise<BomData> {
    const fs = await import('fs');
    const { promisify } = await import('util');
    const readFile = promisify(fs.readFile);
    
    try {
        const content = await readFile(filePath, 'utf8');
        return parseBomTsv(content);
    } catch (error) {
        console.error(`Failed to read BOM file: ${filePath}`, error);
        return { headers: [], rows: [] };
    }
}
```

### Step 4: Modify Extension to Support BOM

Update `src/extension.ts` with the following changes:

#### Add Imports and Types
```typescript
// Add to imports
import path from 'path';
import { parseBomTsv, BomData, BomRow } from './utils/bomParser';

// Add to existing types
type ConfiguredArgs = {
    outputFormats: string;
    outputDir: string;
    outputName: string | undefined;
    prepend: string | undefined;
};

// New state variables
let currentBomData: BomData = { headers: [], rows: [] };
let currentView: 'diagram' | 'bom' = 'diagram';
```

#### Modify Output Format Handling
```typescript
// Update getArgsFromConfig to include 't' when BOM is needed
function getArgsFromConfig(inputFile: string): ConfiguredArgs {
    const outputName = getConfig<string>("outputName", undefined)?.trim();
    
    let prepend = getConfig<string>("prepend", undefined)?.trim();
    if (prepend && !path.isAbsolute(prepend)) {
        prepend = path.join(path.dirname(inputFile), prepend);
    }
    
    let outputFormats = getConfig("outputFormats", "")!.trim();
    
    // Always include SVG
    outputFormats = outputFormats.concat("s");
    
    // Include TSV for BOM if we might need it
    // We'll generate TSV regardless and decide in the view whether to show it
    outputFormats = outputFormats.concat("t");
    
    let outputDir = getConfig("outputDir", "")!.trim();
    if (!path.isAbsolute(outputDir)) {
        outputDir = path.join(path.dirname(inputFile), outputDir);
    }
    
    return { outputFormats, outputDir, outputName, prepend };
}
```

#### Add BOM File Path Helper
```typescript
function getBomFileFullpath(inputFile: string, cfgArgs: ConfiguredArgs): string {
    const inputFileExt = new RegExp(`${path.extname(inputFile)}$`);
    return path.join(cfgArgs.outputDir, cfgArgs.outputName
        ? `${cfgArgs.outputName}.bom.tsv`
        : path.basename(inputFile).replace(inputFileExt, ".bom.tsv")
    );
}
```

#### Modify showPreview Function
```typescript
async function showPreview() {
    if (isRunning) {
        return;
    }
    isRunning = true;

    try {
        const doc = window.activeTextEditor?.document;
        
        if (!doc || !isWirevizYamlFile(doc)) {
            show(MsgType.Err, "Not a WireViz YAML");
            return;
        }

        if (await isAnyWirevizError()) {
            return;
        }

        createOrShowPreviewPanel(doc, "");
        show(MsgType.Info, "Generating diagram...");

        if (doc.isDirty) {
            doc.save();
        }

        const cfgArgs = getArgsFromConfig(doc.fileName);
        const wvArgs = getWvCmdlineArgs(doc.fileName, cfgArgs);
        const outFile = getOutputFileFullpath(doc.fileName, cfgArgs);
        const bomFile = getBomFileFullpath(doc.fileName, cfgArgs);
        
        createOrShowPreviewPanel(doc, cfgArgs.outputDir);

        try {
            show(MsgType.Debug, "wireviz ".concat(wvArgs.join(" ")));
            const process = await aspawn("wireviz", wvArgs);
            
            // Read and parse BOM data
            try {
                const bomContent = await fs.promises.readFile(bomFile, 'utf8');
                currentBomData = parseBomTsv(bomContent);
            } catch (bomError) {
                console.warn('Could not read BOM file:', bomError);
                currentBomData = { headers: [], rows: [] };
            }
            
            // Show the appropriate view
            showCurrentView(outFile, doc.fileName);
            
        } catch (e: any) {
            if (e.stderr) {
                show(MsgType.Err, e.stderr.toString());
            } else if (e) {
                show(MsgType.Err, `${e.name}${e.message}`);
            }
        }
    } finally {
        isRunning = false;
    }
}
```

#### Add View Switching Functions
```typescript
function showCurrentView(imgFileName: string, yamlFileName: string) {
    if (!viewPanel) return;
    
    if (currentView === 'diagram') {
        showImg(imgFileName);
    } else {
        showBom(yamlFileName);
    }
}

function showBom(yamlFileName: string) {
    if (!viewPanel) return;
    
    currentView = 'bom';
    
    // Get the BOM HTML template
    const bomHtmlPath = path.join(__dirname, 'views', 'bom.html');
    let bomHtml = fs.readFileSync(bomHtmlPath, 'utf8');
    
    // Inject initial BOM data
    const script = `
        <script>
            window.bomInitialData = ${JSON.stringify(currentBomData)};
        </script>
    `;
    
    // Insert script before closing head tag
    bomHtml = bomHtml.replace('</head>', script + '</head>');
    
    viewPanel.webview.html = bomHtml;
    
    // Send BOM data to webview
    viewPanel.webview.postMessage({
        type: 'setBomData',
        data: currentBomData.rows,
        sortColumn: 0,
        sortDirection: 1
    });
}

function showImg(imgFileName: string) {
    if (viewPanel) {
        currentView = 'diagram';
        const uri = Uri.file(imgFileName);
        const webviewUri = viewPanel.webview.asWebviewUri(uri);
        
        const diagramHtmlPath = path.join(__dirname, 'views', 'diagram.html');
        let diagramHtml = fs.readFileSync(diagramHtmlPath, 'utf8');
        
        diagramHtml = diagramHtml.replace(
            '<img src="" alt="Diagram" id="diagram-img">',
            `<img src="${webviewUri}" alt="Diagram" id="diagram-img">`
        );
        diagramHtml = diagramHtml.replace(
            '<figcaption id="diagram-caption"></figcaption>',
            `<figcaption id="diagram-caption">${imgFileName}</figcaption>`
        );
        
        viewPanel.webview.html = diagramHtml;
    }
}
```

#### Add Toggle Command
```typescript
// Add to activate function
export async function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand("wireviz.showPreview", async() => await showPreview()),
        vscode.commands.registerCommand("wireviz.toggleBomView", async() => await toggleBomView()),
        vscode.workspace.onDidSaveTextDocument(onDocumentSaved)
    );
}

async function toggleBomView() {
    if (!viewPanel) {
        await showPreview();
        return;
    }
    
    const doc = window.activeTextEditor?.document;
    if (!doc) return;
    
    const cfgArgs = getArgsFromConfig(doc.fileName);
    const outFile = getOutputFileFullpath(doc.fileName, cfgArgs);
    
    currentView = currentView === 'diagram' ? 'bom' : 'diagram';
    showCurrentView(outFile, doc.fileName);
}
```

#### Update Webview Options
```typescript
function getWebviewOptions(outputDir: string): WebviewOptions {
    return {
        enableScripts: true,  // Enable for BOM view interactivity
        localResourceRoots: (isOutsideWorkspace(outputDir))
            ? [Uri.file(outputDir)]
            : undefined
    };
}
```

### Step 5: Update Package.json

Add the new command to `package.json`:

```json
{
    "contributes": {
        "commands": [
            {
                "command": "wireviz.showPreview",
                "title": "WireViz: Preview"
            },
            {
                "command": "wireviz.toggleBomView",
                "title": "WireViz: Toggle BOM View"
            }
        ],
        "menus": {
            "editor/title": [
                {
                    "when": "resourceLangId == yaml",
                    "command": "wireviz.showPreview",
                    "group": "navigation"
                },
                {
                    "when": "resourceLangId == yaml",
                    "command": "wireviz.toggleBomView",
                    "group": "navigation"
                }
            ]
        }
    }
}
```

---

## Testing Strategy

### Unit Tests
- [ ] TSV parsing with normal data
- [ ] TSV parsing with quoted fields
- [ ] TSV parsing with escaped characters
- [ ] TSV parsing with empty lines
- [ ] TSV parsing with missing columns

### Integration Tests
- [ ] BOM view displays correctly
- [ ] Sorting works on all columns
- [ ] Filtering works across all columns
- [ ] Toggle between views works
- [ ] BOM data persists across toggles

### Edge Cases
- [ ] Empty BOM file
- [ ] Malformed TSV
- [ ] Missing BOM file
- [ ] Very large BOM (1000+ rows)
- [ ] Special characters in descriptions

---

## Success Criteria

- [ ] BOM view renders correctly with all columns
- [ ] Sorting works by clicking column headers
- [ ] Filtering works via input field
- [ ] Toggle command switches between diagram and BOM
- [ ] No errors in console
- [ ] Performance acceptable with typical BOM sizes

---

## Next Phase
Once Phase 1 is complete and tested, proceed to [Phase 2: View Toggle](./03-phase2-view-toggle.md)
