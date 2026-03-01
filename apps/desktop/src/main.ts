/**
 * Electron Main Process
 * Handles window management, file system operations, and IPC communication
 * Multi-window architecture: Welcome windows + Document windows
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

// Window type definition
type WindowType = 'welcome' | 'document';

// Window state interface for multi-window management
interface WindowState {
  window: BrowserWindow;
  type: WindowType;
  id: number;
  // Document-specific state
  currentEngine: SyncEngine | null;
  fileWatcher: FSWatcher | null;
  folderWatcher: FSWatcher | null;
  // Window-specific data
  watchedFolder: string | null;
  openFilePath: string | null;
}

// Global state
const windowMap = new Map<number, WindowState>();
let nextWindowId = 1;
const fsAdapter = createNodeFsAdapter();

// Get window state by window id
function getWindowState(windowId: number): WindowState | undefined {
  return windowMap.get(windowId);
}

// Get window state by BrowserWindow instance
function getWindowStateByWindow(window: BrowserWindow): WindowState | undefined {
  for (const state of windowMap.values()) {
    if (state.window === window) {
      return state;
    }
  }
  return undefined;
}

// Send window info to renderer
function sendWindowInfo(windowState: WindowState): void {
  windowState.window.webContents.send('window:info', {
    windowId: windowState.id,
    windowType: windowState.type,
    openFilePath: windowState.openFilePath,
    watchedFolder: windowState.watchedFolder,
  });
}

/**
 * Create a new window
 * @param type - Window type: 'welcome' or 'document'
 * @param filePath - Optional file path to open (for document windows)
 * @param folderPath - Optional folder path to watch (for document windows)
 * @returns The created window state
 */
function createWindow(type: WindowType = 'welcome', filePath?: string, folderPath?: string): WindowState {
  const windowId = nextWindowId++;
  
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Pass window info to renderer via additionalArguments
      additionalArguments: [`--window-id=${windowId}`, `--window-type=${type}`],
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    show: false, // Don't show until ready
  });

  // Create window state
  const windowState: WindowState = {
    window,
    type,
    id: windowId,
    currentEngine: null,
    fileWatcher: null,
    folderWatcher: null,
    watchedFolder: folderPath || null,
    openFilePath: filePath || null,
  };

  // Store in window map
  windowMap.set(windowId, windowState);

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    window.loadURL('http://localhost:5173');
    window.webContents.openDevTools();
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Show window when ready
  window.once('ready-to-show', () => {
    window.show();
    // Send window info to renderer
    sendWindowInfo(windowState);
  });

  // Handle window closed
  window.on('closed', () => {
    // Cleanup window state
    cleanupWindow(windowId);
    windowMap.delete(windowId);
  });

  return windowState;
}

/**
 * Cleanup window resources
 */
function cleanupWindow(windowId: number): void {
  const state = windowMap.get(windowId);
  if (!state) return;

  // Cleanup engine
  if (state.currentEngine) {
    state.currentEngine.destroy();
    state.currentEngine = null;
  }

  // Cleanup file watcher
  if (state.fileWatcher) {
    state.fileWatcher.close();
    state.fileWatcher = null;
  }

  // Cleanup folder watcher
  if (state.folderWatcher) {
    state.folderWatcher.close();
    state.folderWatcher = null;
  }
}

/**
 * Get the focused window state
 */
function getFocusedWindowState(): WindowState | undefined {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (!focusedWindow) return undefined;
  return getWindowStateByWindow(focusedWindow);
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
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => createWindow('welcome'),
        },
        {
          label: 'New Document',
          accelerator: 'CmdOrCtrl+N',
          click: async () => {
            // Always create a new window for new document
            const { filePath } = await dialog.showSaveDialog({
              title: 'Create New Document',
              defaultPath: 'Untitled.mdx',
              filters: [{ name: 'MarkdownX', extensions: ['mdx'] }],
              properties: ['createDirectory'],
            });

            if (filePath) {
              // Create document first
              await createMarkdownXDocument(filePath, fsAdapter);
              // Then open in new window
              await openDocumentInNewWindow(filePath, true);
            }
          },
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            // Always create a new window for opening
            const result = await dialog.showOpenDialog({
              title: 'Open Document or Folder',
              filters: [{ name: 'MarkdownX', extensions: ['mdx'] }],
              properties: ['openFile', 'openDirectory'],
            });

            if (!result.canceled && result.filePaths.length > 0) {
              const selectedPath = result.filePaths[0];
              const stats = await fs.stat(selectedPath);

              if (stats.isFile()) {
                // Open single file in new window
                const parentDir = dirname(selectedPath);
                await openDocumentInNewWindow(parentDir);
              } else if (stats.isDirectory() && await isMarkdownXDocument(selectedPath, fsAdapter)) {
                // Open .mdx folder directly in new window
                await openDocumentInNewWindow(selectedPath);
              } else {
                // Open folder in new window
                await openFolderInNewWindow(selectedPath);
              }
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            const state = getFocusedWindowState();
            if (state) {
              handleSave(state);
            }
          },
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
 * @param windowState - The window state to create document in
 * @param parentPath - Optional parent directory path for folder mode creation
 * @param suggestedName - Optional suggested file name
 * @returns The path of the newly created document, or null if canceled
 */
async function handleNewDocument(windowState: WindowState, parentPath?: string, suggestedName?: string): Promise<string | null> {
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

    return filePath;
  }
  
  // Single file mode - show save dialog
  const { filePath } = await dialog.showSaveDialog(windowState.window, {
    title: 'Create New Document',
    defaultPath: 'Untitled.mdx',
    filters: [{ name: 'MarkdownX', extensions: ['mdx'] }],
    properties: ['createDirectory'],
  });

  if (filePath) {
    // Always load in current window (welcome page actions open in same window)
    // Menu actions (New Window) will create new windows separately
    // Stop folder watcher when creating new file (switch to file mode)
    if (windowState.folderWatcher) {
      await windowState.folderWatcher.close();
      windowState.folderWatcher = null;
    }
    
    await loadDocumentInWindow(windowState, filePath, true);
    
    // Send file:opened event to update sidebar in single file mode
    windowState.window.webContents.send('file:opened', {
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
async function setupFolderWatcher(windowState: WindowState, folderPath: string): Promise<void> {
  // Clear previous watcher
  if (windowState.folderWatcher) {
    await windowState.folderWatcher.close();
    windowState.folderWatcher = null;
  }

  // Pending unlinks for rename detection
  const pendingUnlinks = new Map<string, Array<{ path: string; name: string; timeout: NodeJS.Timeout }>>();
  const RENAME_DETECTION_DELAY = 200;

  // Use chokidar to watch directory changes with deep nesting support
  windowState.folderWatcher = watch(folderPath, {
    ignoreInitial: true,
    depth: 99,
    ignored: [
      '**/node_modules/**',
      '**/.*/**',
      '**/.*',
    ],
  });

  windowState.folderWatcher.on('addDir', async (path: string) => {
    console.log('[watcher] addDir:', path);
    if (path === folderPath) return;

    const parentDir = dirname(path);
    const name = basename(path);

    const parentPending = pendingUnlinks.get(parentDir);
    if (parentPending && parentPending.length > 0) {
      const pending = parentPending.shift()!;
      clearTimeout(pending.timeout);
      
      if (parentPending.length === 0) {
        pendingUnlinks.delete(parentDir);
      }
      
      console.log('[watcher] Detected RENAME:', pending.path, '->', path);
      windowState.window.webContents.send('folder:children-changed', {
        parentPath: parentDir,
        type: 'rename',
        oldPath: pending.path,
        newPath: path,
        name: name,
      });
      return;
    }

    const isMdxDoc = await isMarkdownXDocument(path, fsAdapter);
    console.log('[watcher] addDir sending add event:', { parentDir, name, isMdxDoc });

    windowState.window.webContents.send('folder:children-changed', {
      parentPath: parentDir,
      type: 'add',
      item: {
        name: name,
        path,
        type: isMdxDoc ? 'file' : 'folder',
        children: undefined,
      },
    });
  });

  windowState.folderWatcher.on('unlinkDir', (path: string) => {
    console.log('[watcher] unlinkDir:', path);
    const parentDir = dirname(path);
    const name = basename(path);
    
    const timeout = setTimeout(() => {
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
      windowState.window.webContents.send('folder:children-changed', {
        parentPath: parentDir,
        type: 'remove',
        path,
      });
    }, RENAME_DETECTION_DELAY);

    if (!pendingUnlinks.has(parentDir)) {
      pendingUnlinks.set(parentDir, []);
    }
    pendingUnlinks.get(parentDir)!.push({ path, name, timeout });
  });

  windowState.folderWatcher.on('rename', (oldPath: string, newPath: string) => {
    console.log('[watcher] rename event:', oldPath, '->', newPath);
    const parentDir = dirname(newPath);
    windowState.window.webContents.send('folder:children-changed', {
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
async function openFolderInWindow(windowState: WindowState, folderPath: string): Promise<void> {
  // Update window state
  windowState.watchedFolder = folderPath;
  windowState.type = 'document';
  
  // Scan current directory for mdx files (non-recursive)
  const files = await scanCurrentDir(folderPath);
  
  // Send file list to renderer
  windowState.window.webContents.send('folder:opened', {
    files,
    folderPath,
  });
  
  // Send updated window info
  sendWindowInfo(windowState);
  
  // Setup file system watcher
  await setupFolderWatcher(windowState, folderPath);
}

/**
 * Handle opening an existing document or folder
 */
async function handleOpenDocument(windowState: WindowState): Promise<void> {
  const result = await dialog.showOpenDialog(windowState.window, {
    title: 'Open Document or Folder',
    filters: [{ name: 'MarkdownX', extensions: ['mdx'] }],
    properties: ['openFile', 'openDirectory'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    const stats = await fs.stat(selectedPath);
    
    // Always open in current window (welcome page actions open in same window)
    // Menu actions (New Window) will create new windows separately
    if (stats.isFile()) {
      // Mode A: Open single file
      if (windowState.folderWatcher) {
        await windowState.folderWatcher.close();
        windowState.folderWatcher = null;
      }

      const parentDir = dirname(selectedPath);
      await loadDocumentInWindow(windowState, parentDir);
      
      // Send file:opened event with the .mdx folder path (not parent dir)
      windowState.window.webContents.send('file:opened', {
        path: parentDir,
        name: basename(parentDir),
      });
    } else if (stats.isDirectory() && await isMarkdownXDocument(selectedPath, fsAdapter)) {
      // Mode C: Open .mdx folder directly
      if (windowState.folderWatcher) {
        await windowState.folderWatcher.close();
        windowState.folderWatcher = null;
      }

      await loadDocumentInWindow(windowState, selectedPath);
      
      windowState.window.webContents.send('file:opened', {
        path: selectedPath,
        name: basename(selectedPath),
      });
    } else {
      // Mode B: Open folder
      if (windowState.currentEngine) {
        windowState.currentEngine.destroy();
        windowState.currentEngine = null;
      }
      if (windowState.fileWatcher) {
        await windowState.fileWatcher.close();
        windowState.fileWatcher = null;
      }
      
      await openFolderInWindow(windowState, selectedPath);
    }
  }
}

/**
 * Handle save command
 */
async function handleSave(windowState: WindowState): Promise<void> {
  if (windowState.currentEngine) {
    await windowState.currentEngine.forceSave();
    windowState.window.webContents.send('document:saved');
  }
}

/**
 * Load a document in a specific window
 */
async function loadDocumentInWindow(windowState: WindowState, path: string, isNew = false): Promise<void> {
  // Cleanup previous engine
  if (windowState.currentEngine) {
    windowState.currentEngine.destroy();
    windowState.currentEngine = null;
  }

  // Stop previous watcher
  if (windowState.fileWatcher) {
    await windowState.fileWatcher.close();
    windowState.fileWatcher = null;
  }

  // Create or load document
  if (isNew) {
    windowState.currentEngine = await createMarkdownXDocument(path, fsAdapter);
  } else {
    const isValid = await isMarkdownXDocument(path, fsAdapter);
    if (!isValid) {
      dialog.showErrorBox('Invalid Document', 'The selected folder is not a valid MarkdownX document.');
      return;
    }

    windowState.currentEngine = createSyncEngine({
      basePath: path,
      fsAdapter,
      onExternalChange: (content) => {
        windowState.window.webContents.send('document:external-change', content);
      },
    });

    await windowState.currentEngine.load();
  }

  // Update window state
  windowState.openFilePath = path;
  windowState.type = 'document';

  // Setup file watcher for external changes
  windowState.fileWatcher = watch(join(path, 'index.md'), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  });

  windowState.fileWatcher.on('change', async () => {
    if (windowState.currentEngine) {
      await windowState.currentEngine.handleExternalIndexChange();
    }
  });

  // Send to renderer
  windowState.window.webContents.send('document:loaded', {
    content: windowState.currentEngine.getContent(),
    manifest: windowState.currentEngine.getManifest(),
    basePath: path,
  });

  // Send updated window info
  sendWindowInfo(windowState);

  // Update window title
  const docName = path.split('/').pop() || 'Untitled';
  windowState.window.setTitle(`${docName} - MarkdownX`);
}

/**
 * Open a document in a new window
 */
async function openDocumentInNewWindow(filePath: string, isNew = false): Promise<WindowState> {
  const newWindow = createWindow('document', filePath);

  // Wait for window to be ready then load document
  newWindow.window.once('ready-to-show', async () => {
    await loadDocumentInWindow(newWindow, filePath, isNew);

    // Send file:opened event to update sidebar (single file mode)
    newWindow.window.webContents.send('file:opened', {
      path: filePath,
      name: basename(filePath),
    });
  });

  return newWindow;
}

/**
 * Open a folder in a new window
 */
async function openFolderInNewWindow(folderPath: string): Promise<WindowState> {
  const newWindow = createWindow('document', undefined, folderPath);
  
  // Wait for window to be ready then open folder
  newWindow.window.once('ready-to-show', async () => {
    await openFolderInWindow(newWindow, folderPath);
  });
  
  return newWindow;
}

/**
 * Setup IPC handlers for file system operations
 */
function setupIpcHandlers(): void {
  // Helper to get window state from event
  const getStateFromEvent = (event: Electron.IpcMainInvokeEvent): WindowState | undefined => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return undefined;
    return getWindowStateByWindow(window);
  };

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
  ipcMain.handle('document:new', async (event, parentPath?: string, suggestedName?: string) => {
    const state = getStateFromEvent(event);
    if (!state) return null;
    const newPath = await handleNewDocument(state, parentPath, suggestedName);
    return newPath;
  });

  ipcMain.handle('document:open', async (event) => {
    const state = getStateFromEvent(event);
    if (!state) return false;
    await handleOpenDocument(state);
    return true;
  });

  ipcMain.handle('document:load', async (event, filePath: string) => {
    const state = getStateFromEvent(event);
    if (!state) return false;
    await loadDocumentInWindow(state, filePath);
    return true;
  });

  ipcMain.handle('document:save', async (event, content: string) => {
    const state = getStateFromEvent(event);
    if (!state || !state.currentEngine) return false;
    await state.currentEngine.applyChange(content);
    await state.currentEngine.forceSave();
    return true;
  });

  ipcMain.handle('document:get-content', async (event) => {
    const state = getStateFromEvent(event);
    return state?.currentEngine?.getContent() ?? '';
  });

  // Image upload
  ipcMain.handle('document:upload-image', async (event, data: number[], fileName: string) => {
    const state = getStateFromEvent(event);
    if (!state || !state.currentEngine) {
      throw new Error('No document loaded');
    }

    const uint8Array = new Uint8Array(data);
    const assetInfo = await processImage(
      uint8Array,
      fileName,
      state.currentEngine.getAssetsDir(),
      fsAdapter
    );

    return assetInfo.relativePath;
  });

  ipcMain.handle('document:close', async (event) => {
    const state = getStateFromEvent(event);
    if (!state) return;
    
    if (state.currentEngine) {
      state.currentEngine.destroy();
      state.currentEngine = null;
    }
    if (state.fileWatcher) {
      await state.fileWatcher.close();
      state.fileWatcher = null;
    }
  });

  // Window operations
  ipcMain.handle('window:get-info', async (event) => {
    const state = getStateFromEvent(event);
    if (!state) return null;
    return {
      windowId: state.id,
      windowType: state.type,
      openFilePath: state.openFilePath,
      watchedFolder: state.watchedFolder,
    };
  });

  ipcMain.handle('window:open-document', async (_, filePath: string) => {
    await openDocumentInNewWindow(filePath);
    return true;
  });

  ipcMain.handle('window:open-folder', async (_, folderPath: string) => {
    await openFolderInNewWindow(folderPath);
    return true;
  });

  // Shell operations
  ipcMain.handle('shell:open-path', async (_, path: string) => {
    return shell.openPath(path);
  });

  // Dialog operations
  ipcMain.handle('dialog:show-confirm', async (event, message: string) => {
    const state = getStateFromEvent(event);
    if (!state) return false;
    
    const result = await dialog.showMessageBox(state.window, {
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

  ipcMain.handle('folder:load-children', async (_, folderPath: string) => {
    return scanCurrentDir(folderPath);
  });
}

// App lifecycle
app.whenReady().then(() => {
  setupIpcHandlers();
  setupMenu();
  createWindow('welcome');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow('welcome');
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Cleanup all windows
  for (const [windowId, state] of windowMap) {
    cleanupWindow(windowId);
  }
  windowMap.clear();
});
