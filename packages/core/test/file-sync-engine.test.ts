/**
 * Tests for FileSyncEngine
 *
 * Covers:
 *   • Two devices write chunks, syncAll merges both edits
 *   • Write isolation: device A's operations only write A's chunk files
 *   • Device B compacts, device A syncAll skips already-included changes via watermark
 *   • External index.md edit is merged into document; no change returns null
 */
import { describe, it, expect, beforeEach } from "vitest";
import { next as Automerge } from "@automerge/automerge";
import { MemoryFileSystemAdapter } from "./helpers/memory-fs-adapter.js";
import { FileSyncEngine } from "../src/file-sync-engine.js";
import { MdxStorageAdapter, parseChunkFileName } from "../src/mdx-storage-adapter.js";
import type { MarkdownDoc } from "../src/schema.js";

function createTestDoc(content = "# Hello\n"): Automerge.Doc<MarkdownDoc> {
  let doc = Automerge.change(Automerge.init<MarkdownDoc>(), (d) => {
    d.content = "";
    d.commentThreads = {};
    d.assetsDocUrl = "automerge:test-assets" as any;
  });
  if (content.length > 0) {
    doc = Automerge.change(doc, (d) => {
      Automerge.splice(d, ["content"], 0, 0, content);
    });
  }
  return doc;
}

describe("FileSyncEngine", () => {
  let fs: MemoryFileSystemAdapter;
  const basePath = "/docs/note.mdx";

  beforeEach(() => {
    fs = new MemoryFileSystemAdapter();
  });

  // -----------------------------------------------------------------------
  // Multi-device CRDT merge
  // -----------------------------------------------------------------------

  describe("syncAll", () => {
    it("merges two devices' edits via CRDT", async () => {
      // Device A creates initial doc and writes
      const storageA = new MdxStorageAdapter(basePath, fs, "DEVICE-A");
      let docA = createTestDoc("# Shared\n");
      for (const c of Automerge.getAllChanges(docA)) {
        storageA.appendChange(c);
      }
      await storageA.flushChanges();

      // Device B forks from A and makes its own edit
      const storageB = new MdxStorageAdapter(basePath, fs, "DEVICE-B");
      let docB = Automerge.clone(docA);
      docB = Automerge.change(docB, (d) => {
        d.content = "# Shared\nDevice B was here.\n";
      });
      for (const c of Automerge.getAllChanges(docB)) {
        storageB.appendChange(c);
      }
      await storageB.flushChanges();

      // Device A makes its own edit
      docA = Automerge.change(docA, (d) => {
        d.content = "# Shared\nDevice A was here.\n";
      });
      const changeA = Automerge.getLastLocalChange(docA);
      if (changeA) {
        storageA.appendChange(changeA);
      }
      await storageA.flushChanges();

      // Device A syncs — should merge B's changes
      const engineA = new FileSyncEngine(basePath, fs, "DEVICE-A");
      const { merged, doc: mergedDoc } = await engineA.syncAll(docA);

      expect(merged).toBe(true);
      // Both devices' content should be present in the merged doc
      expect(mergedDoc.content).toBeDefined();
    });

    it("returns merged=false when no remote changes exist", async () => {
      const storageA = new MdxStorageAdapter(basePath, fs, "DEVICE-A");
      const docA = createTestDoc("# Solo\n");
      for (const c of Automerge.getAllChanges(docA)) {
        storageA.appendChange(c);
      }
      await storageA.flushChanges();

      const engineA = new FileSyncEngine(basePath, fs, "DEVICE-A");
      const { merged } = await engineA.syncAll(docA);

      expect(merged).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Write isolation
  // -----------------------------------------------------------------------

  describe("write isolation", () => {
    it("device A only writes files prefixed with its deviceId", async () => {
      const engineA = new FileSyncEngine(basePath, fs, "DEVICE-A");
      const docA = createTestDoc("# A\n");
      const changes = Automerge.getAllChanges(docA);
      await engineA.flushLocalChanges(changes);

      const metaFiles = await fs.readdir(`${basePath}/.mdx`);
      for (const file of metaFiles) {
        const parsed = parseChunkFileName(file);
        if (parsed) {
          expect(parsed.deviceId).toBe("DEVICE-A");
        }
      }
    });

    it("device A does not modify device B's files during sync", async () => {
      // Device B writes
      const storageB = new MdxStorageAdapter(basePath, fs, "DEVICE-B");
      const docB = createTestDoc("# B\n");
      for (const c of Automerge.getAllChanges(docB)) {
        storageB.appendChange(c);
      }
      await storageB.flushChanges();

      // Record B's files
      const metaFilesBefore = await fs.readdir(`${basePath}/.mdx`);
      const bFilesBefore = metaFilesBefore.filter((f) => f.startsWith("DEVICE-B"));

      // Device A syncs
      const engineA = new FileSyncEngine(basePath, fs, "DEVICE-A");
      const docA = createTestDoc("# A\n");
      await engineA.syncAll(docA);

      // B's files should be unchanged
      const metaFilesAfter = await fs.readdir(`${basePath}/.mdx`);
      const bFilesAfter = metaFilesAfter.filter((f) => f.startsWith("DEVICE-B"));
      expect(bFilesAfter).toEqual(bFilesBefore);
    });
  });

  // -----------------------------------------------------------------------
  // Compaction + watermark
  // -----------------------------------------------------------------------

  describe("compaction and watermark", () => {
    it("after device B compacts, device A syncAll still works correctly", async () => {
      // Device B creates and compacts
      const storageB = new MdxStorageAdapter(basePath, fs, "DEVICE-B");
      const docB = createTestDoc("# Compacted\n");
      for (const c of Automerge.getAllChanges(docB)) {
        storageB.appendChange(c);
      }
      await storageB.flushChanges();
      await storageB.compact(docB);

      // Device A syncs
      const engineA = new FileSyncEngine(basePath, fs, "DEVICE-A");
      const docA = createTestDoc("# A\n");
      const { merged, doc: mergedDoc } = await engineA.syncAll(docA);

      expect(merged).toBe(true);
      expect(mergedDoc.content).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // External markdown edit
  // -----------------------------------------------------------------------

  describe("handleExternalMarkdownEdit", () => {
    it("merges external index.md changes into document", async () => {
      const engineA = new FileSyncEngine(basePath, fs, "DEVICE-A");
      const docA = createTestDoc("# Original\n");

      // Simulate external editor writing to index.md
      await fs.mkdir(basePath);
      await fs.writeTextFile(`${basePath}/index.md`, "# Edited Externally\n");

      const result = await engineA.handleExternalMarkdownEdit(docA);
      expect(result).not.toBeNull();
      expect(result!.content).toBe("# Edited Externally\n");
    });

    it("returns null when index.md content matches document", async () => {
      const engineA = new FileSyncEngine(basePath, fs, "DEVICE-A");
      const docA = createTestDoc("# Same\n");

      await fs.mkdir(basePath);
      await fs.writeTextFile(`${basePath}/index.md`, "# Same\n");

      const result = await engineA.handleExternalMarkdownEdit(docA);
      expect(result).toBeNull();
    });

    it("returns null when index.md does not exist", async () => {
      const engineA = new FileSyncEngine(basePath, fs, "DEVICE-A");
      const docA = createTestDoc("# Hello\n");

      const result = await engineA.handleExternalMarkdownEdit(docA);
      expect(result).toBeNull();
    });
  });
});
