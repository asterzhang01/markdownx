/**
 * Tests for SyncEngine (high-level orchestrator)
 *
 * Covers:
 *   • init creates a new document with default content
 *   • load reads existing document from disk
 *   • applyChange updates content via CRDT splice
 *   • forceSave persists changes and exports index.md
 *   • handleExternalIndexChange detects and merges external edits
 *   • getContent / getManifest / getAssetsDir return correct values
 *   • destroy cleans up resources safely
 *   • createSyncEngine factory works correctly
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryFileSystemAdapter } from "./helpers/memory-fs-adapter.js";
import { SyncEngine, createSyncEngine } from "../src/sync-engine.js";
import { createMarkdownXDocument } from "../src/mdx-document.js";

describe("SyncEngine", () => {
  let fs: MemoryFileSystemAdapter;
  const basePath = "/docs/note.mdx";

  beforeEach(() => {
    fs = new MemoryFileSystemAdapter();
  });

  // -----------------------------------------------------------------------
  // Initialisation
  // -----------------------------------------------------------------------

  describe("init", () => {
    it("creates a new document with default content", async () => {
      const engine = new SyncEngine({ basePath, fsAdapter: fs });
      await engine.init();

      expect(engine.getContent()).toBe("# Untitled\n\n");

      const indexContent = await fs.readTextFile(`${basePath}/index.md`);
      expect(indexContent).toBe("# Untitled\n\n");

      engine.destroy();
    });

    it("creates a new document with custom content", async () => {
      const engine = new SyncEngine({ basePath, fsAdapter: fs });
      await engine.init("# Custom Title\n\nHello world.\n");

      expect(engine.getContent()).toBe("# Custom Title\n\nHello world.\n");

      engine.destroy();
    });

    it("creates .mdx metadata directory", async () => {
      const engine = new SyncEngine({ basePath, fsAdapter: fs });
      await engine.init();

      const metaFiles = await fs.readdir(`${basePath}/.mdx`);
      expect(metaFiles.length).toBeGreaterThan(0);

      engine.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // Load
  // -----------------------------------------------------------------------

  describe("load", () => {
    it("loads existing document from disk", async () => {
      // First create a document
      const engine1 = new SyncEngine({ basePath, fsAdapter: fs });
      await engine1.init("# Existing\n\nContent here.\n");
      await engine1.forceSave();
      engine1.destroy();

      // Load it in a new engine
      const engine2 = new SyncEngine({ basePath, fsAdapter: fs });
      await engine2.load();

      expect(engine2.getContent()).toBe("# Existing\n\nContent here.\n");

      engine2.destroy();
    });

    it("bootstraps from index.md when no CRDT data exists", async () => {
      // Create directory structure manually (simulating a plain .mdx folder)
      await createMarkdownXDocument(basePath, fs, "# From Index\n\nBootstrapped.\n");

      const engine = new SyncEngine({ basePath, fsAdapter: fs });
      await engine.load();

      expect(engine.getContent()).toBe("# From Index\n\nBootstrapped.\n");

      engine.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // Content mutations
  // -----------------------------------------------------------------------

  describe("applyChange", () => {
    it("updates content via CRDT splice", async () => {
      const engine = new SyncEngine({ basePath, fsAdapter: fs });
      await engine.init("# Hello\n");

      await engine.applyChange("# Hello World\n");

      expect(engine.getContent()).toBe("# Hello World\n");

      engine.destroy();
    });

    it("no-ops when content is unchanged", async () => {
      const engine = new SyncEngine({ basePath, fsAdapter: fs });
      await engine.init("# Same\n");

      await engine.applyChange("# Same\n");

      expect(engine.getContent()).toBe("# Same\n");

      engine.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------------

  describe("forceSave", () => {
    it("persists changes and exports index.md", async () => {
      const engine = new SyncEngine({ basePath, fsAdapter: fs });
      await engine.init("# Original\n");

      await engine.applyChange("# Updated\n");
      await engine.forceSave();

      const indexContent = await fs.readTextFile(`${basePath}/index.md`);
      expect(indexContent).toBe("# Updated\n");

      engine.destroy();
    });

    it("is safe to call multiple times", async () => {
      const engine = new SyncEngine({ basePath, fsAdapter: fs });
      await engine.init("# Test\n");

      await engine.forceSave();
      await engine.forceSave();
      await engine.forceSave();

      expect(engine.getContent()).toBe("# Test\n");

      engine.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // External changes
  // -----------------------------------------------------------------------

  describe("handleExternalIndexChange", () => {
    it("detects and merges external edits to index.md", async () => {
      let externalContent = "";
      const engine = new SyncEngine({
        basePath,
        fsAdapter: fs,
        onExternalChange: (content) => {
          externalContent = content;
        },
      });
      await engine.init("# Original\n");
      await engine.forceSave();

      // Simulate external editor modifying index.md
      await fs.writeTextFile(`${basePath}/index.md`, "# Edited by VS Code\n");

      await engine.handleExternalIndexChange();

      expect(engine.getContent()).toBe("# Edited by VS Code\n");
      expect(externalContent).toBe("# Edited by VS Code\n");

      engine.destroy();
    });

    it("does nothing when index.md matches current content", async () => {
      let callbackCalled = false;
      const engine = new SyncEngine({
        basePath,
        fsAdapter: fs,
        onExternalChange: () => {
          callbackCalled = true;
        },
      });
      await engine.init("# Same\n");
      await engine.forceSave();

      await engine.handleExternalIndexChange();

      expect(callbackCalled).toBe(false);

      engine.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  describe("getManifest", () => {
    it("returns manifest with correct fields", async () => {
      const engine = new SyncEngine({ basePath, fsAdapter: fs });
      await engine.init("# My Title\n\nSome content.\n");

      const manifest = engine.getManifest();

      expect(manifest.basePath).toBe(basePath);
      expect(manifest.deviceId).toBeDefined();
      expect(manifest.deviceId.length).toBeGreaterThan(0);
      expect(manifest.formatVersion).toBe("1.0");
      expect(manifest.title).toBe("My Title");
      expect(manifest.lastModified).toBeDefined();

      engine.destroy();
    });
  });

  describe("getAssetsDir", () => {
    it("returns correct assets directory path", async () => {
      const engine = new SyncEngine({ basePath, fsAdapter: fs });
      await engine.init();

      expect(engine.getAssetsDir()).toBe(`${basePath}/assets`);

      engine.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // Destroy
  // -----------------------------------------------------------------------

  describe("destroy", () => {
    it("is safe to call multiple times", () => {
      const engine = new SyncEngine({ basePath, fsAdapter: fs });

      engine.destroy();
      engine.destroy();
      engine.destroy();
    });

    it("getContent returns empty string after destroy", async () => {
      const engine = new SyncEngine({ basePath, fsAdapter: fs });
      await engine.init("# Hello\n");

      engine.destroy();

      expect(engine.getContent()).toBe("");
    });
  });

  // -----------------------------------------------------------------------
  // Factory
  // -----------------------------------------------------------------------

  describe("createSyncEngine", () => {
    it("creates a SyncEngine instance", () => {
      const engine = createSyncEngine({ basePath, fsAdapter: fs });

      expect(engine).toBeInstanceOf(SyncEngine);

      engine.destroy();
    });

    it("created engine can init and load", async () => {
      const engine1 = createSyncEngine({ basePath, fsAdapter: fs });
      await engine1.init("# Factory Test\n");
      await engine1.forceSave();
      engine1.destroy();

      const engine2 = createSyncEngine({ basePath, fsAdapter: fs });
      await engine2.load();
      expect(engine2.getContent()).toBe("# Factory Test\n");
      engine2.destroy();
    });
  });
});
