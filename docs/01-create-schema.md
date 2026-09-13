# Step 1: Create schemas/wireviz-schema.json

## Objective
Create a comprehensive JSON Schema file that validates WireViz YAML structure and provides autocomplete for WireViz-specific fields.

## References
- [JSON Schema Specification](https://json-schema.org/)
- [VSCode YAML Schema Documentation](https://code.visualstudio.com/docs/languages/yaml#_yaml-schemas-and-settings)
- [wireviz/WireViz#348](https://github.com/wireviz/WireViz/issues/348) - YAML Schema validation discussion
- [WireViz Syntax Documentation](https://github.com/wireviz/WireViz/blob/master/docs/syntax.md)

## Implementation

The initial implementation of the WireViz JSON Schema has been created at `schemas/wireviz-schema.json`.

This schema file includes:

- **Top-level properties**: connectors, cables, connections, metadata, options, tweak, additional_bom_items
- **Connector properties**: type, subtype, pincount, pins, pinlabels, pincolors, color, bgcolor, bgcolor_title, style, category, show_name, show_pincount, hide_disconnected_pins, loops, image, notes, manufacturer, mpn, pn, supplier, spn, ignore_in_bom, additional_components
- **Cable properties**: category, type, gauge, gauge_unit, show_equiv, length, length_unit, colors, color_code, wirecount, wirelabels, shield, show_name, show_wirecount, show_wirenumbers, color, bgcolor, bgcolor_title, image, notes, manufacturer, mpn, pn, supplier, spn, ignore_in_bom, additional_components
- **Connection sets**: Support for designators, pin/wire references, arrays, objects, and special connection symbols (--, <--, <-->, -->, ==, <==, <==>, ==>, <=>)
- **Additional definitions**: color codes, color modes, images, additional components, BOM items
- **Flexibility**: Top-level additionalProperties allowed for templates and future extensions

The schema is based on the analysis of:
- WireViz DataClasses.py and Harness.py source code
- The YAML schema attached to wireviz/WireViz#348
- The official WireViz syntax documentation
- Example files from the WireViz repository

### File Location
`schemas/wireviz-schema.json`

For the complete schema implementation, see the actual file in the repository.

## Next Steps

See the remaining implementation guides in the docs/ directory:

- [docs/02-update-package-json.md](docs/02-update-package-json.md) - Register the schema
- [docs/03-modify-extension.md](docs/03-modify-extension.md) - Add validation and diagnostics
- [docs/04-add-dependency.md](docs/04-add-dependency.md) - Add js-yaml dependency   


## Validation

Test the schema with various WireViz YAML files to ensure it:
- Validates correct WireViz files without errors
- Catches common syntax errors
- Provides helpful error messages
- Supports all documented WireViz features

## Notes
- The schema should be permissive enough to not break on valid WireViz files
- Unknown properties at the top level should be allowed (for templates and future extensions)
- Consider making the schema less strict initially and tightening it over time
