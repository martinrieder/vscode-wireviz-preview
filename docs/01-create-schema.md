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
- [docs/04-add-dependency.md](docs/04-add-dependency.md) - Add js-yaml dependency   - `pincolors` (array, optional)
   - `ignore_in_bom` (boolean, optional)
   - `additional_components` (array, optional)

3. **Cable properties**:
   - `type` (string, optional)
   - `category` (string, optional)
   - `gauge` (string/integer, optional)
   - `length` (string/integer, optional)
   - `colors` (array, optional)
   - `color_code` (string, optional)
   - `wirecount` (integer, optional)
   - `wirelabels` (array, optional)
   - `shield` (boolean/string, optional)
   - `show_equiv` (boolean, optional)
   - `show_wirecount` (boolean, optional)
   - `show_wirenumbers` (boolean, optional)
   - `show_name` (boolean, optional)
   - `color` (string, optional)
   - `image` (object, optional)
   - `notes` (string, optional)
   - `manufacturer` (string, optional)
   - `mpn` (string, optional)
   - `pn` (string, optional)
   - `supplier` (string, optional)
   - `spn` (string, optional)
   - `bgcolor` (string, optional)
   - `bgcolor_title` (string, optional)
   - `ignore_in_bom` (boolean, optional)
   - `additional_components` (array, optional)

4. **Connection set**: Array of connection items where each item can be:
   - A string (designator)
   - An array of strings (designator with pin/wire references)
   - An object (map of designator to pin/wire references)
   - A special connection symbol: `--`, `<--`, `<-->`, `-->`, `==`, `<==`, `<==>`, `==>`

5. **Enumerated values**:
   - `color` and `bgcolor` fields should accept WireViz color codes:
     - Standard: BK, WH, GY, PK, RD, OG, YE, OL, GN, TQ, LB, BU, VT, BN, BG, IV, SL, CU, SN, SR, GD
     - Hex colors: `#` followed by 3 or 6 hex digits
   - `color_code` should accept: DIN, IEC, TEL, TELALT, T568A, T568B, BW
   - `category` should accept: bundle
   - `style` should accept: simple

6. **Pattern validation**:
   - Designators should match pattern: `^[a-zA-Z\x80-\xFF_-][0-9a-zA-Z\x80-\xFF_\.]*$`

## Example Schema Structure

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://raw.githubusercontent.com/martinrieder/vscode-wireviz-preview/master/schemas/wireviz-schema.json",
  "title": "WireViz YAML Schema",
  "description": "Schema for validating WireViz YAML configuration files",
  "type": "object",
  "properties": {
    "connectors": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/connector"
      }
    },
    "cables": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/cable"
      }
    },
    "connections": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/connectionSet"
      }
    },
    "metadata": {
      "$ref": "#/definitions/metadata"
    },
    "options": {
      "$ref": "#/definitions/options"
    },
    "tweak": {
      "$ref": "#/definitions/tweak"
    },
    "additional_bom_items": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/additionalBomItem"
      }
    }
  },
  "definitions": {
    "connector": {
      "type": "object",
      "properties": {
        "type": {"type": "string"},
        "subtype": {"type": "string"},
        "pincount": {"type": "integer", "minimum": 1},
        "pins": {"type": "array", "items": {"type": ["integer", "string"]}},
        "pinlabels": {"type": "array", "items": {"type": "string"}},
        "pincolors": {"type": "array", "items": {"$ref": "#/definitions/color"}},
        "color": {"$ref": "#/definitions/color"},
        "bgcolor": {"$ref": "#/definitions/color"},
        "bgcolor_title": {"$ref": "#/definitions/color"},
        "style": {"type": "string", "enum": ["simple"]},
        "show_name": {"type": "boolean"},
        "show_pincount": {"type": "boolean"},
        "hide_disconnected_pins": {"type": "boolean"},
        "loops": {"type": "array"},
        "image": {"$ref": "#/definitions/image"},
        "notes": {"type": "string"},
        "manufacturer": {"type": "string"},
        "mpn": {"type": ["string", "integer"]},
        "pn": {"type": ["string", "integer"]},
        "supplier": {"type": "string"},
        "spn": {"type": ["string", "integer"]},
        "ignore_in_bom": {"type": "boolean"},
        "additional_components": {
          "type": "array",
          "items": {"$ref": "#/definitions/additionalComponent"}
        }
      },
      "additionalProperties": false
    },
    "cable": {
      "type": "object",
      "properties": {
        "category": {"type": "string", "enum": ["bundle"]},
        "type": {"type": "string"},
        "gauge": {"type": ["string", "integer"]},
        "length": {"type": ["string", "number"]},
        "colors": {"type": "array", "items": {"$ref": "#/definitions/color"}},
        "color_code": {
          "type": "string",
          "enum": ["DIN", "IEC", "TEL", "TELALT", "T568A", "T568B", "BW"]
        },
        "wirecount": {"type": "integer", "minimum": 1},
        "wirelabels": {"type": "array", "items": {"type": "string"}},
        "shield": {"type": ["boolean", "string"]},
        "show_equiv": {"type": "boolean"},
        "show_wirecount": {"type": "boolean"},
        "show_wirenumbers": {"type": "boolean"},
        "show_name": {"type": "boolean"},
        "color": {"$ref": "#/definitions/color"},
        "bgcolor": {"$ref": "#/definitions/color"},
        "bgcolor_title": {"$ref": "#/definitions/color"},
        "image": {"$ref": "#/definitions/image"},
        "notes": {"type": "string"},
        "manufacturer": {"type": "string"},
        "mpn": {"type": ["string", "integer"]},
        "pn": {"type": ["string", "integer"]},
        "supplier": {"type": "string"},
        "spn": {"type": ["string", "integer"]},
        "ignore_in_bom": {"type": "boolean"},
        "additional_components": {
          "type": "array",
          "items": {"$ref": "#/definitions/additionalComponent"}
        }
      },
      "additionalProperties": false
    },
    "connectionSet": {
      "type": "array",
      "items": {
        "oneOf": [
          {"type": "string"},
          {"type": "array", "items": {"type": "string"}},
          {"type": "object", "additionalProperties": {"type": ["string", "array"]}},
          {"type": "string", "enum": ["--", "<--", "<-->", "-->", "==", "<==", "<==>", "==>"]}
        ]
      }
    },
    "color": {
      "oneOf": [
        {"type": "string", "enum": ["BK", "WH", "GY", "PK", "RD", "OG", "YE", "OL", "GN", "TQ", "LB", "BU", "VT", "BN", "BG", "IV", "SL", "CU", "SN", "SR", "GD"]},
        {"type": "string", "pattern": "^#[0-9A-Fa-f]{3,6}$"}
      ]
    },
    "image": {
      "type": "object",
      "properties": {
        "src": {"type": "string"},
        "caption": {"type": "string"},
        "bgcolor": {"$ref": "#/definitions/color"},
        "width": {"type": "integer", "minimum": 1, "maximum": 65535},
        "height": {"type": "integer", "minimum": 1, "maximum": 65535},
        "scale": {"type": "boolean"},
        "fixedsize": {"type": "boolean"}
      },
      "required": ["src"],
      "additionalProperties": false
    },
    "metadata": {
      "type": "object",
      "additionalProperties": {"type": "string"}
    },
    "options": {
      "type": "object",
      "properties": {
        "bgcolor": {"$ref": "#/definitions/color"},
        "bgcolor_node": {"$ref": "#/definitions/color"},
        "bgcolor_connector": {"$ref": "#/definitions/color"},
        "bgcolor_cable": {"$ref": "#/definitions/color"},
        "bgcolor_bundle": {"$ref": "#/definitions/color"},
        "color_mode": {
          "type": "string",
          "enum": ["full", "FULL", "hex", "HEX", "short", "SHORT", "ger", "GER"]
        },
        "fontname": {"type": "string"},
        "mini_bom_mode": {"type": "boolean"}
      },
      "additionalProperties": false
    },
    "tweak": {
      "type": "object",
      "properties": {
        "override": {
          "type": "object",
          "additionalProperties": true
        },
        "append": {
          "oneOf": [
            {"type": "string"},
            {"type": "array", "items": {"type": "string"}}
          ]
        }
      },
      "additionalProperties": false
    },
    "additionalBomItem": {
      "type": "object",
      "properties": {
        "description": {"type": "string"},
        "qty": {"type": "number"},
        "unit": {"type": "string"},
        "designators": {"type": "array", "items": {"type": "string"}},
        "pn": {"type": ["string", "integer"]},
        "manufacturer": {"type": "string"},
        "mpn": {"type": ["string", "integer"]},
        "supplier": {"type": "string"},
        "spn": {"type": ["string", "integer"]}
      },
      "required": ["description"],
      "additionalProperties": false
    },
    "additionalComponent": {
      "type": "object",
      "properties": {
        "type": {"type": "string"},
        "subtype": {"type": "string"},
        "qty": {"type": "number"},
        "qty_multiplier": {"type": "string"},
        "unit": {"type": "string"},
        "pn": {"type": ["string", "integer"]},
        "manufacturer": {"type": "string"},
        "mpn": {"type": ["string", "integer"]},
        "supplier": {"type": "string"},
        "spn": {"type": ["string", "integer"]},
        "bgcolor": {"$ref": "#/definitions/color"}
      },
      "required": ["type"],
      "additionalProperties": false
    }
  }
}
```

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
