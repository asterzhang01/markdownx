/**
 * FileSystem Adapter implementations for MarkdownX
 * Provides cross-platform file system abstraction
 */
import type { FileSystemAdapter } from './types';

/**
 * Node.js FileSystem Adapter
 * Used in Electron main process and Node.js environments
 */
export function createNodeFsAdapter(): FileSystemAdapter {
  // Dynamic import to avoid bundling in web
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs').promises;
  const path = require('path');
  const { watch: fsWatch } = require('fs');

  return {
    async readFile(filePath: string): Promise<Uint8Array> {
      const buffer = await fs.readFile(filePath);
      return new Uint8Array(buffer);
    },

    async writeFile(filePath: string, data: Uint8Array): Promise<void> {
      await fs.writeFile(filePath, Buffer.from(data));
    },

    async readTextFile(filePath: string): Promise<string> {
      return fs.readFile(filePath, 'utf-8');
    },

    async writeTextFile(filePath: string, content: string): Promise<void> {
      await fs.writeFile(filePath, content, 'utf-8');
    },

    async exists(filePath: string): Promise<boolean> {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },

    async mkdir(dirPath: string): Promise<void> {
      await fs.mkdir(dirPath, { recursive: true });
    },

    async readdir(dirPath: string): Promise<string[]> {
      return fs.readdir(dirPath);
    },

    watch(dirPath: string, callback: (event: 'change' | 'rename', filename: string) => void): () => void {
      const watcher = fsWatch(dirPath, { recursive: true }, (event: string, filename: string | null) => {
        if (filename) {
          callback(event as 'change' | 'rename', filename);
        }
      });
      return () => watcher.close();
    },

    async rename(oldPath: string, newPath: string): Promise<void> {
      await fs.rename(oldPath, newPath);
    },

    async unlink(filePath: string): Promise<void> {
      await fs.unlink(filePath);
    },

    async stat(filePath: string): Promise<{ isFile: boolean; isDirectory: boolean; size: number; mtime: number }> {
      const stats = await fs.stat(filePath);
      return {
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        mtime: stats.mtimeMs,
      };
    },
  };
}

/**
 * Memory FileSystem Adapter
 * Used for testing and in-memory operations
 */
export function createMemoryFsAdapter(): FileSystemAdapter {
  const files = new Map<string, Uint8Array | string>();
  const watchers = new Map<string, Set<(event: 'change' | 'rename', filename: string) => void>>();

  const notifyWatchers = (path: string, event: 'change' | 'rename', filename: string) => {
    // Notify watchers on the parent directory
    const dir = path.substring(0, path.lastIndexOf('/')) || '/';
    const callbacks = watchers.get(dir);
    if (callbacks) {
      callbacks.forEach(cb => cb(event, filename));
    }
  };

  const getFileName = (path: string) => {
    return path.substring(path.lastIndexOf('/') + 1);
  };

  return {
    async readFile(filePath: string): Promise<Uint8Array> {
      const data = files.get(filePath);
      if (!data) {
        throw new Error(`File not found: ${filePath}`);
      }
      if (typeof data === 'string') {
        return new TextEncoder().encode(data);
      }
      return data;
    },

    async writeFile(filePath: string, data: Uint8Array): Promise<void> {
      files.set(filePath, data);
      notifyWatchers(filePath, 'change', getFileName(filePath));
    },

    async readTextFile(filePath: string): Promise<string> {
      const data = files.get(filePath);
      if (!data) {
        throw new Error(`File not found: ${filePath}`);
      }
      if (typeof data === 'string') {
        return data;
      }
      return new TextDecoder().decode(data);
    },

    async writeTextFile(filePath: string, content: string): Promise<void> {
      files.set(filePath, content);
      notifyWatchers(filePath, 'change', getFileName(filePath));
    },

    async exists(filePath: string): Promise<boolean> {
      return files.has(filePath);
    },

    async mkdir(_dirPath: string): Promise<void> {
      // Memory FS doesn't need actual directory creation
    },

    async readdir(dirPath: string): Promise<string[]> {
      const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
      const result: string[] = [];
      for (const path of files.keys()) {
        if (path.startsWith(prefix)) {
          const relative = path.substring(prefix.length);
          const name = relative.split('/')[0];
          if (name && !result.includes(name)) {
            result.push(name);
          }
        }
      }
      return result;
    },

    watch(dirPath: string, callback: (event: 'change' | 'rename', filename: string) => void): () => void {
      if (!watchers.has(dirPath)) {
        watchers.set(dirPath, new Set());
      }
      watchers.get(dirPath)!.add(callback);
      return () => {
        watchers.get(dirPath)?.delete(callback);
      };
    },

    async rename(oldPath: string, newPath: string): Promise<void> {
      const data = files.get(oldPath);
      if (!data) {
        throw new Error(`File not found: ${oldPath}`);
      }
      files.delete(oldPath);
      files.set(newPath, data);
      notifyWatchers(oldPath, 'rename', getFileName(oldPath));
    },

    async unlink(filePath: string): Promise<void> {
      files.delete(filePath);
      notifyWatchers(filePath, 'change', getFileName(filePath));
    },

    async stat(filePath: string): Promise<{ isFile: boolean; isDirectory: boolean; size: number; mtime: number }> {
      const data = files.get(filePath);
      if (!data) {
        throw new Error(`File not found: ${filePath}`);
      }
      return {
        isFile: true,
        isDirectory: false,
        size: typeof data === 'string' ? data.length : data.length,
        mtime: Date.now(),
      };
    },
  };
}

/**
 * IPC FileSystem Adapter
 * Used in Electron renderer process, communicates with main process via IPC
 */
export function createIpcFsAdapter(ipc: {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}): FileSystemAdapter {
  return {
    async readFile(filePath: string): Promise<Uint8Array> {
      const result = await ipc.invoke('fs:readFile', filePath) as ArrayBuffer;
      return new Uint8Array(result);
    },

    async writeFile(filePath: string, data: Uint8Array): Promise<void> {
      await ipc.invoke('fs:writeFile', filePath, Array.from(data));
    },

    async readTextFile(filePath: string): Promise<string> {
      return ipc.invoke('fs:readTextFile', filePath) as Promise<string>;
    },

    async writeTextFile(filePath: string, content: string): Promise<void> {
      await ipc.invoke('fs:writeTextFile', filePath, content);
    },

    async exists(filePath: string): Promise<boolean> {
      return ipc.invoke('fs:exists', filePath) as Promise<boolean>;
    },

    async mkdir(dirPath: string): Promise<void> {
      await ipc.invoke('fs:mkdir', dirPath);
    },

    async readdir(dirPath: string): Promise<string[]> {
      return ipc.invoke('fs:readdir', dirPath) as Promise<string[]>;
    },

    watch(_dirPath: string, _callback: (event: 'change' | 'rename', filename: string) => void): () => void {
      // IPC adapter doesn't support watch directly
      // Use main process to set up watch and send events via IPC
      console.warn('Watch not supported in IPC adapter, use main process watcher');
      return () => {};
    },

    async rename(oldPath: string, newPath: string): Promise<void> {
      await ipc.invoke('fs:rename', oldPath, newPath);
    },

    async unlink(filePath: string): Promise<void> {
      await ipc.invoke('fs:unlink', filePath);
    },

    async stat(filePath: string): Promise<{ isFile: boolean; isDirectory: boolean; size: number; mtime: number }> {
      return ipc.invoke('fs:stat', filePath) as Promise<{
        isFile: boolean;
        isDirectory: boolean;
        size: number;
        mtime: number;
      }>;
    },
  };
}
