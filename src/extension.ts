import * as vscode from 'vscode';
import express, { Request, Response } from 'express';
import cors from 'cors';
import * as http from 'http';

let server: http.Server | null = null;
const PORT = 37842;

// Record the last text edited by the extension
let lastEditedText: string | null = null;
let lastEditedUri: vscode.Uri | null = null;

export function activate(context: vscode.ExtensionContext) {
    console.log('Quarto Move Abs Elems extension is now active');

    let startCommand = vscode.commands.registerCommand(
        'quarto-mov-abs-elems.startServer',
        () => {
            startServer();
        }
    );

    let stopCommand = vscode.commands.registerCommand(
        'quarto-mov-abs-elems.stopServer',
        () => {
            stopServer();
        }
    );

    // Monitor text changes
    const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        // If the change was not made by the extension, potentially warn
        if (lastEditedUri && event.document.uri.toString() === lastEditedUri.toString()) {
            const currentText = event.document.getText();
            
            // If text differs from what the extension expected
            if (lastEditedText && currentText !== lastEditedText) {
                console.log('[Move Abs Elems] Document changed outside of extension');
                // This information could be used to warn on the next Undo/Redo
            }
            
            // Update for the next change
            lastEditedText = currentText;
        }
    });

    context.subscriptions.push(startCommand, stopCommand, changeDisposable);

    // startServer();
    vscode.commands.executeCommand('quarto-mov-abs-elems.startServer');
}

function startServer() {
    if (server) {
        vscode.window.showInformationMessage('Server is already running');
        return;
    }

    const app = express();
    app.use(cors());
    app.use(express.json());

    app.post('/update-position', async (req: Request, res: Response) => {
        try {
            const { fileName, mdIndex, top, left, currentTop, currentLeft, currentBottom, currentRight, classList } = req.body;

            if (!fileName || mdIndex === undefined || top === undefined || left === undefined) {
                res.status(400).json({ error: 'Missing required parameters' });
                return;
            }

            console.log(`[Move Abs Elems] Received request for file: ${fileName}`);
            console.log(`[Move Abs Elems] MD index: ${mdIndex}, new position: top=${top}%, left=${left}%`);
            console.log(`[Move Abs Elems] Current values: top=${currentTop}, left=${currentLeft}, bottom=${currentBottom}, right=${currentRight}`);
            console.log(`[Move Abs Elems] Element classes:`, classList);

            const baseName = fileName.replace(/\.(qmd|md)$/, '');
            
            console.log(`[Move Abs Elems] Searching for: **/${baseName}.qmd`);
            let files = await vscode.workspace.findFiles(`**/${baseName}.qmd`, '**/node_modules/**');
            console.log(`[Move Abs Elems] Found .qmd files:`, files.map(f => f.fsPath));
            
            if (files.length === 0) {
                console.log(`[Move Abs Elems] Searching for: **/${baseName}.md`);
                files = await vscode.workspace.findFiles(`**/${baseName}.md`, '**/node_modules/**');
                console.log(`[Move Abs Elems] Found .md files:`, files.map(f => f.fsPath));
            }
            
            if (files.length === 0) {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const workspaceInfo = workspaceFolders 
                    ? workspaceFolders.map(f => f.uri.fsPath).join(', ')
                    : 'No workspace open';
                
                const errorMsg = `File not found: ${baseName}.qmd or ${baseName}.md. Workspace: ${workspaceInfo}`;
                console.error(`[Move Abs Elems] ${errorMsg}`);
                res.status(404).json({ error: errorMsg });
                return;
            }

            let targetFile = files[0];
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && files.some(f => f.fsPath === activeEditor.document.uri.fsPath)) {
                targetFile = activeEditor.document.uri;
            }

            console.log(`[Move Abs Elems] Using file: ${targetFile.fsPath}`);

            const document = await vscode.workspace.openTextDocument(targetFile);
            const text = document.getText();
            
            const mdMapping = createMdMapping(text);
            console.log(`[Move Abs Elems] MD mapping:`, mdMapping);

            const updated = updateAbsolutePositionByMapping(
                text, 
                mdIndex, 
                mdMapping, 
                top, 
                left, 
                currentTop, 
                currentLeft,
                currentBottom,
                currentRight,
                classList
            );

            if (updated === null) {
                res.status(404).json({ error: 'Element not found' });
                return;
            }

            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(text.length)
            );
            edit.replace(targetFile, fullRange, updated);

            const success = await vscode.workspace.applyEdit(edit);

            if (success) {
                // Record the edited text
                const updatedDocument = await vscode.workspace.openTextDocument(targetFile);
                lastEditedText = updatedDocument.getText();
                lastEditedUri = targetFile;
                
                res.json({ success: true, message: 'Position updated (not saved)' });
                vscode.window.showInformationMessage(
                    `Updated position for MD element ${mdIndex}: top=${top}%, left=${left}% (not saved)`
                );
            } else {
                res.status(500).json({ error: 'Failed to apply edit' });
            }
        } catch (error) {
            console.error('Error updating position:', error);
            res.status(500).json({ error: String(error) });
        }
    });

    app.post('/update-size', async (req: Request, res: Response) => {
        try {
            const { fileName, mdIndex, top, left, width, height, currentTop, currentLeft, currentWidth, currentHeight, currentBottom, currentRight, classList } = req.body;

            if (!fileName || mdIndex === undefined || top === undefined || left === undefined || width === undefined || height === undefined) {
                res.status(400).json({ error: 'Missing required parameters' });
                return;
            }

            console.log(`[Drag Size] Received request for file: ${fileName}`);
            console.log(`[Drag Size] MD index: ${mdIndex}, new size: width=${width}%, height=${height}%`);
            console.log(`[Drag Size] New position: top=${top}%, left=${left}%`);
            console.log(`[Drag Size] Current values: top=${currentTop}, left=${currentLeft}, width=${currentWidth}, height=${currentHeight}, bottom=${currentBottom}, right=${currentRight}`);
            console.log(`[Drag Size] Element classes:`, classList);

            const baseName = fileName.replace(/\.(qmd|md)$/, '');
            
            console.log(`[Drag Size] Searching for: **/${baseName}.qmd`);
            let files = await vscode.workspace.findFiles(`**/${baseName}.qmd`, '**/node_modules/**');
            console.log(`[Drag Size] Found .qmd files:`, files.map(f => f.fsPath));
            
            if (files.length === 0) {
                console.log(`[Drag Size] Searching for: **/${baseName}.md`);
                files = await vscode.workspace.findFiles(`**/${baseName}.md`, '**/node_modules/**');
                console.log(`[Drag Size] Found .md files:`, files.map(f => f.fsPath));
            }
            
            if (files.length === 0) {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const workspaceInfo = workspaceFolders 
                    ? workspaceFolders.map(f => f.uri.fsPath).join(', ')
                    : 'No workspace open';
                
                const errorMsg = `File not found: ${baseName}.qmd or ${baseName}.md. Workspace: ${workspaceInfo}`;
                console.error(`[Drag Size] ${errorMsg}`);
                res.status(404).json({ error: errorMsg });
                return;
            }

            let targetFile = files[0];
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && files.some(f => f.fsPath === activeEditor.document.uri.fsPath)) {
                targetFile = activeEditor.document.uri;
            }

            console.log(`[Drag Size] Using file: ${targetFile.fsPath}`);

            const document = await vscode.workspace.openTextDocument(targetFile);
            const text = document.getText();
            
            const mdMapping = createMdMapping(text);
            console.log(`[Drag Size] MD mapping:`, mdMapping);

            const updated = updateAbsoluteSizeByMapping(
                text, 
                mdIndex, 
                mdMapping, 
                top, 
                left,
                width,
                height,
                currentTop, 
                currentLeft,
                currentWidth,
                currentHeight,
                currentBottom,
                currentRight,
                classList
            );

            if (updated === null) {
                res.status(404).json({ error: 'Element not found' });
                return;
            }

            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(text.length)
            );
            edit.replace(targetFile, fullRange, updated);

            const success = await vscode.workspace.applyEdit(edit);

            if (success) {
                // Record the edited text
                const updatedDocument = await vscode.workspace.openTextDocument(targetFile);
                lastEditedText = updatedDocument.getText();
                lastEditedUri = targetFile;
                
                res.json({ success: true, message: 'Size updated (not saved)' });
                vscode.window.showInformationMessage(
                    `Updated size for MD element ${mdIndex}: ${width}% × ${height}% (not saved)`
                );
            } else {
                res.status(500).json({ error: 'Failed to apply edit' });
            }
        } catch (error) {
            console.error('Error updating size:', error);
            res.status(500).json({ error: String(error) });
        }
    });

    app.post('/undo', async (req: Request, res: Response) => {
        try {
            const { fileName } = req.body;
            console.log('[Move Abs Elems] Undo requested for file:', fileName);
            
            if (!fileName) {
                res.status(400).json({ error: 'Missing fileName parameter' });
                return;
            }
            
            // Remember the currently active editor (might be a WebView)
            const previousActiveEditor = vscode.window.activeTextEditor;
            
            // Find the file
            const baseName = fileName.replace(/\.(qmd|md)$/, '');
            let files = await vscode.workspace.findFiles(`**/${baseName}.qmd`, '**/node_modules/**');
            
            if (files.length === 0) {
                files = await vscode.workspace.findFiles(`**/${baseName}.md`, '**/node_modules/**');
            }
            
            if (files.length === 0) {
                res.status(404).json({ error: 'File not found' });
                return;
            }
            
            const targetUri = files[0];
            
            // First, look for an already open editor
            let editor = vscode.window.visibleTextEditors.find(
                e => e.document.uri.toString() === targetUri.toString()
            );
            
            if (editor) {
                // If already open, make it active
                console.log('[Move Abs Elems] Found existing editor, making it active');
                await vscode.window.showTextDocument(editor.document, {
                    viewColumn: editor.viewColumn,
                    preserveFocus: false
                });
            } else {
                // If not open, open a new editor
                console.log('[Move Abs Elems] Opening new editor');
                editor = await vscode.window.showTextDocument(targetUri, {
                    preview: false,
                    viewColumn: vscode.ViewColumn.Active
                });
            }
            
            if (!editor) {
                res.status(500).json({ error: 'Failed to open document' });
                return;
            }
            
            // Execute Undo
            await vscode.commands.executeCommand('undo');

            // Return focus to preview
            await vscode.commands.executeCommand('workbench.action.navigateBack');
            
            console.log('[Move Abs Elems] Undo executed successfully');
            
            // Attempt to restore previous editor
            if (previousActiveEditor && previousActiveEditor.document.uri.toString() !== targetUri.toString()) {
                console.log('[Move Abs Elems] Attempting to restore previous active editor');
                try {
                    await vscode.window.showTextDocument(previousActiveEditor.document, {
                        viewColumn: previousActiveEditor.viewColumn,
                        preserveFocus: false
                    });
                } catch (error) {
                    console.log('[Move Abs Elems] Could not restore previous editor:', error);
                }
            }
            
            res.json({ success: true, message: 'Undo executed' });
        } catch (error) {
            console.error('Error during undo:', error);
            res.status(500).json({ error: String(error) });
        }
    });

    app.post('/redo', async (req: Request, res: Response) => {
        try {
            const { fileName } = req.body;
            console.log('[Move Abs Elems] Redo requested for file:', fileName);
            
            if (!fileName) {
                res.status(400).json({ error: 'Missing fileName parameter' });
                return;
            }
            
            // Remember the currently active editor
            const previousActiveEditor = vscode.window.activeTextEditor;
            
            // Find the file
            const baseName = fileName.replace(/\.(qmd|md)$/, '');
            let files = await vscode.workspace.findFiles(`**/${baseName}.qmd`, '**/node_modules/**');
            
            if (files.length === 0) {
                files = await vscode.workspace.findFiles(`**/${baseName}.md`, '**/node_modules/**');
            }
            
            if (files.length === 0) {
                res.status(404).json({ error: 'File not found' });
                return;
            }
            
            const targetUri = files[0];
            
            // First, look for an already open editor
            let editor = vscode.window.visibleTextEditors.find(
                e => e.document.uri.toString() === targetUri.toString()
            );
            
            if (editor) {
                // If already open, make it active
                console.log('[Move Abs Elems] Found existing editor, making it active');
                await vscode.window.showTextDocument(editor.document, {
                    viewColumn: editor.viewColumn,
                    preserveFocus: false
                });
            } else {
                // If not open, open a new editor
                console.log('[Move Abs Elems] Opening new editor');
                editor = await vscode.window.showTextDocument(targetUri, {
                    preview: false,
                    viewColumn: vscode.ViewColumn.Active
                });
            }
            
            if (!editor) {
                res.status(500).json({ error: 'Failed to open document' });
                return;
            }
            
            // Execute Redo
            await vscode.commands.executeCommand('redo');

            // Return focus to preview
            await vscode.commands.executeCommand('workbench.action.navigateBack');
            
            console.log('[Move Abs Elems] Redo executed successfully');
            
            // Attempt to restore previous editor
            if (previousActiveEditor && previousActiveEditor.document.uri.toString() !== targetUri.toString()) {
                console.log('[Move Abs Elems] Attempting to restore previous active editor');
                try {
                    await vscode.window.showTextDocument(previousActiveEditor.document, {
                        viewColumn: previousActiveEditor.viewColumn,
                        preserveFocus: false
                    });
                } catch (error) {
                    console.log('[Move Abs Elems] Could not restore previous editor:', error);
                }
            }
            
            res.json({ success: true, message: 'Redo executed' });
        } catch (error) {
            console.error('Error during redo:', error);
            res.status(500).json({ error: String(error) });
        }
    });

    app.get('/health', (req: Request, res: Response) => {
        res.json({ status: 'ok' });
    });

    server = app.listen(PORT, () => {
        vscode.window.showInformationMessage(
            `Quarto Move Abs Elems server started on port ${PORT}`
        );
        console.log(`Server listening on http://localhost:${PORT}`);
    });
}

function stopServer() {
    if (server) {
        server.close(() => {
            vscode.window.showInformationMessage('Server stopped');
            server = null;
        });
    } else {
        vscode.window.showInformationMessage('Server is not running');
    }
}

function createMdMapping(text: string): Array<{mdOrder: number, lineNumber: number, line: string}> {
    const lines = text.split('\n');
    const mapping: Array<{mdOrder: number, lineNumber: number, line: string}> = [];
    let mdOrder = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.includes('.absolute') && line.includes('{')) {
            mapping.push({
                mdOrder: mdOrder,
                lineNumber: i,
                line: line.trim()
            });
            mdOrder++;
        }
    }
    
    return mapping;
}

function updateAbsolutePositionByMapping(
    text: string,
    luaMdIndex: number,
    mdMapping: Array<{mdOrder: number, lineNumber: number, line: string}>,
    top: number,
    left: number,
    currentTop: string | null,
    currentLeft: string | null,
    currentBottom: string | null,
    currentRight: string | null,
    classList: string[]
): string | null {
    console.log(`[Move Abs Elems] Looking for Lua MD Index: ${luaMdIndex}`);
    console.log(`[Move Abs Elems] Searching for: classes=${classList}`);
    console.log(`[Move Abs Elems] Position attributes: top=${currentTop}, left=${currentLeft}, bottom=${currentBottom}, right=${currentRight}`);
    
    let targetEntry = null;
    
    for (const entry of mdMapping) {
        const line = entry.line;
        
        // Check class name match
        let classMatch = true;
        if (classList && classList.length > 0) {
            classMatch = classList.every(cls => line.includes(`.${cls}`));
        }
        
        if (!classMatch) {
            continue;
        }
        
        // Check position attribute match
        // Check combinations of top/bottom/left/right
        let positionMatch = false;
        
        // Pattern 1: both top + left specified
        if (currentTop && currentLeft && line.includes(`top=${currentTop}%`) && line.includes(`left=${currentLeft}%`)) {
            positionMatch = true;
        }
        // Pattern 2: top + right
        else if (currentTop && currentRight && line.includes(`top=${currentTop}%`) && line.includes(`right=${currentRight}%`)) {
            positionMatch = true;
        }
        // Pattern 3: bottom + left
        else if (currentBottom && currentLeft && line.includes(`bottom=${currentBottom}%`) && line.includes(`left=${currentLeft}%`)) {
            positionMatch = true;
        }
        // Pattern 4: bottom + right
        else if (currentBottom && currentRight && line.includes(`bottom=${currentBottom}%`) && line.includes(`right=${currentRight}%`)) {
            positionMatch = true;
        }
        // Pattern 5: no position attributes at all (none of top/left/bottom/right exist)
        // or currentTop=0, currentLeft=0 (default values)
        else if ((!currentTop && !currentLeft && !currentBottom && !currentRight) || 
                 (currentTop === '0' && currentLeft === '0' && !currentBottom && !currentRight)) {
            // Check if the line also has no top/left/bottom/right
            const hasNoPosition = !line.match(/\b(top|left|bottom|right)=/) || 
                                  (line.includes('top=0%') && line.includes('left=0%'));
            if (hasNoPosition) {
                positionMatch = true;
                console.log(`[Move Abs Elems] Matched element with no position attributes (defaults to top=0, left=0)`);
            }
        }
        
        if (classMatch && positionMatch) {
            targetEntry = entry;
            console.log(`[Move Abs Elems] ✓ Found by exact match (class + position)`);
            break;
        }
    }
    
    if (!targetEntry) {
        console.log(`[Move Abs Elems] ✗ Element not found - exact match required`);
        console.log(`[Move Abs Elems] This likely means the file was edited. User should reload.`);
        
        // Debug: show candidates
        console.log(`[Move Abs Elems] Candidates with matching classes:`);
        for (const entry of mdMapping) {
            const line = entry.line;
            if (classList && classList.length > 0) {
                const classMatch = classList.every(cls => line.includes(`.${cls}`));
                if (classMatch) {
                    console.log(`[Move Abs Elems]   MD Order ${entry.mdOrder}: ${line}`);
                }
            }
        }
        
        return null;
    }
    
    console.log(`[Move Abs Elems] ✓ Found at MD Order ${targetEntry.mdOrder}, line ${targetEntry.lineNumber + 1}`);
    console.log(`[Move Abs Elems]   Line: ${targetEntry.line}`);
    
    const lines = text.split('\n');
    let updatedLine = lines[targetEntry.lineNumber];
    
    // Update existing position attributes or add new ones
    // Handle top/bottom
    if (updatedLine.match(/\btop=[-\d.]+%/)) {
        updatedLine = updatedLine.replace(/\btop=[-\d.]+%/, `top=${top}%`);
    } else if (updatedLine.match(/\bbottom=[-\d.]+%/)) {
        // If bottom exists, replace with top
        updatedLine = updatedLine.replace(/\bbottom=[-\d.]+%/, `top=${top}%`);
    } else {
        // If neither top/bottom exists, add before }
        updatedLine = updatedLine.replace(/}/, ` top=${top}%}`);
    }
    
    // Handle left/right
    if (updatedLine.match(/\bleft=[-\d.]+%/)) {
        updatedLine = updatedLine.replace(/\bleft=[-\d.]+%/, `left=${left}%`);
    } else if (updatedLine.match(/\bright=[-\d.]+%/)) {
        // If right exists, replace with left
        updatedLine = updatedLine.replace(/\bright=[-\d.]+%/, `left=${left}%`);
    } else {
        // If neither left/right exists, add before }
        updatedLine = updatedLine.replace(/}/, ` left=${left}%}`);
    }
    
    console.log(`[Move Abs Elems] Updated: ${updatedLine.trim()}`);
    lines[targetEntry.lineNumber] = updatedLine;
    return lines.join('\n');
}

function updateAbsoluteSizeByMapping(
    text: string,
    luaMdIndex: number,
    mdMapping: Array<{mdOrder: number, lineNumber: number, line: string}>,
    top: number,
    left: number,
    width: number,
    height: number,
    currentTop: string | null,
    currentLeft: string | null,
    currentWidth: string | null,
    currentHeight: string | null,
    currentBottom: string | null,
    currentRight: string | null,
    classList: string[]
): string | null {
    console.log(`[Drag Size] Looking for Lua MD Index: ${luaMdIndex}`);
    console.log(`[Drag Size] Searching for: classes=${classList}`);
    console.log(`[Drag Size] Current attributes: top=${currentTop}, left=${currentLeft}, width=${currentWidth}, height=${currentHeight}, bottom=${currentBottom}, right=${currentRight}`);
    
    let targetEntry = null;
    
    for (const entry of mdMapping) {
        const line = entry.line;
        
        // Check class name match
        let classMatch = true;
        if (classList && classList.length > 0) {
            classMatch = classList.every(cls => line.includes(`.${cls}`));
        }
        
        if (!classMatch) {
            continue;
        }
        
        // Check position/size attribute match
        let attributeMatch = false;
        
        // Position matching
        let positionMatch = false;
        if (currentTop && currentLeft && line.includes(`top=${currentTop}%`) && line.includes(`left=${currentLeft}%`)) {
            positionMatch = true;
        } else if (currentTop && currentRight && line.includes(`top=${currentTop}%`) && line.includes(`right=${currentRight}%`)) {
            positionMatch = true;
        } else if (currentBottom && currentLeft && line.includes(`bottom=${currentBottom}%`) && line.includes(`left=${currentLeft}%`)) {
            positionMatch = true;
        } else if (currentBottom && currentRight && line.includes(`bottom=${currentBottom}%`) && line.includes(`right=${currentRight}%`)) {
            positionMatch = true;
        } else if ((!currentTop && !currentLeft && !currentBottom && !currentRight) ||
                   (currentTop === '0' && currentLeft === '0' && !currentBottom && !currentRight)) {
            const hasNoPosition = !line.match(/\b(top|left|bottom|right)=/) || 
                                  (line.includes('top=0%') && line.includes('left=0%'));
            if (hasNoPosition) {
                positionMatch = true;
            }
        }
        
        // Size matching (optional)
        let sizeMatch = true;
        if (currentWidth) {
            sizeMatch = sizeMatch && line.includes(`width=${currentWidth}%`);
        }
        if (currentHeight) {
            sizeMatch = sizeMatch && line.includes(`height=${currentHeight}%`);
        }
        
        // OK if position matches (size may be added later)
        attributeMatch = positionMatch;
        
        if (classMatch && attributeMatch) {
            targetEntry = entry;
            console.log(`[Drag Size] ✓ Found by exact match (class + position)`);
            break;
        }
    }
    
    if (!targetEntry) {
        console.log(`[Drag Size] ✗ Element not found - exact match required`);
        return null;
    }
    
    console.log(`[Drag Size] ✓ Found at MD Order ${targetEntry.mdOrder}, line ${targetEntry.lineNumber + 1}`);
    console.log(`[Drag Size]   Line: ${targetEntry.line}`);
    
    const lines = text.split('\n');
    let updatedLine = lines[targetEntry.lineNumber];
    
    // Handle top/bottom
    if (updatedLine.match(/\btop=[-\d.]+%/)) {
        updatedLine = updatedLine.replace(/\btop=[-\d.]+%/, `top=${top}%`);
    } else if (updatedLine.match(/\bbottom=[-\d.]+%/)) {
        updatedLine = updatedLine.replace(/\bbottom=[-\d.]+%/, `top=${top}%`);
    } else {
        updatedLine = updatedLine.replace(/}/, ` top=${top}%}`);
    }
    
    // Handle left/right
    if (updatedLine.match(/\bleft=[-\d.]+%/)) {
        updatedLine = updatedLine.replace(/\bleft=[-\d.]+%/, `left=${left}%`);
    } else if (updatedLine.match(/\bright=[-\d.]+%/)) {
        updatedLine = updatedLine.replace(/\bright=[-\d.]+%/, `left=${left}%`);
    } else {
        updatedLine = updatedLine.replace(/}/, ` left=${left}%}`);
    }
    
    // Handle width
    if (updatedLine.match(/\bwidth=[-\d.]+%/)) {
        updatedLine = updatedLine.replace(/\bwidth=[-\d.]+%/, `width=${width}%`);
    } else {
        updatedLine = updatedLine.replace(/}/, ` width=${width}%}`);
    }
    
    // Handle height
    if (updatedLine.match(/\bheight=[-\d.]+%/)) {
        updatedLine = updatedLine.replace(/\bheight=[-\d.]+%/, `height=${height}%`);
    } else {
        updatedLine = updatedLine.replace(/}/, ` height=${height}%}`);
    }
    
    console.log(`[Drag Size] Updated: ${updatedLine.trim()}`);
    lines[targetEntry.lineNumber] = updatedLine;
    return lines.join('\n');
}

function getCurrentFileName() {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        // Get the URI of the currently edited file
        const documentUri = activeEditor.document.uri;

        // Full file path (e.g., /Users/username/project/file.txt)
        const fullPath = documentUri.fsPath;

        // File name only (e.g., file.txt)
        const fileName = require('path').basename(documentUri.fsPath);

        // Path representation from URI (e.g., /Users/username/project/file.txt on macOS/Linux)
        // On Windows may use slash separators, so fsPath is more reliable
        const pathFromUri = documentUri.path;

        console.log(`Full Path: ${fullPath}`);
        console.log(`File Name: ${fileName}`);
        console.log(`Path from URI: ${pathFromUri}`);

        return fileName;
    } else {
        // No active editor (e.g., focus is on Explorer, etc.)
        console.log(`No file is currently open`);
        return null;
    }
}

export function deactivate() {
    stopServer();
}