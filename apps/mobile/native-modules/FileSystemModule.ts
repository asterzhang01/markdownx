/**
 * FileSystem Module for Mobile
 * Implements FileSystemAdapter interface using expo-file-system
 */
import * as FileSystem from 'expo-file-system';
import type { FileSystemAdapter } from '@markdownx/core';

/**
 * Create a FileSystemAdapter for Expo/React Native
 */
export function createExpoFsAdapter(): FileSystemAdapter {
  return {
    async readFile(path: string): Promise<Uint8Array> {
      const content = await FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // Convert base64 to Uint8Array
      const binaryString = atob(content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    },

    async writeFile(path: string, data: Uint8Array): Promise<void> {
      // Convert Uint8Array to base64
      let binary = '';
      for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i]);
      }
      const base64 = btoa(binary);
      await FileSystem.writeAsStringAsync(path, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    },

    async readTextFile(path: string): Promise<string> {
      return FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    },

    async writeTextFile(path: string, content: string): Promise<void> {
      await FileSystem.writeAsStringAsync(path, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    },

    async exists(path: string): Promise<boolean> {
      const info = await FileSystem.getInfoAsync(path);
      return info.exists;
    },

    async mkdir(dirPath: string): Promise<void> {
      const info = await FileSystem.getInfoAsync(dirPath);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
      }
    },

    async readdir(dirPath: string): Promise<string[]> {
      return FileSystem.readDirectoryAsync(dirPath);
    },

    watch(_path: string, _callback: (event: 'change' | 'rename', filename: string) => void): () => void {
      // File watching is not natively supported in Expo
      // Would need to implement polling or use a native module
      console.warn('File watching not supported on mobile');
      return () => {};
    },

    async rename(oldPath: string, newPath: string): Promise<void> {
      await FileSystem.moveAsync({
        from: oldPath,
        to: newPath,
      });
    },

    async unlink(path: string): Promise<void> {
      await FileSystem.deleteAsync(path);
    },

    async stat(path: string): Promise<{
      isFile: boolean;
      isDirectory: boolean;
      size: number;
      mtime: number;
    }> {
      const info = await FileSystem.getInfoAsync(path, { size: true });
      if (!info.exists) {
        throw new Error(`File not found: ${path}`);
      }
      return {
        isFile: !info.isDirectory,
        isDirectory: info.isDirectory ?? false,
        size: info.size ?? 0,
        mtime: info.modificationTime ?? Date.now(),
      };
    },
  };
}

/**
 * Get the documents directory for storing .markdownx files
 */
export function getDocumentsDirectory(): string {
  return FileSystem.documentDirectory || '';
}

/**
 * List all .markdownx documents in the documents directory
 */
export async function listDocuments(): Promise<string[]> {
  const docsDir = getDocumentsDirectory();
  if (!docsDir) return [];

  try {
    const contents = await FileSystem.readDirectoryAsync(docsDir);
    return contents.filter(name => name.endsWith('.markdownx'));
  } catch {
    return [];
  }
}

/**
 * Get full path for a document
 */
export function getDocumentPath(name: string): string {
  return `${getDocumentsDirectory()}${name}`;
}
