/**
 * @markdownx/core
 *
 * Phase 1 deliverables:
 *   1. Storage    — MdxStorageAdapter (automerge-repo → .mdx file structure)
 *   2. Sync       — FileSyncEngine (serverless multi-device CRDT sync)
 *   3. Operations — DocumentOperations (document mutation abstraction)
 *   4. AI         — AIServiceRegistry (interface-only, no implementation)
 *
 * Phase 2 deliverables:
 *   5. NodeFileSystemAdapter — Node.js file system adapter for Electron
 *   6. SyncEngine            — High-level orchestrator for .mdx document lifecycle
 *   7. Document utilities    — isMarkdownXDocument, createMarkdownXDocument
 *   8. Image processing      — processImage (content-addressed asset storage)
 *   9. Bridge types          — BridgeMessage, Manifest for native-web communication
 */

// Schema types
export type {
  Comment,
  CommentThread,
  CommentThreadForUI,
  AIMetadata,
  MarkdownDoc,
  FileEntry,
  AssetsDoc,
  DocLink,
  FolderDoc,
  ChunkFileMetadata,
  SnapshotFileMetadata,
} from "./schema.js";

// Operation types
export type {
  TextSpliceOperation,
  AssetUploadOperation,
  AssetDeleteOperation,
  AddCommentThreadOperation,
  ReplyToCommentOperation,
  ResolveCommentOperation,
  FolderRenameOperation,
  FolderAddDocOperation,
  FolderRemoveDocOperation,
  DocumentOperation,
} from "./operations.js";

// FileSystem adapter
export { MemoryFileSystemAdapter } from "./fs-adapter.js";
export type { FileSystemAdapter } from "./fs-adapter.js";

// Node.js file system adapter (Phase 2)
export { NodeFileSystemAdapter, createNodeFsAdapter } from "./node-fs-adapter.js";

// Storage adapter
export {
  MdxStorageAdapter,
  chunkFileName,
  snapshotFileName,
  parseChunkFileName,
  parseSnapshotFileName,
} from "./mdx-storage-adapter.js";

// Document operations
export {
  splice,
  uploadAsset,
  deleteAsset,
  addCommentThread,
  replyToCommentThread,
  resolveCommentThread,
  folderRename,
  folderAddDoc,
  folderRemoveDoc,
  initDocument,
  initAssetsDoc,
  initFolderDoc,
  extractTitle,
  resolveCommentThreadPositions,
} from "./document-operations.js";

// Low-level sync engine (Phase 1)
export { FileSyncEngine } from "./file-sync-engine.js";

// High-level sync engine (Phase 2)
export { SyncEngine, createSyncEngine } from "./sync-engine.js";
export type { SyncEngineOptions } from "./sync-engine.js";

// Document utilities (Phase 2)
export { isMarkdownXDocument, createMarkdownXDocument } from "./mdx-document.js";

// Image processing (Phase 2)
export { processImage } from "./image-processing.js";
export type { AssetInfo } from "./image-processing.js";

// Bridge types (Phase 2)
export type { BridgeMessage, Manifest } from "./bridge-types.js";

// AI interfaces (types only)
export type {
  AICompletionProvider,
  SemanticSearchResult,
  AISemanticSearchProvider,
  DocumentAnalysisResult,
  AIDocumentAnalysisProvider,
  AIServiceRegistry,
} from "./ai-interfaces.js";
