/**
 * Sync Engine for MarkdownX
 * Implements Dual-Write mechanism: updates both state.bin (CRDT) and index.md (golden copy)
 * with atomic file operations for data integrity
 */
import * as Automerge from '@automerge/automerge';
import type { DocState, FileSystemAdapter, Manifest, SyncEngineConfig, LoadDocResult } from './types';
import { initDoc, loadDoc, saveDoc, updateContent, getContent, mergeDocs } from './automerge';
import { createDefaultManifest, parseManifest, serializeManifest, validateManifest, upgradeManifest } from './manifest';

/** Path constants within a .mdx folder */
const PATHS = {
  INDEX_MD: 'index.md',
  STATE_BIN: '.mdx/state.bin',
  MANIFEST_JSON: '.mdx/manifest.json',
  CONFIG_JSON: '.mdx/config.json',
  SYSTEM_DIR: '.mdx',
  ASSETS_DIR: 'assets',
} as const;

/**
 * SyncEngine class
 * Manages the dual-write mechanism and file synchronization
 */
export class SyncEngine {
  private doc: Automerge.Doc<DocState>;
  private manifest: Manifest;
  private fsAdapter: FileSystemAdapter;
  private basePath: string;
  private onExternalChange?: (content: string) => void;
  private unwatch?: () => void;
  private saveDebounceTimer?: ReturnType<typeof setTimeout>;
  private autoSaveDelay: number;
  private isSaving = false;

  constructor(config: SyncEngineConfig) {
    this.fsAdapter = config.fsAdapter;
    this.basePath = config.basePath;
    this.onExternalChange = config.onExternalChange;
    this.autoSaveDelay = config.autoSaveDelay ?? 1000;
    this.doc = initDoc();
    this.manifest = createDefaultManifest();
  }

  /**
   * Get full path for a relative path within the document folder
   */
  private getPath(relativePath: string): string {
    return `${this.basePath}/${relativePath}`;
  }

  /**
   * Initialize a new document
   * Creates the folder structure and initial files
   */
  async init(initialContent = ''): Promise<void> {
    // Create directory structure
    await this.fsAdapter.mkdir(this.getPath(PATHS.SYSTEM_DIR));
    await this.fsAdapter.mkdir(this.getPath(PATHS.ASSETS_DIR));

    // Initialize document
    this.doc = initDoc({ initialContent });
    this.manifest = createDefaultManifest();

    // Perform initial dual-write
    await this.dualWrite();
  }

  /**
   * Load an existing document
   * Reads state.bin and manifest.json, validates compatibility
   */
  async load(): Promise<LoadDocResult> {
    const statePath = this.getPath(PATHS.STATE_BIN);
    const manifestPath = this.getPath(PATHS.MANIFEST_JSON);
    const indexPath = this.getPath(PATHS.INDEX_MD);

    // Load manifest
    const manifestExists = await this.fsAdapter.exists(manifestPath);
    if (manifestExists) {
      const manifestJson = await this.fsAdapter.readTextFile(manifestPath);
      this.manifest = parseManifest(manifestJson);
      this.manifest = upgradeManifest(this.manifest);
    } else {
      this.manifest = createDefaultManifest();
    }

    // Validate manifest
    const validation = validateManifest(this.manifest);

    // Load state.bin if exists
    const stateExists = await this.fsAdapter.exists(statePath);
    if (stateExists) {
      const binary = await this.fsAdapter.readFile(statePath);
      this.doc = loadDoc(binary);
    } else {
      // Fallback: read from index.md if state.bin doesn't exist
      const indexExists = await this.fsAdapter.exists(indexPath);
      if (indexExists) {
        const content = await this.fsAdapter.readTextFile(indexPath);
        this.doc = initDoc({ initialContent: content });
        // Create state.bin from index.md content
        await this.dualWrite();
      } else {
        this.doc = initDoc();
      }
    }

    return {
      state: { ...this.doc },
      manifest: this.manifest,
      validation,
    };
  }

  /**
   * Apply a content change
   * Updates the CRDT document and triggers dual-write
   */
  async applyChange(newContent: string): Promise<void> {
    // Update Automerge document
    this.doc = updateContent(this.doc, newContent);

    // Debounced save
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.dualWrite();
    }, this.autoSaveDelay);
  }

  /**
   * Force immediate save (bypass debounce)
   */
  async forceSave(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    await this.dualWrite();
  }

  /**
   * Dual-Write mechanism
   * The core of data integrity: writes to both state.bin and index.md atomically
   * 
   * Steps:
   * 1. Save Automerge binary to state.bin
   * 2. Export markdown content
   * 3. Write to index.md using atomic operation (tmp + rename)
   * 4. Save manifest
   */
  private async dualWrite(): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;

    try {
      // Ensure system directory exists
      await this.fsAdapter.mkdir(this.getPath(PATHS.SYSTEM_DIR));

      // 1. Save state.bin
      const binary = saveDoc(this.doc);
      await this.fsAdapter.writeFile(this.getPath(PATHS.STATE_BIN), binary);

      // 2. Get markdown content
      const content = getContent(this.doc);

      // 3. Atomic write to index.md
      await this.atomicWriteText(this.getPath(PATHS.INDEX_MD), content);

      // 4. Save manifest
      const manifestJson = serializeManifest(this.manifest);
      await this.atomicWriteText(this.getPath(PATHS.MANIFEST_JSON), manifestJson);
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Atomic write operation
   * Writes to a temporary file then renames to target
   * This ensures file integrity even if the process crashes
   */
  private async atomicWriteText(targetPath: string, content: string): Promise<void> {
    const tmpPath = `${targetPath}.tmp.${Date.now()}`;
    
    try {
      // Write to temp file
      await this.fsAdapter.writeTextFile(tmpPath, content);
      
      // Atomic rename
      await this.fsAdapter.rename(tmpPath, targetPath);
    } catch (error) {
      // Clean up temp file if rename failed
      try {
        const tmpExists = await this.fsAdapter.exists(tmpPath);
        if (tmpExists) {
          await this.fsAdapter.unlink(tmpPath);
        }
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Merge with an external document (sync scenario)
   */
  async merge(remoteDoc: Automerge.Doc<DocState>): Promise<void> {
    this.doc = mergeDocs(this.doc, remoteDoc);
    await this.dualWrite();
  }

  /**
   * Handle external change to index.md
   * Called when index.md is edited outside the app (e.g., VS Code)
   */
  async handleExternalIndexChange(): Promise<string> {
    const indexPath = this.getPath(PATHS.INDEX_MD);
    const newContent = await this.fsAdapter.readTextFile(indexPath);
    
    // Update CRDT with external changes
    this.doc = updateContent(this.doc, newContent);
    
    // Save back to state.bin to sync the change
    const binary = saveDoc(this.doc);
    await this.fsAdapter.writeFile(this.getPath(PATHS.STATE_BIN), binary);

    // Notify listener
    if (this.onExternalChange) {
      this.onExternalChange(newContent);
    }

    return newContent;
  }

  /**
   * Start watching for file changes
   */
  startWatching(): void {
    if (this.unwatch) return;

    let lastKnownContent = getContent(this.doc);

    this.unwatch = this.fsAdapter.watch(this.basePath, async (event, filename) => {
      // Only watch index.md changes
      if (filename !== PATHS.INDEX_MD) return;
      if (this.isSaving) return; // Ignore our own writes

      try {
        const indexPath = this.getPath(PATHS.INDEX_MD);
        const newContent = await this.fsAdapter.readTextFile(indexPath);
        
        // Only process if content actually changed
        if (newContent !== lastKnownContent) {
          lastKnownContent = newContent;
          await this.handleExternalIndexChange();
        }
      } catch {
        // Ignore read errors during watch
      }
    });
  }

  /**
   * Stop watching for file changes
   */
  stopWatching(): void {
    if (this.unwatch) {
      this.unwatch();
      this.unwatch = undefined;
    }
  }

  /**
   * Get current content
   */
  getContent(): string {
    return getContent(this.doc);
  }

  /**
   * Get current document
   */
  getDocument(): Automerge.Doc<DocState> {
    return this.doc;
  }

  /**
   * Get current manifest
   */
  getManifest(): Manifest {
    return this.manifest;
  }

  /**
   * Get assets directory path
   */
  getAssetsDir(): string {
    return this.getPath(PATHS.ASSETS_DIR);
  }

  /**
   * Get base path
   */
  getBasePath(): string {
    return this.basePath;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopWatching();
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
  }
}

/**
 * Create a new SyncEngine instance
 */
export function createSyncEngine(config: SyncEngineConfig): SyncEngine {
  return new SyncEngine(config);
}

/**
 * Helper to check if a path is a valid .mdx document
 */
export async function isMarkdownXDocument(
  path: string,
  fsAdapter: FileSystemAdapter
): Promise<boolean> {
  // Check for required files
  const hasIndex = await fsAdapter.exists(`${path}/${PATHS.INDEX_MD}`);
  const hasSystemDir = await fsAdapter.exists(`${path}/${PATHS.SYSTEM_DIR}`);
  
  return hasIndex || hasSystemDir;
}

/**
 * Create a new .mdx document at the specified path
 */
export async function createMarkdownXDocument(
  path: string,
  fsAdapter: FileSystemAdapter,
  initialContent = ''
): Promise<SyncEngine> {
  const engine = new SyncEngine({
    basePath: path,
    fsAdapter,
  });
  
  await engine.init(initialContent);
  return engine;
}
