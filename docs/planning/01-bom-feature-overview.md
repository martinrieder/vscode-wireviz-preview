# BOM Feature Overview - vscode-wireviz-preview

---

## Objective
Integrate Bill of Materials (BOM) functionality into the WireViz Preview extension, providing users with a table view of components including basic sorting and filtering capabilities, with an optional advanced feature to highlight BOM items based on YAML cursor position.

---

## Current State Analysis

### Extension Capabilities
The **vscode-wireviz-preview** extension currently:
- Renders WireViz YAML files as SVG diagrams in a webview panel
- Uses the `wireviz` CLI with configurable output formats (`-f` flag)
- Supports output format configuration via `wireviz.outputFormats` setting
- Forces SVG output by default (appends `"s"` to output formats)
- Uses DOM injection (not external HTML files) for webview content

### WireViz BOM Capabilities
WireViz natively generates BOM (Bill of Materials) as **TSV format** using the `t` flag:
- Output flag: `-f t` or combined like `-f st` (SVG + TSV)
- BOM file naming: `{input}.bom.tsv`
- BOM contains columns: **Id, Description, Qty, Unit, Designators**
- Designators column contains comma-separated references to YAML elements (e.g., "W1, W2, W3" or "X1, X2")

### Example BOM Output
```
Id  Description                     Qty Unit Designators
1   Cable, 2 x 0.25 mm²            0.3 m   W4
2   Connector, Crimp ferrule...    2       F.
3   Connector, Molex KK 254...      2       X2, X3
4   Connector, Molex KK 254...      1       X4
5   Wire, 0.14 mm², BK              0.9 m   W1, W2, W3
```

---

## Architecture Decisions

### Phase 1: Minimal Implementation (Core Feature)
- **Single view**: Show BOM table **beneath** the diagram in the same webview
- **No toggling**: Both diagram and BOM visible simultaneously
- **DOM injection**: Continue using current approach (no external HTML files)
- **Minimal changes**: Only modify what's necessary for BOM generation and display

### Phase 2: Enhanced Features
- **Toggle between views**: Switch between diagram-only and BOM-only views
- **Separate HTML files**: Extract views into separate template files
- **View state persistence**: Remember user's preferred view

### File Structure (Phase 1)
```
src/
└── extension.ts          # Main extension logic with BOM display
```

No new files required for Phase 1 - uses existing DOM injection approach.

### Dependency Constraints
- **No new dependencies** for any phase
- **No redhat-yaml** required - use regex-based designator extraction for Phase 3

---

## Feature Phases

### Phase 1: Core BOM Display (Mandatory)
**Goal**: Display BOM table beneath the diagram with basic sorting and filtering.

- [ ] Modify `getArgsFromConfig` to include `t` flag for TSV output
- [ ] Add helper function `getBomFileFullpath` to locate BOM file
- [ ] Create BOM parser utility for TSV files
- [ ] Add BOM table HTML/CSS/JS to webview content
- [ ] Parse TSV and display table beneath diagram
- [ ] Add basic sorting by column click
- [ ] Add basic filtering via text input

**Key Design Decision**: Use existing DOM injection approach, not external HTML files.

### Phase 2: View Toggle (Optional Enhancement)
**Goal**: Allow users to toggle between diagram-only, BOM-only, or combined views.

- [ ] Add toggle buttons/commands
- [ ] Implement view switching logic
- [ ] Extract views into separate HTML template files
- [ ] Preserve state between toggles

### Phase 3: Advanced Highlighting (Optional Enhancement)
**Goal**: Highlight BOM items based on YAML cursor position.

- [ ] Track cursor position in YAML editor
- [ ] Extract designator(s) at cursor using regex patterns
- [ ] Map designators to BOM rows
- [ ] Highlight matching rows in BOM table
- [ ] Support multiple designators in connection sets

---

## Key Technical Considerations

### Phase 1: Minimal Changes Required

#### 1. Output Format Modification
Only one change to existing code is strictly required:

```typescript
// In getArgsFromConfig function:
// Change from:
let outputFormats = getConfig("outputFormats", "")!.trim().concat("s");

// To:
let outputFormats = getConfig("outputFormats", "")!.trim().concat("st"); // Add 't' for TSV
```

This ensures WireViz generates both SVG (for diagram) and TSV (for BOM).

#### 2. BOM File Path Helper
Add simple helper function:

```typescript
function getBomFileFullpath(inputFile: string, cfgArgs: ConfiguredArgs): string {
    const inputFileExt = new RegExp(`${path.extname(inputFile)}$`);
    return path.join(cfgArgs.outputDir, cfgArgs.outputName
        ? `${cfgArgs.outputName}.bom.tsv`
        : path.basename(inputFile).replace(inputFileExt, ".bom.tsv")
    );
}
```

#### 3. BOM Display Integration
Modify the existing `showImg` function to also display BOM table beneath the diagram:

```typescript
function showImg(imgFileName: string) {
    if (viewPanel) {
        const uri = Uri.file(imgFileName);
        const webviewUri = viewPanel.webview.asWebviewUri(uri);
        
        // Read and parse BOM data
        const bomFile = getBomFileFullpath(activeDoc.fileName, cfgArgs);
        const bomData = parseBomTsv(fs.readFileSync(bomFile, 'utf8'));
        
        // Generate HTML with both diagram and BOM
        viewPanel.webview.html = `
            <html><head>${ViewPanelCss}</head><body>
                <figure>
                    <img src="${webviewUri}" alt="Diagram">
                    <figcaption>${imgFileName}</figcaption>
                </figure>
                <div class="bom-container">
                    ${generateBomTableHtml(bomData)}
                </div>
            </body></html>`;
    }
}
```

### TSV Parsing
- Handle tab-separated values
- Handle special characters and escaping
- Parse header row for column names
- Return structured data for table rendering

### Designator Extraction (Phase 3)
Use regex-based extraction since we cannot add dependencies:
- Pattern match for WireViz designators: `[A-Za-z][A-Za-z0-9_.]*`
- Extract from cursor line and context
- Handle connection sets with multiple designators

### Connection Set Handling
WireViz YAML connections use this format:
```yaml
connections:
  -
    - X1: [1-4]
    - W1: [1-4]
    - X2: [1-4]
```

For cursor in a connection set:
- Extract all designators from the connection array
- Highlight all BOM rows that reference any of these designators

---

## Configuration Options

### New Settings (Optional)
```json
{
  "wireviz.bomSortColumn": {
    "type": "string",
    "default": "Id",
    "enum": ["Id", "Description", "Qty", "Unit", "Designators"],
    "description": "Default BOM sort column"
  }
}
```

Note: No configuration option needed to enable/disable BOM - it's always shown when available.

---

## Communication Flow

### Extension → Webview (Phase 1)
1. Extension generates SVG + TSV via WireViz CLI (by adding 't' flag)
2. Extension reads TSV file and parses BOM data
3. Extension generates HTML with both diagram and BOM table
4. Webview renders combined content

### Editor → Extension → Webview (Phase 3)
1. User moves cursor in YAML editor
2. Extension detects `onDidChangeTextEditorSelection`
3. Extension extracts designator(s) at cursor position using regex
4. Extension sends designator list to webview via `postMessage`
5. Webview highlights matching BOM rows

---

## Performance Considerations

| Operation | Frequency | Optimization |
|-----------|-----------|--------------|
| WireViz CLI call | On save / on demand | Only when needed |
| TSV parsing | Once per generation | Cache parsed data |
| Selection tracking (Phase 3) | On cursor move | Debounce (100-200ms) |
| Designator extraction (Phase 3) | On cursor move | Cache per line |
| BOM highlighting (Phase 3) | On selection change | Use CSS classes |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WireViz version incompatibility | Low | High | Existing version check covers this |
| TSV parsing failures | Medium | Medium | Robust parsing with error handling |
| Performance with large BOMs | Medium | Medium | Lazy rendering, pagination |
| Webview memory issues | Low | Medium | Proper resource cleanup |

---

## Success Criteria

### Phase 1 (Core)
- [ ] BOM file generated by WireViz (via 't' flag)
- [ ] BOM table displays correctly beneath diagram with all columns
- [ ] Sorting works on all columns
- [ ] Filtering works across all columns
- [ ] No errors in console
- [ ] Performance acceptable with typical BOM sizes

### Phase 2 (Toggle)
- [ ] Toggle between views works reliably
- [ ] View state is preserved correctly
- [ ] Transitions are smooth and responsive

### Phase 3 (Highlighting)
- [ ] Single designator highlights correctly
- [ ] Connection sets highlight all related items
- [ ] Highlighting updates in real-time (with debounce)
- [ ] Regex extraction works accurately

---

## Next Steps
See individual phase documents for detailed implementation plans:
- [Phase 1: Core BOM Display](./02-phase1-core-bom.md)
- [Phase 2: View Toggle](./03-phase2-view-toggle.md)
- [Phase 3: Advanced Highlighting](./04-phase3-highlighting.md)
