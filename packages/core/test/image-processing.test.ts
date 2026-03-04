/**
 * Tests for image processing utilities
 *
 * Covers:
 *   • processImage writes file with SHA-256 hash-based name
 *   • processImage returns correct relative path for Markdown embedding
 *   • processImage deduplicates identical files (idempotent)
 *   • processImage infers correct content type from extension
 *   • processImage handles files without extension
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryFileSystemAdapter } from "./helpers/memory-fs-adapter.js";
import { processImage } from "../src/image-processing.js";

describe("processImage", () => {
  let fs: MemoryFileSystemAdapter;
  const assetsDir = "/docs/note.mdx/assets";

  beforeEach(() => {
    fs = new MemoryFileSystemAdapter();
  });

  it("writes file with SHA-256 hash-based filename", async () => {
    const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const result = await processImage(data, "photo.png", assetsDir, fs);

    expect(result.filename).toMatch(/^[a-f0-9]{64}\.png$/);
    expect(result.relativePath).toBe(`assets/${result.filename}`);
    expect(result.absolutePath).toBe(`${assetsDir}/${result.filename}`);
    expect(result.contentType).toBe("image/png");

    const written = await fs.readFile(result.absolutePath);
    expect(written).toEqual(data);
  });

  it("returns correct relative path for Markdown embedding", async () => {
    const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

    const result = await processImage(data, "vacation.jpg", assetsDir, fs);

    expect(result.relativePath).toMatch(/^assets\/[a-f0-9]{64}\.jpg$/);
    expect(result.contentType).toBe("image/jpeg");
  });

  it("deduplicates identical files (idempotent)", async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    const result1 = await processImage(data, "file1.png", assetsDir, fs);
    const result2 = await processImage(data, "file2.png", assetsDir, fs);

    expect(result1.filename).toBe(result2.filename);
    expect(result1.absolutePath).toBe(result2.absolutePath);

    const allFiles = fs.listAllPaths().filter((p) => p.startsWith(assetsDir));
    expect(allFiles.length).toBe(1);
  });

  it("different data produces different filenames", async () => {
    const data1 = new Uint8Array([1, 2, 3]);
    const data2 = new Uint8Array([4, 5, 6]);

    const result1 = await processImage(data1, "a.png", assetsDir, fs);
    const result2 = await processImage(data2, "b.png", assetsDir, fs);

    expect(result1.filename).not.toBe(result2.filename);
  });

  it("infers correct content type from extension", async () => {
    const data = new Uint8Array([0]);

    const png = await processImage(data, "test.png", assetsDir, fs);
    expect(png.contentType).toBe("image/png");

    const data2 = new Uint8Array([1]);
    const jpeg = await processImage(data2, "test.jpeg", assetsDir, fs);
    expect(jpeg.contentType).toBe("image/jpeg");

    const data3 = new Uint8Array([2]);
    const webp = await processImage(data3, "test.webp", assetsDir, fs);
    expect(webp.contentType).toBe("image/webp");

    const data4 = new Uint8Array([3]);
    const gif = await processImage(data4, "test.gif", assetsDir, fs);
    expect(gif.contentType).toBe("image/gif");

    const data5 = new Uint8Array([4]);
    const svg = await processImage(data5, "test.svg", assetsDir, fs);
    expect(svg.contentType).toBe("image/svg+xml");

    const data6 = new Uint8Array([5]);
    const pdf = await processImage(data6, "test.pdf", assetsDir, fs);
    expect(pdf.contentType).toBe("application/pdf");
  });

  it("handles files without extension", async () => {
    const data = new Uint8Array([10, 20, 30]);

    const result = await processImage(data, "noext", assetsDir, fs);

    expect(result.filename).toMatch(/^[a-f0-9]{64}\.bin$/);
    expect(result.contentType).toBe("application/octet-stream");
  });

  it("preserves extension case as lowercase", async () => {
    const data = new Uint8Array([7, 8, 9]);

    const result = await processImage(data, "Photo.PNG", assetsDir, fs);

    expect(result.filename).toMatch(/\.png$/);
    expect(result.contentType).toBe("image/png");
  });
});
