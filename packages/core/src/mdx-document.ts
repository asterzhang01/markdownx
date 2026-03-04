/**
 * .mdx document utilities
 *
 * High-level helpers for detecting, creating, and validating
 * MarkdownX document directories.
 *
 * A valid .mdx document is a directory containing:
 *   - index.md          (human-readable golden copy)
 *   - .mdx/             (sync metadata directory)
 *   - assets/            (content-addressed resources, optional)
 */
import type { FileSystemAdapter } from "./fs-adapter.js";

/**
 * Check whether a given path is a valid MarkdownX document directory.
 *
 * A directory is considered a valid .mdx document if it contains
 * an `index.md` file and a `.mdx/` metadata subdirectory.
 */
export async function isMarkdownXDocument(
  path: string,
  fsAdapter: FileSystemAdapter
): Promise<boolean> {
  try {
    const hasIndexMd = await fsAdapter.exists(`${path}/index.md`);
    const hasMetaDir = await fsAdapter.exists(`${path}/.mdx`);
    return hasIndexMd && hasMetaDir;
  } catch {
    return false;
  }
}

/**
 * Create a new MarkdownX document directory with default structure.
 *
 * Creates:
 *   path/
 *   ├── index.md          ← default content
 *   ├── assets/            ← empty directory for resources
 *   └── .mdx/              ← empty directory for sync metadata
 *
 * @returns The basePath of the created document (same as input path).
 */
export async function createMarkdownXDocument(
  path: string,
  fsAdapter: FileSystemAdapter,
  initialContent = "# Untitled\n\n"
): Promise<string> {
  await fsAdapter.mkdir(path);
  await fsAdapter.mkdir(`${path}/.mdx`);
  await fsAdapter.mkdir(`${path}/assets`);
  await fsAdapter.writeTextFile(`${path}/index.md`, initialContent);
  // Write a marker file so the .mdx directory is detectable even on
  // flat-namespace file systems (e.g. MemoryFileSystemAdapter).
  const markerPath = `${path}/.mdx/.initialized`;
  if (!(await fsAdapter.exists(markerPath))) {
    await fsAdapter.writeTextFile(markerPath, new Date().toISOString());
  }
  return path;
}
