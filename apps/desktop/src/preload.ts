/**
 * Electron Preload Script
 * Exposes secure APIs to the renderer process via contextBridge
 */
import { contextBridge, ipcRenderer } from 'electron';

// File tree item type
interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileItem[];
}

// Types for exposed APIs
interface ElectronAPI {
  // File system operations
  fs: {
    readFile: (path: string) => Promise<ArrayBuffer>;
    writeFile: (path: string, data: number[]) => Promise<void>;
    readTextFile: (path: string) => Promise<string>;
    writeTextFile: (path: string, content: string) => Promise<void>;
    exists: (path: string) => Promise<boolean>;
    mkdir: (path: string) => Promise<void>;
    readdir: (path: string) => Promise<string[]>;
    rename: (oldPath: string, newPath: string) => Promise<void>;
    unlink: (path: string) => Promise<void>;
    stat: (path: string) => Promise<{
      isFile: boolean;
      isDirectory: boolean;
      size: number;
      mtime: number;
    }>;
    rm: (path: string) => Promise<void>;
  };

  // Folder operations
  folder: {
    scan: (path: string) => Promise<FileItem[]>;
    loadChildren: (path: string) => Promise<FileItem[]>;
  };

  // Shell operations
  shell: {
    openPath: (path: string) => Promise<string>;
  };

  // Document operations
  document: {
    new: (parentPath?: string, suggestedName?: string) => Promise<string | null>;
    open: () => Promise<boolean>;
    load: (path: string) => Promise<boolean>;
    save: (content: string) => Promise<boolean>;
    getContent: () => Promise<string>;
    uploadImage: (data: number[], fileName: string) => Promise<string>;
    close: () => Promise<void>;
  };

  // Dialog operations
  dialog: {
    showConfirm: (message: string) => Promise<boolean>;
  };

  // Event listeners
  onDocumentLoaded: (callback: (data: { content: string; manifest: unknown; basePath: string }) => void) => void;
  onDocumentSaved: (callback: () => void) => void;
  onExternalChange: (callback: (content: string) => void) => void;
  onFolderLoaded: (callback: (data: { fileTree: FileItem[]; folderPath: string }) => void) => void;
  onFileOpened: (callback: (data: { path: string; name: string }) => void) => void;
  onFolderOpened: (callback: (data: { files: FileItem[]; folderPath: string }) => void) => void;
  onFolderChanged: (callback: (change: { type: 'add' | 'remove'; item?: FileItem; path?: string }) => void) => void;
  onFolderChildrenChanged: (callback: (change: { parentPath: string; type: 'add' | 'remove' | 'rename'; item?: FileItem; path?: string; oldPath?: string; newPath?: string; name?: string }) => void) => () => void;

  // Remove listeners
  removeAllListeners: (channel: string) => void;
}

// Expose APIs to renderer
const api: ElectronAPI = {
  fs: {
    readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path, data) => ipcRenderer.invoke('fs:writeFile', path, data),
    readTextFile: (path) => ipcRenderer.invoke('fs:readTextFile', path),
    writeTextFile: (path, content) => ipcRenderer.invoke('fs:writeTextFile', path, content),
    exists: (path) => ipcRenderer.invoke('fs:exists', path),
    mkdir: (path) => ipcRenderer.invoke('fs:mkdir', path),
    readdir: (path) => ipcRenderer.invoke('fs:readdir', path),
    rename: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    unlink: (path) => ipcRenderer.invoke('fs:unlink', path),
    stat: (path) => ipcRenderer.invoke('fs:stat', path),
    rm: (path) => ipcRenderer.invoke('fs:rm', path),
  },

  shell: {
    openPath: (path) => ipcRenderer.invoke('shell:open-path', path),
  },

  dialog: {
    showConfirm: (message) => ipcRenderer.invoke('dialog:show-confirm', message),
  },

  document: {
    new: (parentPath, suggestedName) => ipcRenderer.invoke('document:new', parentPath, suggestedName),
    open: () => ipcRenderer.invoke('document:open'),
    load: (path) => ipcRenderer.invoke('document:load', path),
    save: (content) => ipcRenderer.invoke('document:save', content),
    getContent: () => ipcRenderer.invoke('document:get-content'),
    uploadImage: (data, fileName) => ipcRenderer.invoke('document:upload-image', data, fileName),
    close: () => ipcRenderer.invoke('document:close'),
  },

  folder: {
    scan: (path) => ipcRenderer.invoke('folder:scan', path),
    loadChildren: (path) => ipcRenderer.invoke('folder:load-children', path),
  },

  onDocumentLoaded: (callback) => {
    ipcRenderer.on('document:loaded', (_, data) => callback(data));
  },

  onDocumentSaved: (callback) => {
    ipcRenderer.on('document:saved', () => callback());
  },

  onExternalChange: (callback) => {
    ipcRenderer.on('document:external-change', (_, content) => callback(content));
  },

  onFolderLoaded: (callback) => {
    ipcRenderer.on('folder:loaded', (_, data) => callback(data));
  },

  onFileOpened: (callback) => {
    ipcRenderer.on('file:opened', (_, data) => callback(data));
  },

  onFolderOpened: (callback) => {
    ipcRenderer.on('folder:opened', (_, data) => callback(data));
  },

  onFolderChanged: (callback) => {
    ipcRenderer.on('folder:changed', (_, data) => callback(data));
  },

  onFolderChildrenChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { parentPath: string; type: 'add' | 'remove' | 'rename'; item?: FileItem; path?: string; oldPath?: string; newPath?: string; name?: string }) => callback(data);
    ipcRenderer.on('folder:children-changed', handler);
    return () => ipcRenderer.removeListener('folder:children-changed', handler);
  },

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

// Type declaration for window
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
