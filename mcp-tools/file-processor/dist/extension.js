"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));

// ============================================================
// Glob Matcher
// ============================================================
function globMatch(pattern, filePath) {
    function globToRegex(pat) {
        let regexStr = '';
        let i = 0;
        while (i < pat.length) {
            const ch = pat[i];
            if (ch === '*' && pat[i + 1] === '*') {
                if (pat[i + 2] === '/') {
                    regexStr += '(?:.+/)?';
                    i += 3;
                } else {
                    regexStr += '.*';
                    i += 2;
                }
            } else if (ch === '*') {
                regexStr += '[^/]*';
                i++;
            } else if (ch === '?') {
                regexStr += '[^/]';
                i++;
            } else if (ch === '[') {
                const end = pat.indexOf(']', i);
                if (end !== -1) {
                    regexStr += pat.slice(i, end + 1);
                    i = end + 1;
                } else {
                    regexStr += '\\[';
                    i++;
                }
            } else if (ch === '{') {
                const end = pat.indexOf('}', i);
                if (end !== -1) {
                    const content = pat.slice(i + 1, end);
                    const options = content.split(',').join('|');
                    regexStr += `(?:${options})`;
                    i = end + 1;
                } else {
                    regexStr += '\\{';
                    i++;
                }
            } else if ('.+^${}()|[]\\'.includes(ch)) {
                regexStr += '\\' + ch;
                i++;
            } else {
                regexStr += ch;
                i++;
            }
        }
        return new RegExp(`^${regexStr}$`);
    }
    const regex = globToRegex(pattern);
    return regex.test(filePath.replace(/\\/g, '/'));
}

// ============================================================
// Tool Definitions
// ============================================================
const TOOLS_DEF = [
    {
        name: 'search_in_files',
        description: 'Search for a text pattern across files in the workspace. Supports regex and plain text modes. Returns matching lines with file paths, line numbers, and context.',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Search pattern (regex or plain text)' },
                directory: { type: 'string', description: 'Root directory to search in. Defaults to the current workspace root.' },
                filePattern: { type: 'string', description: 'Glob pattern to filter files (e.g., "*.ts", "*.{js,jsx}"). Defaults to all files.' },
                useRegex: { type: 'boolean', description: 'Whether to treat the pattern as a regular expression. Default: false.' },
                caseSensitive: { type: 'boolean', description: 'Whether the search should be case sensitive. Default: true.' },
                maxResults: { type: 'number', description: 'Maximum number of results to return. Default: 200.' },
                contextLines: { type: 'number', description: 'Number of context lines before and after each match. Default: 2.' },
            },
            required: ['pattern'],
        },
    },
    {
        name: 'replace_in_files',
        description: 'Replace text across files in the workspace. Supports regex capture groups. Can perform dry-run to preview changes before applying.',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Search pattern (regex or plain text)' },
                replacement: { type: 'string', description: 'Replacement text. Supports $1, $2 for regex capture groups.' },
                directory: { type: 'string', description: 'Root directory to search in. Defaults to the current workspace root.' },
                filePattern: { type: 'string', description: 'Glob pattern to filter files. Defaults to all files.' },
                useRegex: { type: 'boolean', description: 'Whether to treat the pattern as a regular expression. Default: false.' },
                caseSensitive: { type: 'boolean', description: 'Whether the search should be case sensitive. Default: true.' },
                dryRun: { type: 'boolean', description: 'If true, preview changes without writing to files. Default: true.' },
                maxReplacements: { type: 'number', description: 'Maximum total replacements across all files. Default: 1000.' },
            },
            required: ['pattern', 'replacement'],
        },
    },
    {
        name: 'file_statistics',
        description: 'Get statistics about files in a directory: line counts, file sizes, language breakdown, and duplicate detection.',
        inputSchema: {
            type: 'object',
            properties: {
                directory: { type: 'string', description: 'Root directory to analyze. Defaults to the current workspace root.' },
                filePattern: { type: 'string', description: 'Glob pattern to filter files. Defaults to all files.' },
                includeHidden: { type: 'boolean', description: 'Whether to include hidden files (starting with .). Default: false.' },
            },
        },
    },
    {
        name: 'batch_rename',
        description: 'Batch rename files using a pattern. Supports sequential numbering and regex-based renaming.',
        inputSchema: {
            type: 'object',
            properties: {
                directory: { type: 'string', description: 'Directory containing files to rename.' },
                pattern: { type: 'string', description: 'Regex pattern to match in file names. Capture groups can be used in the template.' },
                template: { type: 'string', description: 'New name template. Use $1, $2 for capture groups, {{index}} for sequential numbering.' },
                dryRun: { type: 'boolean', description: 'If true, preview changes without renaming. Default: true.' },
            },
            required: ['directory', 'pattern', 'template'],
        },
    },
];

// ============================================================
// File Processor Connector
// ============================================================
const DEFAULT_EXCLUDE_PATTERNS = [
    'node_modules', '.git', 'dist', 'build', '__pycache__',
    '.venv', '.next', '.nuxt', 'coverage', '.cache',
];

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class FileProcessorConnector {
    getMaxFileSize() {
        return vscode.workspace.getConfiguration('fileProcessor').get('maxFileSize', 10485760);
    }
    getMaxResults() {
        return vscode.workspace.getConfiguration('fileProcessor').get('maxResults', 1000);
    }
    getExcludePatterns() {
        return vscode.workspace.getConfiguration('fileProcessor').get('excludePatterns', DEFAULT_EXCLUDE_PATTERNS);
    }
    getWorkspaceRoot(directory) {
        if (directory && path.isAbsolute(directory)) {
            return directory;
        }
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            throw new Error('No workspace folder is open');
        }
        return directory
            ? path.resolve(folders[0].uri.fsPath, directory)
            : folders[0].uri.fsPath;
    }
    collectFiles(rootDir, filePattern) {
        const excludePatterns = this.getExcludePatterns();
        const maxFileSize = this.getMaxFileSize();
        const files = [];
        const walkDir = (dir) => {
            let entries;
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch { return; }
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (!excludePatterns.some(p => entry.name === p || entry.name.startsWith('.'))) {
                        walkDir(fullPath);
                    }
                } else if (entry.isFile()) {
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.size > maxFileSize) continue;
                    } catch { continue; }
                    if (filePattern) {
                        const relPath = path.relative(rootDir, fullPath);
                        if (globMatch(filePattern, relPath) || globMatch(filePattern, entry.name)) {
                            files.push(fullPath);
                        }
                    } else {
                        files.push(fullPath);
                    }
                }
            }
        };
        walkDir(rootDir);
        return files;
    }
    async callTool(name, args) {
        switch (name) {
            case 'search_in_files': return this.searchInFiles(args);
            case 'replace_in_files': return this.replaceInFiles(args);
            case 'file_statistics': return this.fileStatistics(args);
            case 'batch_rename': return this.batchRename(args);
            default: throw new Error(`Unknown tool: ${name}`);
        }
    }
    async searchInFiles(args) {
        const { pattern, directory, filePattern, useRegex = false, caseSensitive = true, maxResults = 200, contextLines = 2 } = args;
        const rootDir = this.getWorkspaceRoot(directory);
        const files = this.collectFiles(rootDir, filePattern);
        const results = [];
        let regex;
        try {
            regex = useRegex
                ? new RegExp(pattern, caseSensitive ? 'g' : 'gi')
                : new RegExp(escapeRegex(pattern), caseSensitive ? 'g' : 'gi');
        } catch (err) {
            return { error: true, message: `Invalid regex pattern: ${err.message}` };
        }
        for (const file of files) {
            if (results.length >= maxResults) break;
            let content;
            try { content = fs.readFileSync(file, 'utf-8'); } catch { continue; }
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (results.length >= maxResults) break;
                const line = lines[i];
                regex.lastIndex = 0;
                if (regex.test(line)) {
                    results.push({
                        file: path.relative(rootDir, file),
                        line: i + 1,
                        column: line.search(regex) + 1,
                        text: line.trim(),
                        contextBefore: lines.slice(Math.max(0, i - contextLines), i).map(l => l.trim()),
                        contextAfter: lines.slice(i + 1, i + 1 + contextLines).map(l => l.trim()),
                    });
                }
            }
        }
        return { pattern, rootDir: '.', totalMatches: results.length, filesSearched: files.length, results };
    }
    async replaceInFiles(args) {
        const { pattern, replacement, directory, filePattern, useRegex = false, caseSensitive = true, dryRun = true, maxReplacements = 1000 } = args;
        const rootDir = this.getWorkspaceRoot(directory);
        const files = this.collectFiles(rootDir, filePattern);
        const results = [];
        let totalReplacements = 0;
        let regex;
        try {
            regex = useRegex
                ? new RegExp(pattern, caseSensitive ? 'g' : 'gi')
                : new RegExp(escapeRegex(pattern), caseSensitive ? 'g' : 'gi');
        } catch (err) {
            return { error: true, message: `Invalid regex pattern: ${err.message}` };
        }
        for (const file of files) {
            if (totalReplacements >= maxReplacements) break;
            let content;
            try { content = fs.readFileSync(file, 'utf-8'); } catch { continue; }
            const newContent = content.replace(regex, replacement);
            const replacementCount = content.split(regex).length - 1;
            if (replacementCount > 0 && newContent !== content) {
                const actualCount = Math.min(replacementCount, maxReplacements - totalReplacements);
                totalReplacements += actualCount;
                const preview = [];
                const oldLines = content.split('\n');
                const newLines = newContent.split('\n');
                const diffLimit = 5;
                let diffCount = 0;
                for (let i = 0; i < Math.max(oldLines.length, newLines.length) && diffCount < diffLimit; i++) {
                    if (oldLines[i] !== newLines[i]) {
                        preview.push(`L${i + 1}: - ${oldLines[i]?.trim()}`);
                        preview.push(`L${i + 1}: + ${newLines[i]?.trim()}`);
                        diffCount++;
                    }
                }
                results.push({ file: path.relative(rootDir, file), replacements: actualCount, preview });
                if (!dryRun) {
                    try { fs.writeFileSync(file, newContent, 'utf-8'); }
                    catch (err) { results[results.length - 1].preview.push(`ERROR: Failed to write: ${err.message}`); }
                }
            }
        }
        return {
            pattern, replacement, dryRun, totalReplacements,
            filesAffected: results.length, filesSearched: files.length, results,
            message: dryRun
                ? `Dry run: ${totalReplacements} replacements would be made across ${results.length} files. Set dryRun=false to apply.`
                : `Applied ${totalReplacements} replacements across ${results.length} files.`,
        };
    }
    async fileStatistics(args) {
        const { directory, filePattern, includeHidden = false } = args;
        const rootDir = this.getWorkspaceRoot(directory);
        const files = this.collectFiles(rootDir, filePattern);
        const stats = { totalFiles: 0, totalLines: 0, totalSize: 0, byExtension: {}, largestFiles: [] };
        const allFiles = [];
        for (const file of files) {
            const basename = path.basename(file);
            if (!includeHidden && basename.startsWith('.')) continue;
            try {
                const stat = fs.statSync(file);
                const content = fs.readFileSync(file, 'utf-8');
                const lines = content.split('\n').length;
                const ext = path.extname(file).toLowerCase() || '(no extension)';
                stats.totalFiles++;
                stats.totalLines += lines;
                stats.totalSize += stat.size;
                if (!stats.byExtension[ext]) {
                    stats.byExtension[ext] = { files: 0, lines: 0, size: 0 };
                }
                stats.byExtension[ext].files++;
                stats.byExtension[ext].lines += lines;
                stats.byExtension[ext].size += stat.size;
                allFiles.push({ file: path.relative(rootDir, file), size: stat.size, lines });
            } catch { /* skip */ }
        }
        stats.largestFiles = allFiles.sort((a, b) => b.size - a.size).slice(0, 20);
        return stats;
    }
    async batchRename(args) {
        const { directory, pattern, template, dryRun = true } = args;
        const rootDir = this.getWorkspaceRoot(directory);
        if (!fs.existsSync(rootDir)) {
            return { error: true, message: `Directory not found: ${rootDir}` };
        }
        let regex;
        try { regex = new RegExp(pattern); }
        catch (err) { return { error: true, message: `Invalid regex pattern: ${err.message}` }; }
        const entries = fs.readdirSync(rootDir);
        const operations = [];
        let index = 0;
        for (const entry of entries) {
            const match = regex.exec(entry);
            if (match) {
                let newName = template;
                for (let i = 1; i < match.length; i++) {
                    newName = newName.replace(`$${i}`, match[i]);
                }
                newName = newName.replace(/\{\{index\}\}/g, String(index + 1).padStart(3, '0'));
                index++;
                if (newName !== entry) {
                    operations.push({ original: entry, renamed: newName });
                    if (!dryRun) {
                        const oldPath = path.join(rootDir, entry);
                        const newPath = path.join(rootDir, newName);
                        try { fs.renameSync(oldPath, newPath); }
                        catch (err) { operations[operations.length - 1].renamed += ` (FAILED: ${err.message})`; }
                    }
                }
            }
        }
        return {
            directory: rootDir, pattern, template, dryRun,
            totalMatches: operations.length, operations,
            message: dryRun
                ? `Dry run: ${operations.length} files would be renamed. Set dryRun=false to apply.`
                : `Renamed ${operations.length} files.`,
        };
    }
}

// ============================================================
// Extension Activation
// ============================================================
async function activate(context) {
    const connector = new FileProcessorConnector();
    const mcpTools = [];
    for (const tool of TOOLS_DEF) {
        const prefixedName = `fp_${tool.name}`;
        mcpTools.push({
            name: prefixedName,
            description: tool.description,
            inputSchema: tool.inputSchema,
            handler: async (input) => {
                try {
                    const result = await connector.callTool(tool.name, input);
                    if (typeof result === 'string') {
                        try { return JSON.parse(result); }
                        catch { return result; }
                    }
                    return result;
                } catch (err) {
                    return { error: true, message: err.message || 'Unknown error occurred', toolName: tool.name };
                }
            },
        });
    }
    const provider = await vscode.trae.registerMcpProvider('file-processor', 'File Processor', mcpTools);
    context.subscriptions.push(provider);
    // Register VS Code commands
    context.subscriptions.push(vscode.commands.registerCommand('fileProcessor.search', async () => {
        const pattern = await vscode.window.showInputBox({ prompt: 'Enter search pattern', placeHolder: 'e.g., TODO|FIXME' });
        if (pattern) {
            const result = await connector.callTool('search_in_files', { pattern, useRegex: true });
            const channel = vscode.window.createOutputChannel('File Processor');
            channel.show();
            channel.appendLine(JSON.stringify(result, null, 2));
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('fileProcessor.replace', async () => {
        const pattern = await vscode.window.showInputBox({ prompt: 'Enter search pattern', placeHolder: 'e.g., oldName' });
        if (!pattern) return;
        const replacement = await vscode.window.showInputBox({ prompt: 'Enter replacement', placeHolder: 'e.g., newName' });
        if (replacement === undefined) return;
        const result = await connector.callTool('replace_in_files', { pattern, replacement, dryRun: true });
        const apply = await vscode.window.showWarningMessage(
            `Found ${result.totalReplacements} replacements in ${result.filesAffected} files. Apply?`,
            'Apply', 'Cancel',
        );
        if (apply === 'Apply') {
            const applyResult = await connector.callTool('replace_in_files', { pattern, replacement, dryRun: false });
            vscode.window.showInformationMessage(applyResult.message);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('fileProcessor.statistics', async () => {
        const result = await connector.callTool('file_statistics', {});
        const channel = vscode.window.createOutputChannel('File Processor');
        channel.show();
        channel.appendLine(JSON.stringify(result, null, 2));
    }));
}

function deactivate() { }
