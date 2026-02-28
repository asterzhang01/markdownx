/**
 * Electron Main Process
 * Handles window management, file system operations, and IPC communication
 */
import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { join } from 'path';
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

// State
let mainWindow: BrowserWindow | null = null;
let currentEngine: SyncEngine | null = null;
let fileWatcher: FSWatcher | null = null;
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
 */
async function handleNewDocument(): Promise<void> {
  const { filePath } = await dialog.showSaveDialog(mainWindow!, {
    title: 'Create New Document',
    defaultPath: 'Untitled.mdx',
    filters: [{ name: 'MarkdownX', extensions: ['mdx'] }],
    properties: ['createDirectory'],
  });

  if (filePath) {
    await loadDocument(filePath, true);
  }
}

/**
 * Handle opening an existing document
 */
async function handleOpenDocument(): Promise<void> {
  const { filePaths } = await dialog.showOpenDialog(mainWindow!, {
    title: 'Open Document',
    filters: [{ name: 'MarkdownX', extensions: ['mdx'] }],
    properties: ['openDirectory'],
  });

  if (filePaths.length > 0) {
    await loadDocument(filePaths[0]);
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
    await handleNewDocument();
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
});
