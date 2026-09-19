import aspawn from "await-spawn";
import path from "path";
import semver from "semver";
import vscode, {window, TextDocument, Uri, WebviewOptions} from "vscode";
import { parseBomTsv, BomData } from './utils/bomParser';
import fs from "fs";

enum MsgType {
	Debug = "DEBUG",
	Info = "INFO",
	Warn = "WARNING",
	Err =  "ERROR",
}

/** This extension is only compatible with the specified WV version or above. */
const WvMinVersion = "0.4.0";
/** Regex to capture the WV executable version in the output of `wireviz -V` */
const VersionRegex: RegExp = /WireViz ([\d\.]+)/;
/** Title of the VSCode Output window used to log our errors. */
const OutputLog = vscode.window.createOutputChannel("WireViz Preview", "log");
/** Custom WV arguments from configuration */
type ConfiguredArgs = {
	outputFormats: string;
	outputDir: string;
	outputName: string | undefined;
	prepend: string | undefined;
};

let viewPanel: vscode.WebviewPanel | undefined;
let isRunning = false;
let currentBomData: BomData = { headers: [], rows: [] };

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand("wireviz.showPreview", async() => await showPreview()),
		vscode.workspace.onDidSaveTextDocument(onDocumentSaved)
	);
}

export async function deactivate() {
	viewPanel?.dispose();
}

async function onDocumentSaved(evt: TextDocument) {
	const activeDoc = window.activeTextEditor?.document;

	if (getConfig("refreshPreviewOnSave", true)
			&& evt.uri === activeDoc?.uri
			&& activeDoc?.languageId === "yaml") {
		await showPreview();
	}
}

async function showPreview() {
	// Very basic locking to prevent concurrent calls, when someone accidentally
	// re-triggers the event before previous operations have finished.
	if (isRunning) {
		return;
	}
	isRunning = true;

	try {
		const doc = window.activeTextEditor?.document;
	
		// Ensure we have a panel so we can show either output or errors
		createOrShowPreviewPanel(doc, "");
	
		show(MsgType.Info, "Generating diagram...");

		if (!doc || !isWirevizYamlFile(doc)) {
			show(MsgType.Err, "Not a WireViz YAML");
			return;
		}
	
		if (await isAnyWirevizError()) {
			return;
		}
	
		// Saving now. If you don't want to, too bad. WireViz doesn't work with stdin.
		if (doc.isDirty) {
			doc.save();
		}
	
		const cfgArgs = getArgsFromConfig(doc.fileName);
		const wvArgs = getWvCmdlineArgs(doc.fileName, cfgArgs);
		const outFile = getOutputFileFullpath(doc.fileName, cfgArgs);
		createOrShowPreviewPanel(doc, cfgArgs.outputDir); // Tell panel we have external resources in the output dir

		try {
			show(MsgType.Debug, "wireviz ".concat(wvArgs.join(" ")));
			const process = await aspawn("wireviz", wvArgs);
			
			// NEW: Read and parse BOM data
			const bomFile = getBomFileFullpath(doc.fileName, cfgArgs);
			try {
				const bomContent = await fs.promises.readFile(bomFile, 'utf8');
				currentBomData = parseBomTsv(bomContent);
			} catch (bomError) {
				console.warn('Could not read BOM file:', bomError);
				currentBomData = { headers: [], rows: [] };
			}
			
			showImg(outFile);
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

/** Ensures we can spawn WireViz, and that it has a version compatible with this extension. */
async function isAnyWirevizError(): Promise<boolean> {
	try {
		const versionProc = await aspawn("wireviz", ["-V"]);

		const verText = VersionRegex.exec(versionProc.toString())?.at(1) ?? "0.0";
		const verSemantic = semver.coerce(verText)!;
		if (semver.lt(verSemantic, WvMinVersion)) {
			show(MsgType.Err, `This extension only supports WireViz version ${WvMinVersion} or higher. Found version ${verText}.`);
			return true;
		}
	} catch (e: any) {
		if (e.stderr) {
			show(MsgType.Err, e.stderr.toString());
		}
		else if (e) {
			show(MsgType.Err, `${e.name}${e.message}\n  Cannot call wireviz.\n  Please ensure WireViz and Graphviz are installed and can be called from the terminal.`);
		}
		return true;
	}

	return false;
}

function getArgsFromConfig(inputFile: string): ConfiguredArgs {
	const outputName = getConfig<string>("outputName", undefined)?.trim();

	let prepend = getConfig<string>("prepend", undefined)?.trim();
	if (prepend && !path.isAbsolute(prepend)) {
		prepend = path.join(path.dirname(inputFile), prepend);
	}
	
	const outputFormats = getConfig("outputFormats", "")!.trim()
		.concat("st"); // force svg + tsv for BOM

	let outputDir = getConfig("outputDir", "")!.trim();
	if (!path.isAbsolute(outputDir)) {
		// Get full path relative to the input dir
		outputDir = path.join(path.dirname(inputFile), outputDir);
	}
	
	return {outputFormats, outputDir, outputName, prepend};
}

function getWvCmdlineArgs(inputFile: string, cfgArgs: ConfiguredArgs) {
	let cmdArgs = ["-f", cfgArgs.outputFormats, "-o", cfgArgs.outputDir];
	if (cfgArgs.outputName) {
		cmdArgs.push("-O", cfgArgs.outputName);
	}
	if (cfgArgs.prepend) {
		cmdArgs.push("-p", cfgArgs.prepend);
	}
	cmdArgs.push(inputFile);
	return cmdArgs;
}

function getOutputFileFullpath(inputFile: string, cfgArgs: ConfiguredArgs) {
	const inputFileExt = new RegExp(`${path.extname(inputFile)}$`);
	return path.join(cfgArgs.outputDir, cfgArgs.outputName
		? `${cfgArgs.outputName}.svg`
		: path.basename(inputFile).replace(inputFileExt, ".svg")
	);
}

/**
 * Gets the path to the BOM TSV file generated by WireViz
 */
function getBomFileFullpath(inputFile: string, cfgArgs: ConfiguredArgs): string {
	const inputFileExt = new RegExp(`${path.extname(inputFile)}$`);
	return path.join(
		cfgArgs.outputDir,
		cfgArgs.outputName
			? `${cfgArgs.outputName}.bom.tsv`
			: path.basename(inputFile).replace(inputFileExt, ".bom.tsv")
	);
}

/** Shows the preview panel, or create one if it does not yet exists. */
function createOrShowPreviewPanel(doc: TextDocument | undefined, outputDir: string) {
	const docColumn = window.activeTextEditor?.viewColumn;

	if (viewPanel) {
		viewPanel.webview.options = getWebviewOptions(outputDir);
		if (!viewPanel.visible) {
			viewPanel.reveal();
		}
	}
	else {
		viewPanel = window.createWebviewPanel(
			"WireVizPreview",
			"WireViz Preview",
			vscode.ViewColumn.Beside,
			getWebviewOptions(outputDir)
		);
		viewPanel.onDidDispose(() => viewPanel = undefined); // Delete panel on dispose

		// Return focus to text document. A little hacky.
		if (doc && window.activeTextEditor && docColumn !== viewPanel.viewColumn) {
			window.showTextDocument(doc, docColumn);
		}
	}
}

function getConfig<T>(section: string, defaultValue: T | undefined): T | undefined {
	return vscode.workspace // Scoped config. Workspace > User > Global.
		.getConfiguration("wireviz")
		.get(section, defaultValue);
}

function getWebviewOptions(outputDir: string): WebviewOptions {
	// By default, Webview can only show files (our generated img) under the Workspace/Folder.
	// If we want to show files elsewhere, we have to specify it using `localResourceRoots`.
	return {
		enableScripts: true,
		localResourceRoots: (isOutsideWorkspace(outputDir))
			? [Uri.file(outputDir)]
			: undefined // when undefined, `localResourceRoots` defaults to WS/Folder root.
	};
}

function isOutsideWorkspace(dir: string): boolean {
	return vscode.workspace.getWorkspaceFolder(Uri.file(dir)) === undefined;
}

// Rudimentary check for the minimum required contents of a WV yaml.
const isWvContent: RegExp = /connections:|cables:|connectors:/gm;
function isWirevizYamlFile(doc: TextDocument) {
	return doc.languageId === "yaml"
		&& doc.getText()?.match(isWvContent)?.length === 3;
}

/** Shows message of the specified type on the Webview.
 *  The message will also be printed to an Output window.
 */
function show(msgType: MsgType, msg: string) {
	if (viewPanel && msgType !== MsgType.Debug) {
		viewPanel.webview.html = `
			<html><head>${ViewPanelCss}</head><body>
				${msgType}: ${msg.replaceAll("\n", "<br/>")}
			</body></html>`;
	}

	const curTime = (new Date).toLocaleTimeString(undefined, {hour12: false});
	OutputLog.appendLine(`${curTime} ${msgType}: ${msg}`);
	
	if ([MsgType.Warn, MsgType.Err].includes(msgType)) {
		OutputLog.show();
	}
}

function showImg(imgFileName: string) {
	if (viewPanel) {
		const uri = Uri.file(imgFileName);
		const webviewUri = viewPanel.webview.asWebviewUri(uri);
		
		// Generate BOM table HTML with sorting and filtering
		const bomTableHtml = generateBomTableHtml(currentBomData);
		
		viewPanel.webview.html = `
			<html><head>${ViewPanelCss}</head><body>
				<figure>
					<img src="${webviewUri}" alt="Diagram">
					<figcaption>${imgFileName}</figcaption>
				</figure>
				${bomTableHtml}
			</body></html>`;
	}
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
	if (!text) return '';
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/**
 * Generates HTML for BOM table with column sorting and filtering
 */
function generateBomTableHtml(bomData: BomData): string {
	if (!bomData || bomData.rows.length === 0) {
		return '<div class="bom-empty">No BOM data available</div>';
	}
	
	const rowsHtml = bomData.rows.map(row => {
		// Normalize designators for data attribute
		const normalizedDesignators = (row.Designators || '')
			.split(',')
			.map(d => d.trim())
			.filter(d => d.length > 0)
			.join(',');
		
		return `
			<tr data-designators="${escapeHtml(normalizedDesignators)}">
				<td class="col-id">${escapeHtml(row.Id)}</td>
				<td class="col-description">${escapeHtml(row.Description)}</td>
				<td class="col-qty">${escapeHtml(row.Qty)}</td>
				<td class="col-unit">${escapeHtml(row.Unit)}</td>
				<td class="col-designators">${escapeHtml(row.Designators)}</td>
			</tr>
		`;
	}).join('');
	
	return `
		<div class="bom-container">
			<div class="bom-toolbar">
				<input type="text" id="bom-filter" placeholder="Filter BOM...">
				<button id="bom-clear-filter" title="Clear filter">\u00d7</button>
				<span class="bom-count">${bomData.rows.length} items</span>
			</div>
			<table class="bom-table">
				<thead>
					<tr>
						<th class="col-id" data-col="0">ID \u2191</th>
						<th class="col-description" data-col="1">Description \u2191</th>
						<th class="col-qty" data-col="2">Qty \u2191</th>
						<th class="col-unit" data-col="3">Unit \u2191</th>
						<th class="col-designators" data-col="4">Designators \u2191</th>
					</tr>
				</thead>
				<tbody>${rowsHtml}</tbody>
			</table>
		</div>
		<script>
			(function() {
				'use strict';
				
				// State for sorting
				let sortColumn = 0;
				let sortDirection = 1; // 1 = asc, -1 = desc
				let filterText = '';
				
				const bomBody = document.querySelector('.bom-table tbody');
				const filterInput = document.getElementById('bom-filter');
				const clearFilterBtn = document.getElementById('bom-clear-filter');
				const headers = document.querySelectorAll('.bom-table th');
				const summaryEl = document.querySelector('.bom-count');
				
				// Store original row data
				const originalRows = Array.from(bomBody?.querySelectorAll('tr') || []);
				
				// Filter input
				filterInput?.addEventListener('input', (e) => {
					filterText = e.target.value.toLowerCase();
					applySortAndFilter();
				});
				
				// Clear filter button
				clearFilterBtn?.addEventListener('click', () => {
					if (filterInput) {
						filterInput.value = '';
						filterText = '';
						applySortAndFilter();
					}
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
						applySortAndFilter();
						updateHeaderIndicators();
					});
				});
				
				// Apply current sort and filter
				function applySortAndFilter() {
					if (!bomBody || !originalRows.length) return;
					
					const rows = originalRows.filter(row => {
						if (!filterText) return true;
						return row.textContent.toLowerCase().includes(filterText);
					});
					
					const sorted = [...rows].sort((a, b) => {
						const colIndex = sortColumn + 1;
						const aVal = a.querySelector('td:nth-child(' + colIndex + ')')?.textContent || '';
						const bVal = b.querySelector('td:nth-child(' + colIndex + ')')?.textContent || '';
						
						// Numeric sort for Qty column (index 2)
						if (sortColumn === 2) {
							const aNum = parseFloat(aVal) || 0;
							const bNum = parseFloat(bVal) || 0;
							return (aNum - bNum) * sortDirection;
						}
						
						// String sort for others
						return aVal.localeCompare(bVal) * sortDirection;
					});
					
					// Clear and re-append sorted/filtered rows
					bomBody.innerHTML = '';
					sorted.forEach(row => bomBody.appendChild(row.cloneNode(true)));
					
					// Update count
					if (summaryEl) {
						summaryEl.textContent = rows.length + ' of ' + originalRows.length + ' items';
					}
				}
				
				// Update header UI to show sort indicators
				function updateHeaderIndicators() {
					headers.forEach((h, idx) => {
						const upArrow = '\u2191';
						const downArrow = '\u2193';
						const indicator = sortColumn === idx 
							? (sortDirection === 1 ? upArrow : downArrow) 
							: upArrow;
						const cleanText = h.textContent.replace(/[\u2191\u2193]/g, '').trim();
						h.innerHTML = cleanText + ' ' + indicator;
					});
				}
				
				// Initial render
				applySortAndFilter();
			})();
		</script>
	`;
}

const ViewPanelCss = `
<style>
	body { background-color: transparent; font-size: medium; padding: 5pt; }
	figure, img { width: 100%; padding: 0; margin: 0; }
	figcaption { font-size: small; }
	
	/* BOM Table Styles */
	.bom-container {
		margin-top: 15px;
		border-top: 1px solid #444;
		padding-top: 10px;
	}
	.bom-toolbar {
		display: flex;
		gap: 10px;
		margin-bottom: 8px;
		align-items: center;
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
		padding: 4px 8px;
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
	.bom-count {
		color: #888;
		font-size: 11px;
	}
	.bom-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}
	.bom-table th {
		background-color: #252526;
		color: #ccc;
		padding: 6px 8px;
		text-align: left;
		border-bottom: 2px solid #007acc;
		cursor: pointer;
		user-select: none;
	}
	.bom-table th:hover {
		background-color: #2d2d30;
	}
	.bom-table td {
		padding: 4px 8px;
		border-bottom: 1px solid #333;
		color: #ccc;
	}
	.bom-table tr:nth-child(even) td {
		background-color: #1e1e1e;
	}
	.bom-table tr:nth-child(odd) td {
		background-color: #252526;
	}
	.bom-table tr:hover td {
		background-color: #2d2d30;
	}
	.bom-empty {
		color: #666;
		text-align: center;
		padding: 10px;
		font-style: italic;
	}
</style>
`;
