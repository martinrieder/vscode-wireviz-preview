# Phase 2: View Toggle Implementation

---

## Objective
Implement a toggle mechanism to switch between different views: diagram-only, BOM-only, or combined view. This builds on Phase 1 which displays both diagram and BOM together.

---

## Prerequisites
- Phase 1: Core BOM Display must be implemented and working
- BOM data is being generated and parsed successfully

---

## Architecture Overview

### View Options
1. **Combined View** (default): Diagram + BOM table beneath (Phase 1 behavior)
2. **Diagram Only**: Just the SVG diagram
3. **BOM Only**: Just the BOM table

### View Management Strategy
- **Single Webview Panel**: One panel instance that switches content
- **State Tracking**: Track current view mode
- **Toggle Commands**: Commands to switch between views
- **Optional**: Separate HTML template files for cleaner code

### View Switching Flow
```
User Action → Command → Extension → Update State → Regenerate Webview HTML
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

### Step 4: Add View Mode Indicator (Optional)

**File**: `src/extension.ts`

```typescript
// Update showCurrentView to include view mode indicator
function showCurrentView(imgFileName: string) {
    if (!viewPanel) return;
    
    const uri = Uri.file(imgFileName);
    const webviewUri = viewPanel.webview.asWebviewUri(uri);
    
    // View mode label
    const viewModeLabel = `
        <div class="view-mode-indicator">
            View: <strong>${currentViewMode}</strong>
            <button onclick="toggleView()" class="view-toggle-btn">Toggle</button>
        </div>
    `;
    
    switch (currentViewMode) {
        case 'diagram':
            viewPanel.webview.html = `
                <html><head>${ViewPanelCss}</head><body>
                    ${viewModeLabel}
                    <figure>
                        <img src="${webviewUri}" alt="Diagram">
                        <figcaption>${imgFileName}</figcaption>
                    </figure>
                </body></html>`;
            break;
            
        case 'bom':
            viewPanel.webview.html = `
                <html><head>${ViewPanelCss}</head><body>
                    ${viewModeLabel}
                    ${generateBomTableHtml(currentBomData)}
                </body></html>`;
            break;
            
        case 'combined':
        default:
            viewPanel.webview.html = `
                <html><head>${ViewPanelCss}</head><body>
                    ${viewModeLabel}
                    <figure>
                        <img src="${webviewUri}" alt="Diagram">
                        <figcaption>${imgFileName}</figcaption>
                    </figure>
                    ${generateBomTableHtml(currentBomData)}
                </body></html>`;
            break;
    }
}
```

Add CSS for view mode indicator:

```typescript
// Add to ViewPanelCss:
.view-mode-indicator {
    padding: 8px 0;
    color: #888;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid #444;
    margin-bottom: 10px;
}
.view-mode-indicator strong {
    color: #ccc;
}
.view-toggle-btn {
    padding: 2px 8px;
    border: 1px solid #666;
    border-radius: 3px;
    background-color: #333;
    color: #ccc;
    cursor: pointer;
    font-size: 11px;
}
.view-toggle-btn:hover {
    background-color: #007acc;
    border-color: #007acc;
}
```

Add JavaScript to webview for toggle button:

```typescript
// In showCurrentView, add script to HTML:
const toggleScript = `
    <script>
        function toggleView() {
            const vscode = acquireVsCodeApi();
            vscode.postMessage({ type: 'toggleView' });
        }
    </script>
`;

// Then in viewPanel.webview.html, include toggleScript
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

### Step 7: Optional - Extract HTML Templates (Cleanup)

**Files**: Create `src/views/diagram.html`, `src/views/bom.html`, `src/views/combined.html`

This step is optional but recommended for better code organization. Move the HTML generation logic from `extension.ts` into separate template files.

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

## What Was Moved from Phase 1

The following items were **moved from Phase 1 to Phase 2**:

- ✅ Separate HTML template files (`diagram.html`, `bom.html`)
- ✅ Toggle command and view switching logic
- ✅ View state persistence
- ✅ Column sorting (beyond basic filtering)
- ✅ Enhanced TSV parsing with quoted fields

---

## Next Phase
Once Phase 2 is complete and tested, proceed to [Phase 3: Advanced Highlighting](./04-phase3-highlighting.md)
