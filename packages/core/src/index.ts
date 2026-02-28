/**
 * @markdownx/core
 * Core logic for MarkdownX - CRDT, Dual-Write, Asset Management
 */

// Types
export type {
  Manifest,
  DocState,
  ManifestValidationResult,
  FileSystemAdapter,
  InitDocOptions,
  LoadDocResult,
  AssetInfo,
  BridgeMessage,
  SyncEngineConfig,
} from './types';

// Automerge operations
export {
  initDoc,
  loadDoc,
  saveDoc,
  mergeDocs,
  updateContent,
  getContent,
  getMetadata,
  generateSyncMessage,
  receiveSyncMessage,
  initSyncState,
  cloneDoc,
  getActorId,
  forkDoc,
  equals,
} from './automerge';
export type { Doc } from './automerge';

// Manifest management
export {
  CURRENT_FORMAT_VERSION,
  CURRENT_MIN_READER_VERSION,
  APP_VERSION,
  createDefaultManifest,
  validateManifest,
  hasFeature,
  addFeature,
  upgradeManifest,
  serializeManifest,
  parseManifest,
  getValidationMessage,
} from './manifest';

// Asset management
export {
  calculateHash,
  getFileExtension,
  getMimeType,
  processImage,
  processImageFromFile,
  processImageFromBase64,
  resolveAssetPath,
  listAssets,
  deleteAsset,
  cleanupUnusedAssets,
  assetToDataURL,
} from './asset-manager';

// Sync Engine
export {
  SyncEngine,
  createSyncEngine,
  isMarkdownXDocument,
  createMarkdownXDocument,
} from './sync-engine';

// FileSystem Adapters
export {
  createNodeFsAdapter,
  createMemoryFsAdapter,
  createIpcFsAdapter,
} from './fs-adapter';
