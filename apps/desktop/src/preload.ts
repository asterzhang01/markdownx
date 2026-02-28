/**
 * Electron Preload Script
 * Exposes secure APIs to the renderer process via contextBridge
 */
import { contextBridge, ipcRenderer } from 'electron';

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
  };

  // Document operations
  document: {
    new: () => Promise<boolean>;
    save: (content: string) => Promise<boolean>;
    getContent: () => Promise<string>;
    uploadImage: (data: number[], fileName: string) => Promise<string>;
  };

  // Event listeners
  onDocumentLoaded: (callback: (data: { content: string; manifest: unknown; basePath: string }) => void) => void;
  onDocumentSaved: (callback: () => void) => void;
  onExternalChange: (callback: (content: string) => void) => void;

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
  },

  document: {
    new: () => ipcRenderer.invoke('document:new'),
    save: (content) => ipcRenderer.invoke('document:save', content),
    getContent: () => ipcRenderer.invoke('document:get-content'),
    uploadImage: (data, fileName) => ipcRenderer.invoke('document:upload-image', data, fileName),
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
