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

### View Switching Strategy
- **Toggle between views**: Graphics (SVG) and BOM (table) are separate views
- **Single webview panel**: The same panel switches content between diagram and BOM
- **Separate HTML files**: Each view has its own HTML template file
- **No side-by-side display**: Views are mutually exclusive

### File Structure
```
src/
├── extension.ts          # Main extension logic
├── views/
│   ├── diagram.html      # SVG diagram view (existing functionality)
│   └── bom.html          # BOM table view (new)
└── utils/
    └── bomParser.ts      # TSV parsing logic
```

### Dependency Constraints
- **No new dependencies** for core functionality
- **Optional**: Leverage `redhat-yaml` extension for YAML syntax tree (if available)
- **Fallback**: Use regex-based designator extraction for advanced highlighting

---

## Feature Phases

### Phase 1: Core BOM Display (Mandatory)
- [ ] Add configuration option to enable BOM view
- [ ] Modify WireViz CLI call to generate TSV output
- [ ] Create BOM HTML view with table
- [ ] Parse TSV and populate table
- [ ] Add basic sorting by column
- [ ] Add basic filtering by text

### Phase 2: View Toggle (Mandatory)
- [ ] Add toggle button in webview toolbar
- [ ] Implement view switching logic
- [ ] Preserve state between toggles

### Phase 3: Advanced Highlighting (Optional)
- [ ] Track cursor position in YAML editor
- [ ] Extract designator from YAML at cursor position
- [ ] Map designators to BOM rows
- [ ] Highlight matching rows in BOM table
- [ ] Support multiple designators in connection sets

---

## Key Technical Considerations

### TSV Parsing
- Handle tab-separated values
- Handle special characters and escaping
- Handle multi-line descriptions (if any)
- Parse header row for column names

### Designator Extraction (Without js-yaml)
Since we cannot add `js-yaml` as a dependency, we use alternative approaches:

1. **Primary**: Use `redhat-yaml` extension's API (if available)
   - Check if extension is installed
   - Request syntax tree for current document
   - Extract node at cursor position
   - Get designator/identifier from node

2. **Fallback**: Regex-based extraction
   - Parse YAML using line-based regex patterns
   - Identify current line and nearby context
   - Extract key names that match known designator patterns
   - Pattern: `^\s*([A-Za-z][A-Za-z0-9_.]*)\s*:`

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

### New Settings
```json
{
  "wireviz.showBom": {
    "type": "boolean",
    "default": false,
    "description": "Show BOM table view instead of diagram"
  },
  "wireviz.bomSortColumn": {
    "type": "string",
    "default": "Id",
    "enum": ["Id", "Description", "Qty", "Unit", "Designators"],
    "description": "Default BOM sort column"
  }
}
```

---

## Communication Flow

### Extension → Webview
1. Extension generates SVG + TSV via WireViz CLI
2. Extension reads TSV file and parses BOM data
3. Extension sends BOM data to webview as JSON
4. Webview renders table with data

### Editor → Extension → Webview (Advanced)
1. User moves cursor in YAML editor
2. Extension detects `onDidChangeTextEditorSelection`
3. Extension extracts designator(s) at cursor position
4. Extension sends designator list to webview
5. Webview highlights matching BOM rows

---

## Performance Considerations

| Operation | Frequency | Optimization |
|-----------|-----------|--------------|
| WireViz CLI call | On save / on demand | Only when needed |
| TSV parsing | Once per BOM generation | Cache parsed data |
| Selection tracking | On cursor move | Debounce (100-200ms) |
| Designator extraction | On cursor move | Cache document AST |
| BOM highlighting | On selection change | Use CSS classes |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WireViz version incompatibility | Low | High | Existing version check covers this |
| TSV parsing failures | Medium | Medium | Robust parsing with error handling |
| redhat-yaml not installed | Medium | Medium | Fallback to regex extraction |
| Performance issues with large files | Medium | High | Debouncing, caching, lazy loading |
| Webview memory leaks | Low | Medium | Proper disposal of event listeners |

---

## Success Criteria

### Phase 1 (Core)
- [ ] BOM view displays correctly with all columns
- [ ] Sorting works on all columns
- [ ] Filtering works across all columns
- [ ] TSV parsing handles edge cases

### Phase 2 (Toggle)
- [ ] Toggle button visible and functional
- [ ] View switching is smooth
- [ ] State preserved between switches

### Phase 3 (Highlighting)
- [ ] Single designator highlights correctly
- [ ] Connection sets highlight all related items
- [ ] Highlighting updates on cursor move
- [ ] Fallback works without redhat-yaml

---

## Next Steps
See individual phase documents for detailed implementation plans:
- [Phase 1: Core BOM Display](./02-phase1-core-bom.md)
- [Phase 2: View Toggle](./03-phase2-view-toggle.md)
- [Phase 3: Advanced Highlighting](./04-phase3-highlighting.md)
