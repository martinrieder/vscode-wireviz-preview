# BOM Feature Overview - vscode-wireviz-preview

---

## Objective
Integrate Bill of Materials (BOM) functionality into the WireViz Preview extension, providing users with a table view of components including **column sorting** and **filtering** capabilities, with an optional advanced feature to highlight BOM items based on YAML cursor position.

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

### Phase 1: Core Implementation
- **Single view**: Show BOM table **beneath** the diagram in the same webview
- **No toggling**: Both diagram and BOM visible simultaneously
- **DOM injection**: Continue using current approach (no external HTML files)
- **Enhanced features**: Include **column sorting** and **filtering** in Phase 1
- **Minimal changes**: Only modify what's necessary for BOM generation and display

### Phase 2: View Toggle & Template Foundation
- **Toggle between views**: Switch between diagram-only, BOM-only, or combined views
- **Separate HTML files**: **MANDATORY FOUNDATION** - extract views into separate template files
- **Template loader**: Utility for loading and populating HTML templates
- **View state persistence**: Remember user's preferred view mode
- **View Management Architecture**: Bidirectional communication between extension and webview
- **Unified message types**: Shared type system for all phases
- **Extensible message handler**: Ready for Phase 3 highlighting

### Phase 3: Advanced Highlighting
- **Cursor tracking**: Monitor cursor position in YAML editor
- **Regex extraction**: Extract designators using pattern matching (no js-yaml dependency)
- **Highlighting**: Visual feedback showing which BOM items match cursor position
- **Connection sets**: Support multiple designators in connection arrays
- **Builds on Phase 2**: Uses Phase 2's templates, message types, and state management

### File Structure

**Phase 1:**
```
src/
└── extension.ts          # Main extension logic with BOM display
└── utils/
    └── bomParser.ts      # TSV parsing utility
```

**Phase 2 (MANDATORY templates):**
```
src/
├──── extension.ts
├──── utils/
│   ├── bomParser.ts
│   ├── webviewMessages.ts  # Unified message types for all phases
│   └──── templateLoader.ts  # Template loading utility
└──── views/
    ├── diagram.html      # Template for diagram-only view
    ├── bom.html          # Template for BOM-only view (with highlighting JS)
    └──── combined.html    # Template for combined view (with highlighting JS)
```

**Phase 3:**
```
src/
├──── extension.ts         # Extended with cursor tracking
├──── utils/
│   ├── bomParser.ts
│   ├── webviewMessages.ts  # Shared with Phase 2
│   ├── templateLoader.ts   # Shared with Phase 2
│   └──── designatorExtractor.ts  # Regex-based designator extraction
```
src/
├── extension.ts
├── utils/
│   ├── bomParser.ts
│   └── designatorExtractor.ts  # Regex-based designator extraction
```

### Dependency Constraints
- **No new dependencies** for any phase
- **No redhat-yaml** required - regex-based designator extraction is sufficient
- **Confirmed**: redhat-yaml extension does NOT provide syntax tree access API

---

## Feature Phases

### Phase 1: Core BOM Display (Mandatory)
**Goal**: Display BOM table beneath the diagram with **column sorting** and **filtering**.

- [ ] Modify `getArgsFromConfig` to include `t` flag for TSV output
- [ ] Add helper function `getBomFileFullpath` to locate BOM file
- [ ] Create BOM parser utility (`bomParser.ts`) for TSV files
- [ ] Add BOM table HTML/CSS/JS to webview content
- [ ] Parse TSV and display table beneath diagram
- [ ] Add **column sorting** by clicking headers (ascending/descending)
- [ ] Add **filtering** via text input with clear button
- [ ] Add visual sort indicators (arrows in headers)
- [ ] Handle numeric sorting for Qty column

**Key Design Decisions**: 
- Use existing DOM injection approach, not external HTML files
- Include sorting and filtering in Phase 1 (from original concept)
- Enhanced TSV parser handles quoted fields and escaping

### Phase 2: View Toggle (Optional Enhancement)
**Goal**: Allow users to toggle between different view modes.

- [ ] Add view mode type (`'combined' | 'diagram' | 'bom'`)
- [ ] Add toggle commands (`wireviz.toggleView`, `wireviz.showDiagram`, etc.)
- [ ] Implement view switching logic in `showCurrentView`
- [ ] Add view mode indicator UI
- [ ] Optional: Extract views into separate HTML template files
- [ ] Optional: Persist view mode preference in workspace state

### Phase 3: Advanced Highlighting (Optional Enhancement)
**Goal**: Highlight BOM items based on YAML cursor position.

- [ ] Track cursor position in YAML editor via `onDidChangeTextEditorSelection`
- [ ] Create designator extractor utility (`designatorExtractor.ts`)
- [ ] Implement context-aware parsing (connectors, cables, connections sections)
- [ ] Handle connection sets with multiple designators
- [ ] Add `data-designators` attribute to BOM table rows
- [ ] Send highlight messages from extension to webview
- [ ] Implement highlighting CSS and JavaScript in webview
- [ ] Add debouncing (100ms) for performance

---

## Key Technical Considerations

### TSV Parsing (Phase 1)
- Handle tab-separated values
- Handle **quoted fields** containing tabs (enhanced from original plan)
- Handle **escaped characters**
- Parse header row for column names
- Return structured data for table rendering

### Designator Extraction (Phase 3)
Use **regex-based extraction** since we cannot add dependencies:
- **Primary method**: Pattern matching for WireViz-specific structures
- **Context-aware**: Determine section (connectors, cables, connections) first
- **Single designator**: Extract from direct keys like `X1:`
- **Multiple designators**: Extract all from connection sets
- **Pattern**: `[A-Za-z][A-Za-z0-9_.]*` for WireViz designators

### Connection Set Handling (Phase 3)
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
- Highlight all BOM rows that reference **any** of these designators

---

## Configuration Options

### New Settings (Optional - Phase 2 or 3)
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

Note: No configuration option needed to enable/disable BOM display - it's always shown when available in Phase 1.

---

## Communication Flow

### Extension → Webview (Phase 1)
1. Extension generates SVG + TSV via WireViz CLI (by adding 't' flag)
2. Extension reads TSV file and parses BOM data
3. Extension generates HTML with both diagram and BOM table
4. Webview renders combined content with sorting/filtering JavaScript

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
| Selection tracking (Phase 3) | On cursor move | Debounce (100ms) |
| Designator extraction (Phase 3) | On cursor move | Context-aware, bounded search |
| BOM highlighting (Phase 3) | On selection change | Use CSS classes, data attributes |
| Sorting/filtering (Phase 1) | On user interaction | Client-side, no server roundtrip |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WireViz version incompatibility | Low | High | Existing version check covers this |
| TSV parsing failures | Medium | Medium | Robust parsing with error handling |
| Performance with large BOMs | Medium | Medium | Client-side sorting/filtering, lazy rendering |
| Webview memory issues | Low | Medium | Proper resource cleanup |
| Regex extraction accuracy | Medium | Medium | Context-aware parsing, testing with real WireViz files |

---

## Success Criteria

### Phase 1 (Core)
- [ ] BOM file generated by WireViz (via 't' flag)
- [ ] BOM table displays correctly beneath diagram with all columns
- [ ] **Column sorting works by clicking headers**
- [ ] **Numeric sorting for Qty column**
- [ ] **Filtering works via text input**
- [ ] **Clear filter button works**
- [ ] No errors in console
- [ ] Performance acceptable with typical BOM sizes
- [ ] Existing diagram functionality unchanged

### Phase 2 (Toggle)
- [ ] All view modes display correctly (diagram, BOM, combined)
- [ ] Toggle command cycles through all modes
- [ ] Direct view commands work
- [ ] View mode indicator visible and accurate
- [ ] Existing Phase 1 functionality unchanged

### Phase 3 (Highlighting)
- [ ] Single designator highlights correctly
- [ ] Connection sets highlight all related items
- [ ] Highlighting updates in real-time (with debounce)
- [ ] Highlighting works with regex extraction
- [ ] No performance issues with large BOMs
- [ ] Highlights are visually clear and distinct
- [ ] Existing Phase 1 and 2 functionality unchanged

---

## Next Steps
See individual phase documents for detailed implementation plans:
- [Phase 1: Core BOM Display](./02-phase1-core-bom.md)
- [Phase 2: View Toggle](./03-phase2-view-toggle.md)
- [Phase 3: Advanced Highlighting](./04-phase3-highlighting.md)

---

## Document References
- [Phase 1 Detailed Implementation](./02-phase1-core-bom.md)
- [Phase 2 Detailed Implementation](./03-phase2-view-toggle.md)
- [Phase 3 Detailed Implementation](./04-phase3-highlighting.md)
- [redhat-yaml API Analysis](./05-redhat-yaml-analysis.md)
