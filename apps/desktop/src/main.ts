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
 * @returns The path of the newly created document, or null if canceled
 */
async function handleNewDocument(): Promise<string | null> {
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
 * Load folder and send file tree to renderer
 */
async function loadFolder(folderPath: string): Promise<void> {
  const fileTree = await scanFolderForMdx(folderPath);
  
  // Send file tree to renderer
  mainWindow?.webContents.send('folder:loaded', {
    fileTree,
    folderPath,
  });
}

/**
 * Scan current directory for mdx documents (non-recursive)
 */
async function scanCurrentDir(folderPath: string): Promise<FileItem[]> {
  const result: FileItem[] = [];
  
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(folderPath, entry.name);
      
      if (entry.isDirectory()) {
        // Only check if it's an mdx document, don't recurse into subdirectories
        const isMdxDoc = await isMarkdownXDocument(fullPath, fsAdapter);
        if (isMdxDoc) {
          result.push({
            name: entry.name,
            path: fullPath,
            type: 'file',
          });
        }
      }
    }
  } catch (error) {
    console.warn(`Cannot read folder: ${folderPath}`, error);
  }
  
  return result;
}

/**
 * Setup folder watcher for automatic refresh
 */
async function setupFolderWatcher(folderPath: string): Promise<void> {
  // Clear previous watcher
  if (folderWatcher) {
    await folderWatcher.close();
    folderWatcher = null;
  }
  
  // Use chokidar to watch directory changes
  folderWatcher = watch(folderPath, {
    ignoreInitial: true,
    depth: 0, // Only watch current directory, don't recurse
  });
  
  folderWatcher.on('addDir', async (path) => {
    // New folder added, check if it's an mdx document
    const isMdxDoc = await isMarkdownXDocument(path, fsAdapter);
    if (isMdxDoc) {
      mainWindow?.webContents.send('folder:changed', {
        type: 'add',
        item: {
          name: basename(path),
          path,
          type: 'file',
        },
      });
    }
  });
  
  folderWatcher.on('unlinkDir', (path) => {
    // Folder removed
    mainWindow?.webContents.send('folder:changed', {
      type: 'remove',
      path,
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
      // Mode A: Open single file
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
  ipcMain.handle('document:new', async () => {
    const newPath = await handleNewDocument();
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
