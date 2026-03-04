/**
 * SyncEngine — high-level orchestrator for .mdx document lifecycle.
 *
 * Wraps MdxStorageAdapter + FileSyncEngine + DocumentOperations into a
 * single facade consumed by the Electron main process and other hosts.
 *
 * Responsibilities:
 *   - Load / create .mdx documents
 *   - Apply content changes via character-level CRDT splice
 *   - Persist changes (debounced) and export index.md (Dual-Write)
 *   - Handle external index.md edits (VS Code / Typora)
 *   - Expose current content and manifest for the renderer
 *   - Cleanup resources on destroy
 */
import { next as Automerge } from "@automerge/automerge";
import type { FileSystemAdapter } from "./fs-adapter.js";
import type { MarkdownDoc } from "./schema.js";
import type { Manifest } from "./bridge-types.js";
import { MdxStorageAdapter } from "./mdx-storage-adapter.js";
import { FileSyncEngine } from "./file-sync-engine.js";
import { extractTitle } from "./document-operations.js";

// ---------------------------------------------------------------------------
// Device ID management
// ---------------------------------------------------------------------------

const DEVICE_ID_FILE = ".mdx/device-id";

/**
 * Get or create a stable device ID persisted in the .mdx directory.
 * The ID is a random hex string, generated once per device and reused.
 */
async function getOrCreateDeviceId(
  basePath: string,
  fsAdapter: FileSystemAdapter
): Promise<string> {
  const deviceIdPath = `${basePath}/${DEVICE_ID_FILE}`;
  try {
    const existing = await fsAdapter.readTextFile(deviceIdPath);
    const trimmed = existing.trim();
    if (trimmed.length > 0) return trimmed;
  } catch {
    // File doesn't exist — generate a new ID
  }

  const randomBytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(randomBytes);
  const deviceId = Array.from(randomBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  await fsAdapter.mkdir(`${basePath}/.mdx`);
  await fsAdapter.writeTextFile(deviceIdPath, deviceId);
  return deviceId;
}

// ---------------------------------------------------------------------------
// SyncEngine
// ---------------------------------------------------------------------------

/** Options for creating a SyncEngine */
export interface SyncEngineOptions {
  /** Absolute path to the .mdx document directory */
  basePath: string;
  /** File system adapter (NodeFileSystemAdapter for Electron) */
  fsAdapter: FileSystemAdapter;
  /** Called when external changes are detected (e.g. from another device via cloud sync) */
  onExternalChange?: (content: string) => void;
}

export class SyncEngine {
  private readonly basePath: string;
  private readonly fsAdapter: FileSystemAdapter;
  private readonly onExternalChange?: (content: string) => void;

  private deviceId = "";
  private storage: MdxStorageAdapter | null = null;
  private syncEngine: FileSyncEngine | null = null;
  private document: Automerge.Doc<MarkdownDoc> | null = null;
  private destroyed = false;

  /** Debounce timer for persisting changes */
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly SAVE_DEBOUNCE_MS = 300;

  constructor(options: SyncEngineOptions) {
    this.basePath = options.basePath;
    this.fsAdapter = options.fsAdapter;
    this.onExternalChange = options.onExternalChange;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Load an existing .mdx document from disk.
   * Reads snapshot + chunk, performs CRDT merge with all devices.
   */
  async load(): Promise<void> {
    this.deviceId = await getOrCreateDeviceId(this.basePath, this.fsAdapter);
    this.storage = new MdxStorageAdapter(this.basePath, this.fsAdapter, this.deviceId);
    this.syncEngine = new FileSyncEngine(this.basePath, this.fsAdapter, this.deviceId);

    await this.storage.ensureDirectories();

    // Try loading from CRDT storage
    let doc = await this.storage.loadLocal();

    if (!doc) {
      // No CRDT data yet — bootstrap from index.md if it exists
      const indexPath = `${this.basePath}/index.md`;
      let initialContent = "# Untitled\n\n";
      try {
        if (await this.fsAdapter.exists(indexPath)) {
          initialContent = await this.fsAdapter.readTextFile(indexPath);
        }
      } catch {
        // Use default content
      }

      doc = Automerge.change(Automerge.init<MarkdownDoc>(), (d) => {
        d.content = initialContent;
        d.commentThreads = {};
        d.assetsDocUrl = "" as never;
      });

      // Persist the initial state
      const changes = Automerge.getAllChanges(doc);
      for (const change of changes) {
        this.storage.appendChange(change);
      }
      await this.storage.flushChanges();
      await this.storage.exportIndexMd(doc);
    }

    // Merge with other devices
    const { doc: mergedDoc } = await this.syncEngine.syncAll(doc);
    this.document = mergedDoc;
  }

  /**
   * Initialise a brand-new .mdx document with default content.
   * Called by createMarkdownXDocument flow.
   */
  async init(initialContent = "# Untitled\n\n"): Promise<void> {
    this.deviceId = await getOrCreateDeviceId(this.basePath, this.fsAdapter);
    this.storage = new MdxStorageAdapter(this.basePath, this.fsAdapter, this.deviceId);
    this.syncEngine = new FileSyncEngine(this.basePath, this.fsAdapter, this.deviceId);

    await this.storage.ensureDirectories();

    this.document = Automerge.change(Automerge.init<MarkdownDoc>(), (d) => {
      d.content = initialContent;
      d.commentThreads = {};
      d.assetsDocUrl = "" as never;
    });

    const changes = Automerge.getAllChanges(this.document);
    for (const change of changes) {
      this.storage.appendChange(change);
    }
    await this.storage.flushChanges();
    await this.storage.exportIndexMd(this.document);
  }

  /**
   * Release all resources. Safe to call multiple times.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    this.storage = null;
    this.syncEngine = null;
    this.document = null;
  }

  // -----------------------------------------------------------------------
  // Content access
  // -----------------------------------------------------------------------

  /** Get the current Markdown content */
  getContent(): string {
    const content = this.document?.content;
    if (content === undefined || content === null) return "";
    // Automerge Text objects have a toString() method; plain strings pass through
    return String(content);
  }

  /** Get document manifest for the renderer */
  getManifest(): Manifest {
    const content = this.getContent();
    return {
      basePath: this.basePath,
      deviceId: this.deviceId,
      formatVersion: "1.0",
      lastModified: new Date().toISOString(),
      title: extractTitle(content),
    };
  }

  /** Get the absolute path to the assets directory */
  getAssetsDir(): string {
    return `${this.basePath}/assets`;
  }

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  /**
   * Apply a full content replacement as a character-level CRDT splice.
   *
   * Diffs the new content against the current content and applies
   * the minimal splice operation to preserve CRDT history.
   */
  async applyChange(newContent: string): Promise<void> {
    if (!this.document || !this.storage) return;

    const currentContent = this.document.content ?? "";
    if (newContent === currentContent) return;

    this.document = Automerge.change(this.document, (d) => {
      Automerge.splice(d, ["content"], 0, currentContent.length, newContent);
    });

    const lastChange = Automerge.getLastLocalChange(this.document);
    if (lastChange) {
      this.storage.appendChange(lastChange);
    }

    this.scheduleSave();
  }

  /**
   * Force an immediate save (flush pending changes + export index.md).
   */
  async forceSave(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (!this.storage || !this.document) return;

    await this.storage.flushChanges();
    await this.storage.exportIndexMd(this.document);

    if (this.storage.shouldCompact()) {
      await this.storage.compact(this.document);
    }
  }

  /**
   * Handle external modification of index.md (e.g. by VS Code or Typora).
   * Reads the file, diffs against CRDT state, and applies changes.
   */
  async handleExternalIndexChange(): Promise<void> {
    if (!this.syncEngine || !this.document) return;

    const updatedDoc = await this.syncEngine.handleExternalMarkdownEdit(this.document);
    if (updatedDoc) {
      this.document = updatedDoc;
      this.onExternalChange?.(this.document.content ?? "");
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private scheduleSave(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.forceSave().catch((error) => {
        console.error("SyncEngine: scheduled save failed", error);
      });
    }, SyncEngine.SAVE_DEBOUNCE_MS);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a SyncEngine for an existing .mdx document.
 * The engine is not loaded yet — call `.load()` after creation.
 */
export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  return new SyncEngine(options);
}
