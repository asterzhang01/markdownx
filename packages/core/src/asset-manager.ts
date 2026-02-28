/**
 * Asset management for MarkdownX
 * Handles image/file hashing, deduplication, and storage
 */
import type { FileSystemAdapter, AssetInfo } from './types';

/**
 * Calculate SHA-256 hash of file data
 * Uses Web Crypto API for cross-platform compatibility
 */
export async function calculateHash(data: Uint8Array): Promise<string> {
  // Use Web Crypto API (available in browsers, Node.js, and React Native with polyfill)
  const cryptoObj = typeof window !== 'undefined' 
    ? window.crypto 
    : (globalThis as { crypto?: Crypto }).crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('Crypto API not available');
  }

  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract file extension from filename
 */
export function getFileExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Determine MIME type from file extension
 */
export function getMimeType(filename: string): string {
  const ext = getFileExtension(filename);
  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Process an image/asset file
 * 1. Calculate SHA-256 hash of content
 * 2. Check if already exists (deduplication)
 * 3. Save to assets/ directory with hash-based filename
 * 4. Return relative path for markdown reference
 * 
 * @param fileData - Binary file data
 * @param fileName - Original filename
 * @param assetsDir - Full path to assets directory
 * @param fsAdapter - FileSystem adapter
 * @returns AssetInfo with hash and relative path
 */
export async function processImage(
  fileData: Uint8Array,
  fileName: string,
  assetsDir: string,
  fsAdapter: FileSystemAdapter
): Promise<AssetInfo> {
  // Calculate hash
  const hash = await calculateHash(fileData);
  
  // Get extension and construct stored filename
  const ext = getFileExtension(fileName);
  const storedName = ext ? `${hash}.${ext}` : hash;
  const relativePath = `assets/${storedName}`;
  const fullPath = `${assetsDir}/${storedName}`;

  // Check if file already exists (deduplication)
  const exists = await fsAdapter.exists(fullPath);
  
  if (!exists) {
    // Ensure assets directory exists
    await fsAdapter.mkdir(assetsDir);
    
    // Write file
    await fsAdapter.writeFile(fullPath, fileData);
  }

  return {
    originalName: fileName,
    hash,
    storedName,
    relativePath,
    size: fileData.length,
    mimeType: getMimeType(fileName),
  };
}

/**
 * Process an image from a File/Blob object (browser environment)
 */
export async function processImageFromFile(
  file: { name: string; arrayBuffer(): Promise<ArrayBuffer> },
  assetsDir: string,
  fsAdapter: FileSystemAdapter
): Promise<AssetInfo> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  return processImage(uint8Array, file.name, assetsDir, fsAdapter);
}

/**
 * Process an image from base64 data
 */
export async function processImageFromBase64(
  base64Data: string,
  fileName: string,
  assetsDir: string,
  fsAdapter: FileSystemAdapter
): Promise<AssetInfo> {
  // Remove data URL prefix if present
  const base64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  
  // Convert base64 to Uint8Array
  // eslint-disable-next-line no-restricted-globals
  const binaryString = typeof atob !== 'undefined' 
    ? atob(base64) 
    : Buffer.from(base64, 'base64').toString('binary');
  const uint8Array = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }
  
  return processImage(uint8Array, fileName, assetsDir, fsAdapter);
}

/**
 * Get the full path for an asset reference
 * Converts relative path like "assets/abc123.png" to full path
 */
export function resolveAssetPath(
  relativePath: string,
  basePath: string
): string {
  // Remove leading slash if present
  const cleanPath = relativePath.replace(/^\//, '');
  return `${basePath}/${cleanPath}`;
}

/**
 * List all assets in the assets directory
 */
export async function listAssets(
  assetsDir: string,
  fsAdapter: FileSystemAdapter
): Promise<string[]> {
  try {
    const exists = await fsAdapter.exists(assetsDir);
    if (!exists) {
      return [];
    }
    return await fsAdapter.readdir(assetsDir);
  } catch {
    return [];
  }
}

/**
 * Delete an asset file
 */
export async function deleteAsset(
  relativePath: string,
  basePath: string,
  fsAdapter: FileSystemAdapter
): Promise<void> {
  const fullPath = resolveAssetPath(relativePath, basePath);
  const exists = await fsAdapter.exists(fullPath);
  if (exists) {
    await fsAdapter.unlink(fullPath);
  }
}

/**
 * Clean up unused assets
 * Scans markdown content for asset references and removes unreferenced files
 * 
 * @param content - Markdown content to scan
 * @param assetsDir - Path to assets directory
 * @param basePath - Base path of the document
 * @param fsAdapter - FileSystem adapter
 * @returns Array of deleted asset filenames
 */
export async function cleanupUnusedAssets(
  content: string,
  assetsDir: string,
  basePath: string,
  fsAdapter: FileSystemAdapter
): Promise<string[]> {
  // Find all asset references in markdown
  // Matches ![alt](assets/hash.ext) or ![](assets/hash.ext)
  const assetRegex = /!\[([^\]]*)\]\((assets\/[^)]+)\)/g;
  const referencedAssets = new Set<string>();
  
  let match;
  while ((match = assetRegex.exec(content)) !== null) {
    referencedAssets.add(match[2]); // The path part
  }

  // List all assets
  const allAssets = await listAssets(assetsDir, fsAdapter);
  const deleted: string[] = [];

  // Delete unreferenced assets
  for (const asset of allAssets) {
    const relativePath = `assets/${asset}`;
    if (!referencedAssets.has(relativePath)) {
      await deleteAsset(relativePath, basePath, fsAdapter);
      deleted.push(asset);
    }
  }

  return deleted;
}

/**
 * Convert an asset to a data URL for embedding
 * Useful for preview or export scenarios
 */
export async function assetToDataURL(
  relativePath: string,
  basePath: string,
  fsAdapter: FileSystemAdapter
): Promise<string> {
  const fullPath = resolveAssetPath(relativePath, basePath);
  const data = await fsAdapter.readFile(fullPath);
  const mimeType = getMimeType(relativePath);
  
  // Convert to base64
  let binary = '';
  const bytes = new Uint8Array(data);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // eslint-disable-next-line no-restricted-globals
  const base64 = typeof btoa !== 'undefined'
    ? btoa(binary)
    : Buffer.from(binary, 'binary').toString('base64');
  
  return `data:${mimeType};base64,${base64}`;
}
