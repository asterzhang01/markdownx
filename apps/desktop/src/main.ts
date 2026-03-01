/**
 * Electron Main Process
 * Handles window management, file system operations, and IPC communication
 */
import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { rm } from 'fs/promises';
import { join, dirname, basename } from 'path';
import * as fs from 'fs/promises';
import { watch, type FSWatcher } from 'chokidar';
import {
  createNodeFsAdapter,
  createSyncEngine,
  isMarkdownXDocument,
  createMarkdownXDocument,
  processImage,
  type SyncEngine,
} from '@markdownx/core';

// File tree item type for sidebar
interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileItem[];
}

// State
let mainWindow: BrowserWindow | null = null;
let currentEngine: SyncEngine | null = null;
let fileWatcher: FSWatcher | null = null;
let folderWatcher: FSWatcher | null = null;
const fsAdapter = createNodeFsAdapter();

/**
 * Create the main application window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
  });

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Setup application menu
 */
function setupMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Document',
          accelerator: 'CmdOrCtrl+N',
          click: () => handleNewDocument(),
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => handleOpenDocument(),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => handleSave(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/markdownx/markdownx'),
        },
      ],
    },
  ];

  // macOS app menu
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Handle creating a new document
 * @param parentPath - Optional parent directory path for folder mode creation
 * @param suggestedName - Optional suggested file name
 * @returns The path of the newly created document, or null if canceled
 */
async function handleNewDocument(parentPath?: string, suggestedName?: string): Promise<string | null> {
  // If parentPath is provided, we're in folder mode - create directly without dialog
  if (parentPath) {
    const fileName = suggestedName || 'Untitled.mdx';
    let filePath = join(parentPath, fileName);
    
    // Auto-number if file exists
    let counter = 1;
    const baseName = fileName.replace(/\.mdx$/, '');
    while (await fs.access(filePath).then(() => true).catch(() => false)) {
      filePath = join(parentPath, `${baseName} ${counter}.mdx`);
      counter++;
    }
    
    // Create the document
    await createMarkdownXDocument(filePath, fsAdapter);

    // Note: We don't send 'folder:children-changed' event here.
    // The watcher will detect the new directory and send the event automatically.
    // This avoids duplicate events being sent to the renderer.

    return filePath;
  }
  
  // Single file mode - show save dialog
  const { filePath } = await dialog.showSaveDialog(mainWindow!, {
    title: 'Create New Document',
    defaultPath: 'Untitled.mdx',
    filters: [{ name: 'MarkdownX', extensions: ['mdx'] }],
    properties: ['createDirectory'],
  });

  if (filePath) {
    // Stop folder watcher when creating new file (switch to file mode)
    if (folderWatcher) {
      await folderWatcher.close();
      folderWatcher = null;
    }
    
    await loadDocument(filePath, true);
    
    // Send file:opened event to update sidebar
    mainWindow?.webContents.send('file:opened', {
      path: filePath,
      name: basename(filePath),
    });
    
    return filePath;
  }
  return null;
}

/**
 * Recursively scan folder for mdx documents
 */
async function scanFolderForMdx(folderPath: string): Promise<FileItem[]> {
  async function scanRecursive(currentPath: string): Promise<FileItem[]> {
    const result: FileItem[] = [];
    
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          // Check if it's an mdx document folder (contains index.md and .mdx/state.bin)
          const isMdxDoc = await isMarkdownXDocument(fullPath, fsAdapter);
          if (isMdxDoc) {
            result.push({
              name: entry.name,
              path: fullPath,
              type: 'file',
            });
          } else {
            // Regular folder, recursively scan
            const children = await scanRecursive(fullPath);
            if (children.length > 0) {
              result.push({
                name: entry.name,
                path: fullPath,
                type: 'folder',
                children,
              });
            }
          }
        }
      }
    } catch (error) {
      // Skip folders we can't read (permission issues, etc.)
      console.warn(`Cannot read folder: ${currentPath}`, error);
    }
    
    return result;
  }
  
  return scanRecursive(folderPath);
}

/**
 * Scan current directory for mdx documents and subfolders (non-recursive, lazy loading)
 * - MDX documents are treated as 'file' type
 * - Regular subfolders are treated as 'folder' type with children=undefined (not loaded yet)
 */
async function scanCurrentDir(folderPath: string): Promise<FileItem[]> {
  const result: FileItem[] = [];
  
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(folderPath, entry.name);
      
      // Skip hidden files and directories
      if (entry.name.startsWith('.')) continue;
      
      if (entry.isDirectory()) {
        // Check if it's an mdx document folder
        const isMdxDoc = await isMarkdownXDocument(fullPath, fsAdapter);
        if (isMdxDoc) {
          // MDX document - treated as a file node
          result.push({
            name: entry.name,
            path: fullPath,
            type: 'file',
          });
        } else {
          // Regular subfolder - marked as not loaded yet
          result.push({
            name: entry.name,
            path: fullPath,
            type: 'folder',
            children: undefined, // Not loaded yet - lazy loading marker
          });
        }
      }
    }
  } catch (error) {
    console.warn(`Cannot read folder: ${folderPath}`, error);
  }
  
  // Sort: folders first, then files; alphabetical within each group
  return result.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'folder' ? -1 : 1;
  });
}

/**
 * Setup folder watcher for automatic refresh (supports multi-level)
 */
async function setupFolderWatcher(folderPath: string): Promise<void> {
  // Clear previous watcher
  if (folderWatcher) {
    await folderWatcher.close();
    folderWatcher = null;
  }

  // Pending unlinks for rename detection (macOS/Linux: unlinkDir + addDir pattern)
  // Key: parentDir, Value: list of pending unlinks in that directory
  const pendingUnlinks = new Map<string, Array<{ path: string; name: string; timeout: NodeJS.Timeout }>>();
  const RENAME_DETECTION_DELAY = 200; // ms, increased for reliability

  // Use chokidar to watch directory changes with deep nesting support
  folderWatcher = watch(folderPath, {
    ignoreInitial: true,
    depth: 99, // Support deep nesting for multi-level file tree
    ignored: [
      '**/node_modules/**',
      '**/.*/**', // Hidden directories
      '**/.*',    // Hidden files
    ],
  });

  folderWatcher.on('addDir', async (path) => {
    console.log('[watcher] addDir:', path);
    // Skip the root folder itself
    if (path === folderPath) return;

    const parentDir = dirname(path);
    const name = basename(path);

    // Check if there's a pending unlink in the same parent directory (rename detection)
    const parentPending = pendingUnlinks.get(parentDir);
    console.log('[watcher] addDir parentDir:', parentDir, 'hasPending:', !!(parentPending && parentPending.length > 0));
    if (parentPending && parentPending.length > 0) {
      // Take the first pending unlink (most likely to be the rename source)
      const pending = parentPending.shift()!;
      clearTimeout(pending.timeout);
      
      // Clean up empty array
      if (parentPending.length === 0) {
        pendingUnlinks.delete(parentDir);
      }
      
      console.log('[watcher] Detected RENAME:', pending.path, '->', path);
      mainWindow?.webContents.send('folder:children-changed', {
        parentPath: parentDir,
        type: 'rename',
        oldPath: pending.path,
        newPath: path,
        name: name,
      });
      return;
    }

    // Check if it's an mdx document
    const isMdxDoc = await isMarkdownXDocument(path, fsAdapter);
    console.log('[watcher] addDir sending add event:', { parentDir, name, isMdxDoc });

    // Notify renderer: children of parent directory changed
    mainWindow?.webContents.send('folder:children-changed', {
      parentPath: parentDir,
      type: 'add',
      item: {
        name: name,
        path,
        type: isMdxDoc ? 'file' : 'folder',
        children: isMdxDoc ? undefined : undefined,
      },
    });
  });

  folderWatcher.on('unlinkDir', (path) => {
    console.log('[watcher] unlinkDir:', path);
    const parentDir = dirname(path);
    const name = basename(path);
    
    console.log('[watcher] unlinkDir parentDir:', parentDir, 'name:', name);

    // Set a pending unlink - if an addDir happens soon in the same parent, it's a rename
    const timeout = setTimeout(() => {
      // No matching addDir, this is a real delete
      console.log('[watcher] unlinkDir timeout expired, sending remove:', path);
      const list = pendingUnlinks.get(parentDir);
      if (list) {
        const index = list.findIndex(p => p.path === path);
        if (index >= 0) {
          list.splice(index, 1);
          if (list.length === 0) {
            pendingUnlinks.delete(parentDir);
          }
        }
      }
      mainWindow?.webContents.send('folder:children-changed', {
        parentPath: parentDir,
        type: 'remove',
        path,
      });
    }, RENAME_DETECTION_DELAY);

    // Add to pending list for this parent directory
    if (!pendingUnlinks.has(parentDir)) {
      pendingUnlinks.set(parentDir, []);
    }
    pendingUnlinks.get(parentDir)!.push({ path, name, timeout });
  });

  // Handle rename events - chokidar emits 'rename' event on some platforms (Windows)
  folderWatcher.on('rename', (oldPath, newPath) => {
    console.log('[watcher] rename event:', oldPath, '->', newPath);
    const parentDir = dirname(newPath);
    mainWindow?.webContents.send('folder:children-changed', {
      parentPath: parentDir,
      type: 'rename',
      oldPath,
      newPath,
      name: basename(newPath),
    });
  });
}

/**
 * Open folder mode - scan and watch directory
 */
async function openFolder(folderPath: string): Promise<void> {
  // Scan current directory for mdx files (non-recursive)
  const files = await scanCurrentDir(folderPath);
  
  // Send file list to renderer
  mainWindow?.webContents.send('folder:opened', {
    files,
    folderPath,
  });
  
  // Setup file system watcher
  await setupFolderWatcher(folderPath);
}

/**
 * Handle opening an existing document or folder
 */
async function handleOpenDocument(): Promise<void> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Open Document or Folder',
    filters: [{ name: 'MarkdownX', extensions: ['mdx'] }],
    properties: ['openFile', 'openDirectory'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    const stats = await fs.stat(selectedPath);
    
    if (stats.isFile()) {
      // Mode A: Open single file (index.md inside .mdx folder)
      // Stop folder watcher when switching to file mode
      if (folderWatcher) {
        await folderWatcher.close();
        folderWatcher = null;
      }

      const parentDir = dirname(selectedPath);
      await loadDocument(parentDir);
      // Send single file info to renderer, don't scan entire directory
      mainWindow?.webContents.send('file:opened', {
        path: parentDir,
        name: basename(parentDir),
      });
    } else if (stats.isDirectory() && await isMarkdownXDocument(selectedPath, fsAdapter)) {
      // Mode C: Open .mdx folder directly (e.g., macOS bundle)
      // Stop folder watcher when switching to file mode
      if (folderWatcher) {
        await folderWatcher.close();
        folderWatcher = null;
      }

      await loadDocument(selectedPath);
      // Send single file info to renderer
      mainWindow?.webContents.send('file:opened', {
        path: selectedPath,
        name: basename(selectedPath),
      });
    } else {
      // Mode B: Open folder
      // Clean up current document when switching to folder mode
      if (currentEngine) {
        currentEngine.destroy();
        currentEngine = null;
      }
      if (fileWatcher) {
        await fileWatcher.close();
        fileWatcher = null;
      }
      
      await openFolder(selectedPath);
    }
  }
}

/**
 * Handle save command
 */
async function handleSave(): Promise<void> {
  if (currentEngine) {
    await currentEngine.forceSave();
    mainWindow?.webContents.send('document:saved');
  }
}

/**
 * Load a document (new or existing)
 */
async function loadDocument(path: string, isNew = false): Promise<void> {
  // Cleanup previous engine
  if (currentEngine) {
    currentEngine.destroy();
    currentEngine = null;
  }

  // Stop previous watcher
  if (fileWatcher) {
    await fileWatcher.close();
    fileWatcher = null;
  }

  // Create or load document
  if (isNew) {
    currentEngine = await createMarkdownXDocument(path, fsAdapter);
  } else {
    // Check if valid document
    const isValid = await isMarkdownXDocument(path, fsAdapter);
    if (!isValid) {
      dialog.showErrorBox('Invalid Document', 'The selected folder is not a valid MarkdownX document.');
      return;
    }

    currentEngine = createSyncEngine({
      basePath: path,
      fsAdapter,
      onExternalChange: (content) => {
        mainWindow?.webContents.send('document:external-change', content);
      },
    });

    await currentEngine.load();
  }

  // Setup file watcher for external changes
  fileWatcher = watch(join(path, 'index.md'), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  });

  fileWatcher.on('change', async () => {
    if (currentEngine) {
      await currentEngine.handleExternalIndexChange();
    }
  });

  // Send to renderer
  mainWindow?.webContents.send('document:loaded', {
    content: currentEngine.getContent(),
    manifest: currentEngine.getManifest(),
    basePath: path,
  });

  // Update window title
  const docName = path.split('/').pop() || 'Untitled';
  mainWindow?.setTitle(`${docName} - MarkdownX`);
}

/**
 * Setup IPC handlers for file system operations
 */
function setupIpcHandlers(): void {
  // File system operations
  ipcMain.handle('fs:readFile', async (_, path: string) => {
    const buffer = await fs.readFile(path);
    return buffer.buffer;
  });

  ipcMain.handle('fs:writeFile', async (_, path: string, data: number[]) => {
    await fs.writeFile(path, Buffer.from(data));
  });

  ipcMain.handle('fs:readTextFile', async (_, path: string) => {
    return fs.readFile(path, 'utf-8');
  });

  ipcMain.handle('fs:writeTextFile', async (_, path: string, content: string) => {
    await fs.writeFile(path, content, 'utf-8');
  });

  ipcMain.handle('fs:exists', async (_, path: string) => {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:mkdir', async (_, path: string) => {
    await fs.mkdir(path, { recursive: true });
  });

  ipcMain.handle('fs:readdir', async (_, path: string) => {
    return fs.readdir(path);
  });

  ipcMain.handle('fs:rename', async (_, oldPath: string, newPath: string) => {
    await fs.rename(oldPath, newPath);
  });

  ipcMain.handle('fs:unlink', async (_, path: string) => {
    await fs.unlink(path);
  });

  ipcMain.handle('fs:rm', async (_, path: string) => {
    await rm(path, { recursive: true, force: true });
  });

  ipcMain.handle('fs:stat', async (_, path: string) => {
    const stats = await fs.stat(path);
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtimeMs,
    };
  });

  // Document operations
  ipcMain.handle('document:new', async (_, parentPath?: string, suggestedName?: string) => {
    const newPath = await handleNewDocument(parentPath, suggestedName);
    return newPath;
  });

  ipcMain.handle('document:open', async () => {
    await handleOpenDocument();
    return true;
  });

  ipcMain.handle('document:load', async (_, filePath: string) => {
    await loadDocument(filePath);
    return true;
  });

  ipcMain.handle('document:save', async (_, content: string) => {
    if (currentEngine) {
      await currentEngine.applyChange(content);
      await currentEngine.forceSave();
      return true;
    }
    return false;
  });

  ipcMain.handle('document:get-content', async () => {
    return currentEngine?.getContent() ?? '';
  });

  // Image upload
  ipcMain.handle('document:upload-image', async (_, data: number[], fileName: string) => {
    if (!currentEngine) {
      throw new Error('No document loaded');
    }

    const uint8Array = new Uint8Array(data);
    const assetInfo = await processImage(
      uint8Array,
      fileName,
      currentEngine.getAssetsDir(),
      fsAdapter
    );

    return assetInfo.relativePath;
  });

  ipcMain.handle('document:close', async () => {
    // Cleanup current engine
    if (currentEngine) {
      currentEngine.destroy();
      currentEngine = null;
    }
    // Stop file watcher
    if (fileWatcher) {
      await fileWatcher.close();
      fileWatcher = null;
    }
  });

  // Shell operations
  ipcMain.handle('shell:open-path', async (_, path: string) => {
    return shell.openPath(path);
  });

  // Dialog operations
  ipcMain.handle('dialog:show-confirm', async (_, message: string) => {
    const result = await dialog.showMessageBox(mainWindow!, {
      type: 'question',
      buttons: ['取消', '确认'],
      defaultId: 1,
      cancelId: 0,
      message,
    });
    return result.response === 1;
  });

  // Folder operations
  ipcMain.handle('folder:scan', async (_, folderPath: string) => {
    return scanFolderForMdx(folderPath);
  });

  // Load children for a specific folder (lazy loading)
  ipcMain.handle('folder:load-children', async (_, folderPath: string) => {
    return scanCurrentDir(folderPath);
  });
}

// App lifecycle
app.whenReady().then(() => {
  setupIpcHandlers();
  setupMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (currentEngine) {
    currentEngine.destroy();
  }
  if (fileWatcher) {
    fileWatcher.close();
  }
  if (folderWatcher) {
    folderWatcher.close();
  }
});
