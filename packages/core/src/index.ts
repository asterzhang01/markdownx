/**
 * @markdownx/core
 *
 * Phase 1 deliverables:
 *   1. Storage    — MdxStorageAdapter (automerge-repo → .mdx file structure)
 *   2. Sync       — FileSyncEngine (serverless multi-device CRDT sync)
 *   3. Operations — DocumentOperations (document mutation abstraction)
 *   4. AI         — AIServiceRegistry (interface-only, no implementation)
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

// Sync engine
export { FileSyncEngine } from "./file-sync-engine.js";

// AI interfaces (types only)
export type {
  AICompletionProvider,
  SemanticSearchResult,
  AISemanticSearchProvider,
  DocumentAnalysisResult,
  AIDocumentAnalysisProvider,
  AIServiceRegistry,
} from "./ai-interfaces.js";
