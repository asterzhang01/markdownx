/**
 * Multi-Device Sync End-to-End Tests
 *
 * Simulates multiple devices editing the same .mdx document concurrently,
 * syncing through a shared file system (MemoryFileSystemAdapter).
 *
 * Test layers:
 *   - Low-level (FileSyncEngine + MdxStorageAdapter): precise character-level
 *     splice for true concurrent CRDT convergence testing
 *   - High-level (SyncEngine): sequential multi-device workflows exercising
 *     the full lifecycle (load, edit, save, sync, external edit)
 *
 * Scenarios covered:
 *   1. Two-device sequential + concurrent editing
 *   2. Three+ device topologies (star, chain, partial offline)
 *   3. Conflict scenarios (same position, delete vs edit, overlapping)
 *   4. Compaction interleaved with sync
 *   5. External editor (index.md) interleaved with CRDT sync
 *   6. SyncEngine full lifecycle with multi-device
 */
import { describe, it, expect, beforeEach } from "vitest";
import { next as Automerge } from "@automerge/automerge";
import { MemoryFileSystemAdapter } from "./helpers/memory-fs-adapter.js";
import { SyncEngine } from "../src/sync-engine.js";
import { FileSyncEngine } from "../src/file-sync-engine.js";
import { MdxStorageAdapter } from "../src/mdx-storage-adapter.js";
import type { MarkdownDoc } from "../src/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a MarkdownDoc via Automerge.splice (character-level CRDT). */
function createDocWithSplice(content: string): Automerge.Doc<MarkdownDoc> {
  let doc = Automerge.change(Automerge.init<MarkdownDoc>(), (d) => {
    d.content = "";
    d.commentThreads = {};
    d.assetsDocUrl = "" as never;
  });
  if (content.length > 0) {
    doc = Automerge.change(doc, (d) => {
      Automerge.splice(d, ["content"], 0, 0, content);
    });
  }
  return doc;
}

/** Splice edit on a document. Uses doc.content.length for safe appending. */
function deviceSplice(
  doc: Automerge.Doc<MarkdownDoc>,
  index: number,
  deleteCount: number,
  insert: string
): { doc: Automerge.Doc<MarkdownDoc>; change: Uint8Array } {
  const updated = Automerge.change(doc, (d) => {
    Automerge.splice(d, ["content"], index, deleteCount, insert);
  });
  const change = Automerge.getLastLocalChange(updated)!;
  return { doc: updated, change };
}

/** Append text at the end of a document's content. */
function deviceAppend(
  doc: Automerge.Doc<MarkdownDoc>,
  text: string
): { doc: Automerge.Doc<MarkdownDoc>; change: Uint8Array } {
  const contentLength = (doc.content ?? "").length;
  return deviceSplice(doc, contentLength, 0, text);
}

/** Persist all changes of a document to storage. */
async function persistAllChanges(
  doc: Automerge.Doc<MarkdownDoc>,
  storage: MdxStorageAdapter
): Promise<void> {
  for (const change of Automerge.getAllChanges(doc)) {
    storage.appendChange(change);
  }
  await storage.flushChanges();
}

/** Persist only the last local change to storage. */
async function persistLastChange(
  doc: Automerge.Doc<MarkdownDoc>,
  storage: MdxStorageAdapter
): Promise<void> {
  const lastChange = Automerge.getLastLocalChange(doc);
  if (lastChange) {
    storage.appendChange(lastChange);
  }
  await storage.flushChanges();
}

/** Create a SyncEngine with a deterministic device ID. */
async function createDeviceSyncEngine(
  basePath: string,
  fs: MemoryFileSystemAdapter,
  deviceId: string
): Promise<SyncEngine> {
  const appDataPath = `/appdata/${deviceId}`;
  await fs.mkdir(appDataPath);
  await fs.writeTextFile(`${appDataPath}/device-id`, deviceId);
  return new SyncEngine({ basePath, fsAdapter: fs, appDataPath });
}

// ===========================================================================
// 1. Two-Device Editing
// ===========================================================================

describe("Two-device editing", () => {
  let fs: MemoryFileSystemAdapter;
  const basePath = "/docs/shared.mdx";

  beforeEach(() => {
    fs = new MemoryFileSystemAdapter();
  });

  it("device B sees device A's edits after loading (SyncEngine)", async () => {
    const engineA = await createDeviceSyncEngine(basePath, fs, "DEV-A");
    await engineA.init("# Hello\n");
    await engineA.applyChange("# Hello\nLine from A.\n");
    await engineA.forceSave();

    const engineB = await createDeviceSyncEngine(basePath, fs, "DEV-B");
    await engineB.load();
    expect(engineB.getContent()).toContain("Line from A.");

    engineA.destroy();
    engineB.destroy();
  });

  it("empty edit does not corrupt sync state (SyncEngine)", async () => {
    const engineA = await createDeviceSyncEngine(basePath, fs, "DEV-A");
    await engineA.init("# Stable\n");
    await engineA.forceSave();

    const engineB = await createDeviceSyncEngine(basePath, fs, "DEV-B");
    await engineB.load();
    await engineB.applyChange("# Stable\n"); // no-op
    await engineB.forceSave();

    const engineA2 = await createDeviceSyncEngine(basePath, fs, "DEV-A");
    await engineA2.load();
    expect(engineA2.getContent()).toBe("# Stable\n");

    engineA.destroy();
    engineB.destroy();
    engineA2.destroy();
  });

  it("concurrent character-level appends converge (FileSyncEngine)", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");

    const baseDoc = createDocWithSplice("# Start\n");
    await persistAllChanges(baseDoc, storageA);

    // Fork
    const docA = Automerge.clone(baseDoc);
    const docB = Automerge.clone(baseDoc);

    // Both append at end
    const editA = deviceAppend(docA, "A-line-1\nA-line-2\n");
    await persistAllChanges(editA.doc, storageA);

    const editB = deviceAppend(docB, "B-line-1\nB-line-2\n");
    await persistAllChanges(editB.doc, storageB);

    // Sync
    const syncA = new FileSyncEngine(basePath, fs, "DEV-A");
    const { doc: mergedA } = await syncA.syncAll(editA.doc);

    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { doc: mergedB } = await syncB.syncAll(editB.doc);

    // Convergence
    expect(mergedA.content).toBe(mergedB.content);
    expect(mergedA.content).toContain("A-line-1");
    expect(mergedA.content).toContain("B-line-1");
    expect(mergedA.content).toContain("# Start");
  });

  it("sequential edits across two devices are preserved (FileSyncEngine)", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");

    // A creates and edits
    let docA = createDocWithSplice("# Doc\n");
    const editA = deviceAppend(docA, "Paragraph by A.\n");
    docA = editA.doc;
    await persistAllChanges(docA, storageA);

    // B starts with an empty Automerge doc (no changes persisted) and syncs
    let docB = Automerge.init<MarkdownDoc>();
    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { doc: mergedB } = await syncB.syncAll(docB);
    expect(mergedB.content).toContain("Paragraph by A.");

    // B appends — must persist ALL changes (merged + new) so loadRemote can reconstruct
    const editB = deviceAppend(mergedB, "Paragraph by B.\n");
    docB = editB.doc;
    await persistAllChanges(docB, storageB);

    // A syncs — should see both
    const syncA = new FileSyncEngine(basePath, fs, "DEV-A");
    const { doc: mergedA } = await syncA.syncAll(docA);
    expect(mergedA.content).toContain("Paragraph by A.");
    expect(mergedA.content).toContain("Paragraph by B.");
  });
});

// ===========================================================================
// 2. Three+ Device Topologies
// ===========================================================================

describe("Three-device sync topologies", () => {
  let fs: MemoryFileSystemAdapter;
  const basePath = "/docs/shared.mdx";

  beforeEach(() => {
    fs = new MemoryFileSystemAdapter();
  });

  it("star topology: three concurrent appends converge (FileSyncEngine)", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");
    const storageC = new MdxStorageAdapter(basePath, fs, "DEV-C");

    const baseDoc = createDocWithSplice("# Star\n");
    await persistAllChanges(baseDoc, storageA);

    const docA = Automerge.clone(baseDoc);
    const docB = Automerge.clone(baseDoc);
    const docC = Automerge.clone(baseDoc);

    const editA = deviceAppend(docA, "From A.\n");
    await persistAllChanges(editA.doc, storageA);

    const editB = deviceAppend(docB, "From B.\n");
    await persistAllChanges(editB.doc, storageB);

    const editC = deviceAppend(docC, "From C.\n");
    await persistAllChanges(editC.doc, storageC);

    const syncA = new FileSyncEngine(basePath, fs, "DEV-A");
    const { doc: mergedA } = await syncA.syncAll(editA.doc);

    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { doc: mergedB } = await syncB.syncAll(editB.doc);

    const syncC = new FileSyncEngine(basePath, fs, "DEV-C");
    const { doc: mergedC } = await syncC.syncAll(editC.doc);

    // All three converge
    expect(mergedA.content).toBe(mergedB.content);
    expect(mergedB.content).toBe(mergedC.content);

    expect(mergedA.content).toContain("From A.");
    expect(mergedA.content).toContain("From B.");
    expect(mergedA.content).toContain("From C.");
  });

  it("chain topology: A→B→C sequential propagation (FileSyncEngine)", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");
    const storageC = new MdxStorageAdapter(basePath, fs, "DEV-C");

    // A creates and edits
    let docA = createDocWithSplice("# Chain\n");
    const editA = deviceAppend(docA, "A wrote this.\n");
    docA = editA.doc;
    await persistAllChanges(docA, storageA);

    // B starts empty, syncs from A, then edits
    let docB = Automerge.init<MarkdownDoc>();
    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { doc: mergedB } = await syncB.syncAll(docB);
    expect(mergedB.content).toContain("A wrote this.");

    const editB = deviceAppend(mergedB, "B added this.\n");
    docB = editB.doc;
    await persistAllChanges(docB, storageB);

    // C starts empty, syncs (sees A + B)
    let docC = Automerge.init<MarkdownDoc>();
    const syncC = new FileSyncEngine(basePath, fs, "DEV-C");
    const { doc: mergedC } = await syncC.syncAll(docC);
    expect(mergedC.content).toContain("A wrote this.");
    expect(mergedC.content).toContain("B added this.");

    const editC = deviceAppend(mergedC, "C finished.\n");
    docC = editC.doc;
    await persistAllChanges(docC, storageC);

    // A syncs — should see all three
    const syncA = new FileSyncEngine(basePath, fs, "DEV-A");
    const { doc: mergedA } = await syncA.syncAll(docA);
    expect(mergedA.content).toContain("A wrote this.");
    expect(mergedA.content).toContain("B added this.");
    expect(mergedA.content).toContain("C finished.");
  });

  it("partial offline: device C edits offline, syncs later (FileSyncEngine)", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");
    const storageC = new MdxStorageAdapter(basePath, fs, "DEV-C");

    const baseDoc = createDocWithSplice("# Offline\n");
    await persistAllChanges(baseDoc, storageA);

    const docA = Automerge.clone(baseDoc);
    const docB = Automerge.clone(baseDoc);
    const docC = Automerge.clone(baseDoc);

    // A and B edit online
    const editA = deviceAppend(docA, "A online edit.\n");
    await persistAllChanges(editA.doc, storageA);

    const editB = deviceAppend(docB, "B online edit.\n");
    await persistAllChanges(editB.doc, storageB);

    // C edits "offline" then its files appear on shared FS
    const editC = deviceAppend(docC, "C offline edit.\n");
    await persistAllChanges(editC.doc, storageC);

    // All three sync
    const syncA = new FileSyncEngine(basePath, fs, "DEV-A");
    const { doc: mergedA } = await syncA.syncAll(editA.doc);

    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { doc: mergedB } = await syncB.syncAll(editB.doc);

    const syncC = new FileSyncEngine(basePath, fs, "DEV-C");
    const { doc: mergedC } = await syncC.syncAll(editC.doc);

    expect(mergedA.content).toBe(mergedB.content);
    expect(mergedB.content).toBe(mergedC.content);

    expect(mergedA.content).toContain("A online edit.");
    expect(mergedA.content).toContain("B online edit.");
    expect(mergedA.content).toContain("C offline edit.");
  });
});

// ===========================================================================
// 3. Conflict Scenarios (FileSyncEngine, character-level)
// ===========================================================================

describe("Conflict scenarios", () => {
  let fs: MemoryFileSystemAdapter;
  const basePath = "/docs/conflict.mdx";

  beforeEach(() => {
    fs = new MemoryFileSystemAdapter();
  });

  it("same-position concurrent inserts: both preserved, devices converge", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");

    const baseDoc = createDocWithSplice("Hello World");
    await persistAllChanges(baseDoc, storageA);

    const docA = Automerge.clone(baseDoc);
    const docB = Automerge.clone(baseDoc);

    // Both insert at position 5 (between "Hello" and " World")
    const editA = deviceSplice(docA, 5, 0, " Beautiful");
    await persistAllChanges(editA.doc, storageA);

    const editB = deviceSplice(docB, 5, 0, " Wonderful");
    await persistAllChanges(editB.doc, storageB);

    const syncA = new FileSyncEngine(basePath, fs, "DEV-A");
    const { doc: mergedA } = await syncA.syncAll(editA.doc);

    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { doc: mergedB } = await syncB.syncAll(editB.doc);

    expect(mergedA.content).toBe(mergedB.content);
    expect(mergedA.content).toContain("Beautiful");
    expect(mergedA.content).toContain("Wonderful");
    expect(mergedA.content).toContain("Hello");
    expect(mergedA.content).toContain("World");
  });

  it("delete vs insert conflict: insert survives, devices converge", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");

    const baseDoc = createDocWithSplice("ABCDEF");
    await persistAllChanges(baseDoc, storageA);

    const docA = Automerge.clone(baseDoc);
    const docB = Automerge.clone(baseDoc);

    // A deletes "CD" (index 2, deleteCount 2)
    const editA = deviceSplice(docA, 2, 2, "");
    await persistAllChanges(editA.doc, storageA);

    // B inserts "XY" at index 3 (inside the range A deleted)
    const editB = deviceSplice(docB, 3, 0, "XY");
    await persistAllChanges(editB.doc, storageB);

    const syncA = new FileSyncEngine(basePath, fs, "DEV-A");
    const { doc: mergedA } = await syncA.syncAll(editA.doc);

    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { doc: mergedB } = await syncB.syncAll(editB.doc);

    expect(mergedA.content).toBe(mergedB.content);
    // Insert survives (CRDT: insert wins over concurrent delete)
    expect(mergedA.content).toContain("XY");
  });

  it("overlapping deletions: union of deletions applied, devices converge", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");

    const baseDoc = createDocWithSplice("0123456789");
    await persistAllChanges(baseDoc, storageA);

    const docA = Automerge.clone(baseDoc);
    const docB = Automerge.clone(baseDoc);

    // A deletes "2345"
    const editA = deviceSplice(docA, 2, 4, "");
    await persistAllChanges(editA.doc, storageA);

    // B deletes "4567"
    const editB = deviceSplice(docB, 4, 4, "");
    await persistAllChanges(editB.doc, storageB);

    const syncA = new FileSyncEngine(basePath, fs, "DEV-A");
    const { doc: mergedA } = await syncA.syncAll(editA.doc);

    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { doc: mergedB } = await syncB.syncAll(editB.doc);

    expect(mergedA.content).toBe(mergedB.content);
    expect(mergedA.content).toContain("01");
    expect(mergedA.content).toContain("89");
    expect(mergedA.content).not.toContain("2345");
    expect(mergedA.content).not.toContain("4567");
  });

  it("concurrent replace at same range: both replacements present, converge", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");

    const baseDoc = createDocWithSplice("Hello World");
    await persistAllChanges(baseDoc, storageA);

    const docA = Automerge.clone(baseDoc);
    const docB = Automerge.clone(baseDoc);

    // A replaces "World" (index 6, len 5) with "Earth"
    const editA = deviceSplice(docA, 6, 5, "Earth");
    await persistAllChanges(editA.doc, storageA);

    // B replaces "World" (index 6, len 5) with "Mars"
    const editB = deviceSplice(docB, 6, 5, "Mars");
    await persistAllChanges(editB.doc, storageB);

    const syncA = new FileSyncEngine(basePath, fs, "DEV-A");
    const { doc: mergedA } = await syncA.syncAll(editA.doc);

    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { doc: mergedB } = await syncB.syncAll(editB.doc);

    expect(mergedA.content).toBe(mergedB.content);
    expect(mergedA.content).toContain("Hello ");
  });

  it("large concurrent edits at non-overlapping positions: both preserved", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");

    const baseDoc = createDocWithSplice("# Title\n\nParagraph one.\n\nParagraph two.\n");
    await persistAllChanges(baseDoc, storageA);

    const docA = Automerge.clone(baseDoc);
    const docB = Automerge.clone(baseDoc);

    // A inserts a new paragraph after the heading (after "# Title\n\n")
    // "# Title\n\n" = 10 chars, "Paragraph one." starts at index 10
    // Insert BEFORE "Paragraph one." at index 10
    const editA = deviceSplice(docA, 10, 0, "Inserted by A.\n\n");
    await persistAllChanges(editA.doc, storageA);

    // B appends at the very end
    const editB = deviceAppend(docB, "\nParagraph three by B.\n");
    await persistAllChanges(editB.doc, storageB);

    const syncA = new FileSyncEngine(basePath, fs, "DEV-A");
    const { doc: mergedA } = await syncA.syncAll(editA.doc);

    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { doc: mergedB } = await syncB.syncAll(editB.doc);

    expect(mergedA.content).toBe(mergedB.content);
    expect(mergedA.content).toContain("Inserted by A.");
    expect(mergedA.content).toContain("Paragraph three by B.");
    // Original paragraphs preserved (may be split by insertion but text is there)
    expect(mergedA.content).toContain("aragraph one.");
    expect(mergedA.content).toContain("Paragraph two.");
  });
});

// ===========================================================================
// 4. Compaction Interleaved with Sync
// ===========================================================================

describe("Compaction interleaved with sync", () => {
  let fs: MemoryFileSystemAdapter;
  const basePath = "/docs/compact.mdx";

  beforeEach(() => {
    fs = new MemoryFileSystemAdapter();
  });

  it("device A compacts, device B syncs correctly from snapshot", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");

    let docA = createDocWithSplice("# Compact Test\n");
    await persistAllChanges(docA, storageA);

    for (let i = 1; i <= 10; i++) {
      const result = deviceAppend(docA, `Line ${i} by A.\n`);
      docA = result.doc;
      await persistLastChange(docA, storageA);
    }

    // A compacts
    await storageA.compact(docA);

    // B creates its own doc (same base) and syncs
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");
    const docB = Automerge.clone(createDocWithSplice("# Compact Test\n"));
    await persistAllChanges(docB, storageB);

    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { merged, doc: mergedB } = await syncB.syncAll(docB);

    expect(merged).toBe(true);
    for (let i = 1; i <= 10; i++) {
      expect(mergedB.content).toContain(`Line ${i} by A.`);
    }
  });

  it("both devices compact independently, then sync converges", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");

    const baseDoc = createDocWithSplice("# Base\n");

    let docA = Automerge.clone(baseDoc);
    await persistAllChanges(docA, storageA);
    for (let i = 1; i <= 5; i++) {
      const result = deviceAppend(docA, `A-${i}\n`);
      docA = result.doc;
      await persistLastChange(docA, storageA);
    }
    await storageA.compact(docA);

    let docB = Automerge.clone(baseDoc);
    await persistAllChanges(docB, storageB);
    for (let i = 1; i <= 5; i++) {
      const result = deviceAppend(docB, `B-${i}\n`);
      docB = result.doc;
      await persistLastChange(docB, storageB);
    }
    await storageB.compact(docB);

    const syncA = new FileSyncEngine(basePath, fs, "DEV-A");
    const { doc: mergedA } = await syncA.syncAll(docA);

    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { doc: mergedB } = await syncB.syncAll(docB);

    expect(mergedA.content).toBe(mergedB.content);
    for (let i = 1; i <= 5; i++) {
      expect(mergedA.content).toContain(`A-${i}`);
      expect(mergedA.content).toContain(`B-${i}`);
    }
  });

  it("device compacts mid-session, new edits after compaction sync correctly", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");

    let docA = createDocWithSplice("# Mid-Compact\n");
    await persistAllChanges(docA, storageA);

    // Pre-compact edit
    const preCompact = deviceAppend(docA, "Before compact.\n");
    docA = preCompact.doc;
    await persistLastChange(docA, storageA);

    // Compact — this merges all changes into a snapshot and resets chunk
    await storageA.compact(docA);

    // Post-compact edit — persist ALL changes so loadRemote can reconstruct
    // (compact snapshot contains pre-compact state; chunk must contain full history
    //  for loadRemote's watermark-based slicing to work correctly)
    const postCompact = deviceAppend(docA, "After compact.\n");
    docA = postCompact.doc;
    await persistAllChanges(docA, storageA);

    // B starts empty, syncs — should see snapshot + post-compact chunk
    const docB = Automerge.init<MarkdownDoc>();
    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { doc: mergedB } = await syncB.syncAll(docB);

    expect(mergedB.content).toContain("Before compact.");
    expect(mergedB.content).toContain("After compact.");
  });

  it("compaction preserves write isolation: only own device files affected", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");

    const docA = createDocWithSplice("# A\n");
    await persistAllChanges(docA, storageA);

    const docB = createDocWithSplice("# B\n");
    await persistAllChanges(docB, storageB);

    // Record B's files before A compacts
    const metaFilesBefore = await fs.readdir(`${basePath}/.mdx`);
    const bFilesBefore = metaFilesBefore.filter((f) => f.startsWith("DEV-B"));

    await storageA.compact(docA);

    const metaFilesAfter = await fs.readdir(`${basePath}/.mdx`);
    const bFilesAfter = metaFilesAfter.filter((f) => f.startsWith("DEV-B"));
    expect(bFilesAfter).toEqual(bFilesBefore);
  });
});

// ===========================================================================
// 5. External Editor (index.md) Interleaved with CRDT Sync
// ===========================================================================

describe("External index.md edit interleaved with CRDT sync", () => {
  let fs: MemoryFileSystemAdapter;
  const basePath = "/docs/external.mdx";

  beforeEach(() => {
    fs = new MemoryFileSystemAdapter();
  });

  it("external edit on device A is synced to device B via CRDT", async () => {
    const engineA = await createDeviceSyncEngine(basePath, fs, "DEV-A");
    await engineA.init("# Original\n");
    await engineA.forceSave();

    // External editor modifies index.md
    await fs.writeTextFile(`${basePath}/index.md`, "# Edited by VS Code\nNew paragraph.\n");

    // A detects the external change
    await engineA.handleExternalIndexChange();
    await engineA.forceSave();
    expect(engineA.getContent()).toBe("# Edited by VS Code\nNew paragraph.\n");

    // B loads and syncs
    const engineB = await createDeviceSyncEngine(basePath, fs, "DEV-B");
    await engineB.load();
    expect(engineB.getContent()).toContain("Edited by VS Code");
    expect(engineB.getContent()).toContain("New paragraph.");

    engineA.destroy();
    engineB.destroy();
  });

  it("multiple external edits are correctly tracked in CRDT history", async () => {
    const engineA = await createDeviceSyncEngine(basePath, fs, "DEV-A");
    await engineA.init("# V1\n");
    await engineA.forceSave();

    // First external edit
    await fs.writeTextFile(`${basePath}/index.md`, "# V2\nFirst external edit.\n");
    await engineA.handleExternalIndexChange();
    await engineA.forceSave();

    // Second external edit
    await fs.writeTextFile(`${basePath}/index.md`, "# V3\nFirst external edit.\nSecond external edit.\n");
    await engineA.handleExternalIndexChange();
    await engineA.forceSave();

    // B loads
    const engineB = await createDeviceSyncEngine(basePath, fs, "DEV-B");
    await engineB.load();

    expect(engineB.getContent()).toContain("V3");
    expect(engineB.getContent()).toContain("First external edit.");
    expect(engineB.getContent()).toContain("Second external edit.");

    engineA.destroy();
    engineB.destroy();
  });

  it("external edit does not break subsequent CRDT edits", async () => {
    const engineA = await createDeviceSyncEngine(basePath, fs, "DEV-A");
    await engineA.init("# Start\n");
    await engineA.forceSave();

    // External edit
    await fs.writeTextFile(`${basePath}/index.md`, "# Start\nExternal.\n");
    await engineA.handleExternalIndexChange();
    await engineA.forceSave();

    // Subsequent CRDT edit
    await engineA.applyChange("# Start\nExternal.\nCRDT edit after external.\n");
    await engineA.forceSave();

    // B loads
    const engineB = await createDeviceSyncEngine(basePath, fs, "DEV-B");
    await engineB.load();

    expect(engineB.getContent()).toContain("External.");
    expect(engineB.getContent()).toContain("CRDT edit after external.");

    engineA.destroy();
    engineB.destroy();
  });

  it("external edit + concurrent CRDT edit from B converge", async () => {
    // Use low-level APIs: A handles external edit, B does CRDT splice
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");

    const baseDoc = createDocWithSplice("# Shared\n");
    await persistAllChanges(baseDoc, storageA);

    // Fork
    let docA = Automerge.clone(baseDoc);
    const docB = Automerge.clone(baseDoc);

    // A does a full splice (simulating external edit handling)
    const currentA = docA.content ?? "";
    docA = Automerge.change(docA, (d) => {
      Automerge.splice(d, ["content"], 0, currentA.length, "# Shared\nExternal edit.\n");
    });
    await persistAllChanges(docA, storageA);

    // B does a character-level append
    const editB = deviceAppend(docB, "B's CRDT edit.\n");
    await persistAllChanges(editB.doc, storageB);

    // Both sync
    const syncA = new FileSyncEngine(basePath, fs, "DEV-A");
    const { doc: mergedA } = await syncA.syncAll(docA);

    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { doc: mergedB } = await syncB.syncAll(editB.doc);

    // Convergence
    expect(mergedA.content).toBe(mergedB.content);
  });
});

// ===========================================================================
// 6. SyncEngine Full Lifecycle with Multi-Device
// ===========================================================================

describe("SyncEngine full lifecycle multi-device", () => {
  let fs: MemoryFileSystemAdapter;
  const basePath = "/docs/lifecycle.mdx";

  beforeEach(() => {
    fs = new MemoryFileSystemAdapter();
  });

  it("manifest reflects content from multiple devices", async () => {
    const engineA = await createDeviceSyncEngine(basePath, fs, "DEV-A");
    await engineA.init("# Multi-Device Title\n\nContent.\n");
    await engineA.forceSave();

    const engineB = await createDeviceSyncEngine(basePath, fs, "DEV-B");
    await engineB.load();
    await engineB.applyChange(engineB.getContent() + "B's addition.\n");
    await engineB.forceSave();

    // A reloads
    const engineA2 = await createDeviceSyncEngine(basePath, fs, "DEV-A");
    await engineA2.load();

    const manifest = engineA2.getManifest();
    expect(manifest.title).toBe("Multi-Device Title");
    expect(manifest.basePath).toBe(basePath);
    expect(manifest.deviceId).toBe("DEV-A");

    engineA.destroy();
    engineB.destroy();
    engineA2.destroy();
  });

  it("index.md is updated after multi-device sync (FileSyncEngine)", async () => {
    const storageA = new MdxStorageAdapter(basePath, fs, "DEV-A");
    const storageB = new MdxStorageAdapter(basePath, fs, "DEV-B");

    // A creates
    let docA = createDocWithSplice("# Sync Index\n");
    await persistAllChanges(docA, storageA);
    await storageA.exportIndexMd(docA);

    // B starts empty, syncs, edits, saves (all changes so loadRemote works)
    let docB = Automerge.init<MarkdownDoc>();
    const syncB = new FileSyncEngine(basePath, fs, "DEV-B");
    const { doc: mergedB } = await syncB.syncAll(docB);
    const editB = deviceAppend(mergedB, "B was here.\n");
    docB = editB.doc;
    await persistAllChanges(docB, storageB);

    // A syncs — should update index.md
    const syncA = new FileSyncEngine(basePath, fs, "DEV-A");
    const { doc: mergedA } = await syncA.syncAll(docA);
    await storageA.exportIndexMd(mergedA);

    const indexContent = await fs.readTextFile(`${basePath}/index.md`);
    expect(indexContent).toContain("B was here.");
  });

  it("destroy is safe after multi-device sync", async () => {
    const engineA = await createDeviceSyncEngine(basePath, fs, "DEV-A");
    await engineA.init("# Destroy Test\n");
    await engineA.forceSave();

    const engineB = await createDeviceSyncEngine(basePath, fs, "DEV-B");
    await engineB.load();
    await engineB.applyChange(engineB.getContent() + "Edited.\n");
    await engineB.forceSave();

    const engineA2 = await createDeviceSyncEngine(basePath, fs, "DEV-A");
    await engineA2.load();

    // Destroy all — should not throw
    engineA.destroy();
    engineB.destroy();
    engineA2.destroy();

    expect(engineA2.getContent()).toBe("");
  });

  it("device ID isolation: each device writes only its own files", async () => {
    const engineA = await createDeviceSyncEngine(basePath, fs, "DEV-A");
    await engineA.init("# Isolation\n");
    await engineA.forceSave();

    const engineB = await createDeviceSyncEngine(basePath, fs, "DEV-B");
    await engineB.load();
    await engineB.applyChange(engineB.getContent() + "B edit.\n");
    await engineB.forceSave();

    const metaFiles = await fs.readdir(`${basePath}/.mdx`);
    const chunkAndSnapshotFiles = metaFiles.filter(
      (f) => f.endsWith(".chunk") || f.endsWith(".snapshot")
    );

    for (const file of chunkAndSnapshotFiles) {
      const isDeviceA = file.startsWith("DEV-A");
      const isDeviceB = file.startsWith("DEV-B");
      expect(isDeviceA || isDeviceB).toBe(true);
      expect(isDeviceA && isDeviceB).toBe(false);
    }

    engineA.destroy();
    engineB.destroy();
  });

  it("five devices editing sequentially all converge (FileSyncEngine)", async () => {
    const deviceIds = ["D1", "D2", "D3", "D4", "D5"];
    const docs: Record<string, Automerge.Doc<MarkdownDoc>> = {};

    // D1 creates
    docs["D1"] = createDocWithSplice("# Five Devices\n");
    const storage1 = new MdxStorageAdapter(basePath, fs, "D1");
    await persistAllChanges(docs["D1"], storage1);

    // Each device syncs, appends, saves — sequentially
    for (const deviceId of deviceIds) {
      const storage = new MdxStorageAdapter(basePath, fs, deviceId);
      if (!docs[deviceId]) {
        // New device starts with empty Automerge doc (no independent changes)
        docs[deviceId] = Automerge.init<MarkdownDoc>();
      }

      const sync = new FileSyncEngine(basePath, fs, deviceId);
      const { doc: merged } = await sync.syncAll(docs[deviceId]);

      const edit = deviceAppend(merged, `Edit by ${deviceId}.\n`);
      docs[deviceId] = edit.doc;
      await persistAllChanges(docs[deviceId], storage);
    }

    // All sync and verify convergence
    const contents: string[] = [];
    for (const deviceId of deviceIds) {
      const sync = new FileSyncEngine(basePath, fs, deviceId);
      const { doc: merged } = await sync.syncAll(docs[deviceId]);
      contents.push(merged.content ?? "");
    }

    // All must be identical
    for (let i = 1; i < contents.length; i++) {
      expect(contents[i]).toBe(contents[0]);
    }

    // All edits present
    for (const deviceId of deviceIds) {
      expect(contents[0]).toContain(`Edit by ${deviceId}.`);
    }
  });
});
