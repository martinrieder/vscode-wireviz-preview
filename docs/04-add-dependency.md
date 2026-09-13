# Step 4: Add js-yaml Dependency for Pre-Validation

## Objective
Add the js-yaml dependency to enable YAML parsing and validation in the extension.

## References
- [js-yaml GitHub Repository](https://github.com/nodeca/js-yaml)
- [js-yaml npm Package](https://www.npmjs.com/package/js-yaml)
- [VSCode Extension Dependencies](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packagejson)

## Implementation

### Update package.json

In the `package.json` file, add `js-yaml` to the `dependencies` section:

```json
{
  "dependencies": {
    "await-spawn": "4.x",
    "js-yaml": "^4.1.0",
    "semver": "7.x"
  }
}
```

### Version Justification

- **^4.1.0**: This version range includes the latest stable releases of js-yaml
- **Features needed**:
  - Full YAML 1.1 specification support
  - Error reporting with line and column information
  - Safe loading (to prevent code execution from YAML)
  - TypeScript type definitions included

### Alternative: yml or yaml Packages

Other YAML parsing libraries were considered:

1. **yaml** (by eemeli) - Modern, fast, but heavier
2. **yml** - Lightweight, but less features
3. **js-yaml** - Chosen for its maturity, stability, and comprehensive YAML 1.1 support

### Installation

After updating package.json, run:

```bash
npm install
```

This will install the js-yaml dependency and its TypeScript types.

## Usage in Code

The js-yaml library provides several key functions:

### 1. Parsing YAML

```typescript
import yaml from "js-yaml";

// Parse YAML string to JavaScript object
const data = yaml.load(yamlString) as any;
```

### 2. Error Handling

```typescript
try {
  const data = yaml.load(yamlString) as any;
} catch (error) {
  if (error instanceof yaml.YAMLException) {
    // error has properties:
    // - message: string
    // - mark: { line: number, column: number, snippet: string }
    console.error(`YAML Error at line ${error.mark?.line}: ${error.message}`);
  }
}
```

### 3. Dumping YAML (Optional)

```typescript
// Convert JavaScript object back to YAML string
const yamlString = yaml.dump(data);
```

### 4. Safe Loading

```typescript
// Use safeLoad to prevent arbitrary code execution
const data = yaml.safeLoad(yamlString) as any;
```

**Note**: For this extension, use `yaml.load()` instead of `yaml.safeLoad()` because:
- WireViz YAML files are trusted (created by users)
- We need support for custom tags that might be used in WireViz
- The extension already runs in a sandboxed environment

## TypeScript Support

The js-yaml package includes TypeScript type definitions, so no additional `@types/js-yaml` installation is needed.

## Security Considerations

1. **YAML Parsing Safety**: js-yaml's `load()` function can execute arbitrary code if the YAML contains special tags. However:
   - WireViz files are user-created and trusted
   - The extension runs in VSCode's sandbox
   - WireViz itself uses PyYAML which has similar capabilities

2. **Validation**: The extension should still validate the parsed data structure to ensure it's a valid WireViz file.

3. **Error Handling**: Always wrap yaml.load() in try-catch blocks to handle malformed YAML gracefully.

## Testing the Dependency

Create a test file to verify the dependency works:

```typescript
// test/yaml.test.ts
import yaml from "js-yaml";
import assert from "assert";

describe("YAML Parsing", () => {
  it("should parse valid WireViz YAML", () => {
    const yamlString = `
connectors:
  X1:
    type: D-Sub
    pinlabels: [1, 2, 3]

cables:
  W1:
    colors: [RD, BK, WH]

connections:
  - - X1: [1, 2, 3]
    - W1: [1, 2, 3]
`;
    
    const data = yaml.load(yamlString) as any;
    assert(data.connectors !== undefined);
    assert(data.cables !== undefined);
    assert(data.connections !== undefined);
  });

  it("should throw on invalid YAML", () => {
    const invalidYaml = "connectors: [X1: type: D-Sub";
    
    assert.throws(() => {
      yaml.load(invalidYaml);
    }, yaml.YAMLException);
  });

  it("should report line numbers in errors", () => {
    const yamlWithError = `connectors:
  X1:
    type: D-Sub
  invalid yaml here`;
    
    try {
      yaml.load(yamlWithError);
      assert.fail("Should have thrown an error");
    } catch (error) {
      if (error instanceof yaml.YAMLException) {
        assert(error.mark?.line !== undefined);
        assert(error.mark?.line === 3); // Error on line 4 (0-indexed)
      }
    }
  });
});
```

## Performance Considerations

1. **Parsing Overhead**: YAML parsing adds minimal overhead (typically <10ms for small files)
2. **Debouncing**: The extension already debounces validation on document changes (500ms)
3. **Caching**: Consider caching parsed results if validation becomes a bottleneck

## Documentation Updates

Update the extension's README to mention:

- The extension now validates YAML syntax in real-time
- Requires js-yaml dependency
- Validation errors are shown as inline markers in the editor
- Validation runs automatically on file open and change

## References

- [js-yaml API Documentation](https://github.com/nodeca/js-yaml/wiki/Markdown-Syntax)
- [YAML 1.1 Specification](https://yaml.org/spec/1.1/)
- [VSCode Extension Best Practices](https://code.visualstudio.com/api/extension-guides/extension-gallery#best-practices)
