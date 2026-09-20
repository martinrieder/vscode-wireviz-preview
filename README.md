# WireViz Preview for VSCode

**A Visual Studio Code extension to preview WireViz YAML cable harness diagrams.**

[![VSCode Marketplace](https://img.shields.io/badge/VSCode-Marketplace-007ACC?logo=visual-studio-code&style=flat-square)](https://marketplace.visualstudio.com/items?itemName=NanangP.vscode-wireviz-preview)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://spdx.org/licenses/GPL-3.0-only.html)

---

## ✨ Features

- **Live Preview**: Generate and display WireViz diagrams directly in VSCode
- **One-Click Refresh**: Preview updates automatically on file save (configurable)
- **Keyboard Shortcut**: Press `F8` to generate/refresh preview
- **Workspace Support**: Works with files inside and outside the workspace
- **Customizable Output**: Configure WireViz CLI arguments via VSCode settings

> **📢 New in Development Branches** (see [FORK.md](FORK.md) for details):
> - **YAML Schema Validation**: Intelligent autocompletion and validation
> - **Pre-Execution Validation**: Real-time error detection
> - **BOM Table Display**: Sortable/filterable bill of materials
> - **Cursor-Based Highlighting**: Highlight components based on YAML cursor position

---

## 📥 Installation

### Option 1: From VSCode Marketplace (Recommended)
1. Open VSCode
2. Go to Extensions (`Ctrl+Shift+X` or `Cmd+Shift+X`)
3. Search for **"WireViz Preview"**
4. Click **Install**

### Option 2: Build from Source
```bash
# Clone the repository
git clone https://github.com/martinrieder/vscode-wireviz-preview.git
cd vscode-wireviz-preview

# Install dependencies
npm install

# Build the extension
npm run vscode:prepublish

# Open in VSCode and press F5 to launch Extension Development Host
code .
```

---

## ⚙️ Requirements

| Tool | Version | Purpose |
|------|---------|---------|
| [WireViz](https://github.com/wireviz/WireViz) | **≥ 0.4.0** | Generates diagrams from YAML |
| [Python](https://www.python.org/downloads/) | ≥ 3.7 | WireViz dependency |
| [Graphviz](https://graphviz.org/download/) | Latest | Diagram rendering engine |

### Verify Installation
```bash
# Check WireViz version
wireviz -V
# Expected output: "WireViz 0.4.0" or higher

# Check Graphviz
dot -V
# Expected output: Graphviz version info
```

---

## 🚀 Usage

### Basic Usage
1. **Open a WireViz YAML file** in VSCode
2. **Press `F8`** or click the **"WireViz: Preview"** button in the editor toolbar
3. The preview panel opens **beside your editor** showing the generated diagram

### Example WireViz YAML
```yaml
# example.yaml
connectors:
  CONN1:
    type: "D-Sub 9"
    pinlabels: [1, 2, 3, 4, 5, 6, 7, 8, 9]
  CONN2:
    type: "D-Sub 9"
    pinlabels: [1, 2, 3, 4, 5, 6, 7, 8, 9]

cables:
  CABLE1:
    length: 1.5
    gauge: 20
    color: BLK

connections:
  - [CONN1:1, CABLE1:1, CONN2:1]
  - [CONN1:2, CABLE1:2, CONN2:2]
```

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `F8` | Generate/Refresh Preview |

### Commands
Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and type:
- `WireViz: Preview` - Generate preview of current file

---

## ⚙️ Configuration

Open VSCode Settings (`Ctrl+,` or `Cmd+,`) and search for **"WireViz"** to configure the following options:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `wireviz.refreshPreviewOnSave` | boolean | `true` | Refresh preview automatically when saving the file |
| `wireviz.outputFormats` | string | `""` | Output formats: `g`=GV, `h`=HTML, `p`=PNG, `s`=SVG, `t`=TSV |
| `wireviz.outputDir` | string | `""` | Output directory for generated files (relative to input file) |
| `wireviz.outputName` | string | `""` | Output filename without extension |
| `wireviz.prepend` | string | `""` | YAML file to prepend to the input |

### Example Configuration
```json
{
  "wireviz.refreshPreviewOnSave": true,
  "wireviz.outputFormats": "hs",
  "wireviz.outputDir": "./output",
  "wireviz.outputName": "diagram"
}
```

---

## 🐛 Troubleshooting

### Common Issues

#### "Not a WireViz YAML"
**Cause**: The file doesn't contain the required WireViz sections.
**Solution**: Ensure your file has at least `connectors:`, `cables:`, and `connections:` sections.

#### "Cannot call wireviz"
**Cause**: WireViz is not installed or not in your PATH.
**Solution**:
1. Install WireViz: `pip install wireviz`
2. Ensure Python and WireViz are in your system PATH
3. Restart VSCode

#### "WireViz version incompatible"
**Cause**: You're using WireViz < 0.4.0.
**Solution**: Upgrade WireViz:
```bash
pip install --upgrade wireviz
```

#### Preview not updating
**Cause**: Auto-refresh is disabled or file is not saved.
**Solution**:
1. Check `wireviz.refreshPreviewOnSave` is set to `true`
2. Save the file (`Ctrl+S` or `Cmd+S`)
3. Manually refresh with `F8`

#### Graphviz errors
**Cause**: Graphviz is not installed or misconfigured.
**Solution**:
- **Windows**: Download from [Graphviz website](https://graphviz.org/download/)
- **macOS**: `brew install graphviz`
- **Linux**: `sudo apt-get install graphviz` (Debian/Ubuntu) or `sudo dnf install graphviz` (Fedora)

---

## 📚 Learn More

### WireViz Resources
- [WireViz GitHub Repository](https://github.com/wireviz/WireViz)
- [WireViz Documentation](https://github.com/wireviz/WireViz/blob/master/docs/syntax.md)
- [WireViz Examples](https://github.com/wireviz/WireViz/tree/master/examples)

### Extension Resources
- [VSCode Marketplace Page](https://marketplace.visualstudio.com/items?itemName=NanangP.vscode-wireviz-preview)
- [GitHub Repository](https://github.com/martinrieder/vscode-wireviz-preview)

### For Developers
Detailed technical documentation, architecture overview, and feature branch analysis:
📖 **[FORK.md](FORK.md)**

---

## 🤝 Contributing

### Reporting Issues
1. Check if the issue already exists in [GitHub Issues](https://github.com/martinrieder/vscode-wireviz-preview/issues)
2. Create a new issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Screenshot (if applicable)
   - WireViz version (`wireviz -V`)
   - VSCode version
   - Operating system

### Development Setup
```bash
# Clone the repository
git clone https://github.com/martinrieder/vscode-wireviz-preview.git
cd vscode-wireviz-preview

# Install dependencies
npm install

# Build the extension
npm run esbuild

# Run tests
npm run lint
```

### Feature Branches
This repository has active feature branches with planned enhancements:

| Branch | Status | Description |
|--------|--------|-------------|
| `feature/yaml-schema` | Partially Implemented | JSON Schema validation for autocompletion |
| `feature/yaml-validation` | Partially Implemented | Real-time diagnostics and pre-execution validation |
| `feature/bom-preview` | Planned | BOM table display with sorting, filtering, and highlighting |

See **[FORK.md](FORK.md)** for detailed analysis of each branch.

---

## 📜 Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

---

## 📄 License

This project is licensed under the **GPL-3.0 License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [WireViz](https://github.com/wireviz/WireViz) - The amazing tool that makes this extension possible
- [VSCode](https://code.visualstudio.com/) - The best code editor
- All contributors and users of this extension

---

**Enjoy using WireViz Preview! 🎉**
