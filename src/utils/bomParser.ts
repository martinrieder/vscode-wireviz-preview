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
 * Handles quoted fields, escaped characters, and multi-line values
 */
export function parseBomTsv(tsvContent: string): BomData {
	const lines = tsvContent.split('\n');
	const nonEmptyLines = lines.filter(line => line.trim().length > 0);
	
	if (nonEmptyLines.length === 0) {
		return { headers: [], rows: [] };
	}
	
	// Parse header row
	const headers = parseTsvLine(nonEmptyLines[0].replace(/\r$/, ''));
	
	// If there's only a header row, return it with empty rows
	if (nonEmptyLines.length === 1) {
		return { headers, rows: [] };
	}
	
	// Parse data rows
	const rows: BomRow[] = [];
	for (let i = 1; i < nonEmptyLines.length; i++) {
		const values = parseTsvLine(nonEmptyLines[i].replace(/\r$/, ''));
		
		// Ensure we have enough values
		while (values.length < headers.length) {
			values.push('');
		}
		
		const row: any = {};
		for (let j = 0; j < headers.length && j < values.length; j++) {
			row[headers[j]] = values[j].trim();
		}
		
		rows.push({
			Id: row['Id'] || row['ID'] || '',
			Description: row['Description'] || '',
			Qty: row['Qty'] || row['Quantity'] || '',
			Unit: row['Unit'] || '',
			Designators: row['Designators'] || ''
		});
	}
	
	return { headers, rows };
}

/**
 * Parses a single TSV line, handling quoted fields and escaped characters
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
