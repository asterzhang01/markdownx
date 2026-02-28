/**
 * Automerge CRDT operations for MarkdownX
 * Handles document initialization, loading, saving, and merging
 */
import * as Automerge from '@automerge/automerge';
import type { DocState, InitDocOptions } from './types';

// Re-export Automerge types
export type { Doc } from '@automerge/automerge';

// Type for Automerge change callback
type ChangeFn<T> = (doc: T) => void;

/**
 * Initialize a new Automerge document with default state
 */
export function initDoc(options: InitDocOptions = {}): Automerge.Doc<DocState> {
  const { initialContent = '', title } = options;
  
  return Automerge.change(Automerge.init<DocState>(), (doc: DocState) => {
    doc.content = initialContent;
    doc.version = 1;
    doc.lastModified = Date.now();
    if (title) {
      doc.title = title;
    }
  });
}

/**
 * Load a document from binary Automerge format
 * 
 * @param binary - The binary data from state.bin
 * @returns The loaded document
 */
export function loadDoc(binary: Uint8Array): Automerge.Doc<DocState> {
  return Automerge.load<DocState>(binary);
}

/**
 * Save a document to binary Automerge format
 * 
 * @param doc - The document to save
 * @returns Binary data for storage in state.bin
 */
export function saveDoc(doc: Automerge.Doc<DocState>): Uint8Array {
  return Automerge.save(doc);
}

/**
 * Merge two documents (CRDT merge)
 * This is the core of conflict-free synchronization
 * 
 * @param local - Local document
 * @param remote - Remote document to merge
 * @returns Merged document
 */
export function mergeDocs(
  local: Automerge.Doc<DocState>,
  remote: Automerge.Doc<DocState>
): Automerge.Doc<DocState> {
  return Automerge.merge(local, remote);
}

/**
 * Update document content
 * This is the primary way to make changes to a document
 * 
 * @param doc - The document to update
 * @param newContent - New markdown content
 * @returns Updated document
 */
export function updateContent(
  doc: Automerge.Doc<DocState>,
  newContent: string
): Automerge.Doc<DocState> {
  return Automerge.change(doc, (d: DocState) => {
    d.content = newContent;
    d.version += 1;
    d.lastModified = Date.now();
  });
}

/**
 * Get the current content of a document
 */
export function getContent(doc: Automerge.Doc<DocState>): string {
  return doc.content;
}

/**
 * Get document metadata
 */
export function getMetadata(doc: Automerge.Doc<DocState>): {
  version: number;
  lastModified: number;
  title?: string;
} {
  return {
    version: doc.version,
    lastModified: doc.lastModified,
    title: doc.title,
  };
}

/**
 * Generate a sync message to send to another peer
 * This is used for incremental sync (more efficient than full merge)
 * 
 * @param doc - The local document
 * @param syncState - The sync state for this peer connection
 * @returns Binary sync message or null if no sync needed
 */
export function generateSyncMessage(
  doc: Automerge.Doc<DocState>,
  syncState: Automerge.SyncState
): [Automerge.SyncState, Uint8Array | null] {
  return Automerge.generateSyncMessage(doc, syncState);
}

/**
 * Receive a sync message from another peer
 * 
 * @param doc - The local document
 * @param syncState - The sync state for this peer connection
 * @param message - The binary sync message received
 * @returns Updated document
 */
export function receiveSyncMessage(
  doc: Automerge.Doc<DocState>,
  syncState: Automerge.SyncState,
  message: Uint8Array
): [Automerge.Doc<DocState>, Automerge.SyncState, null] {
  return Automerge.receiveSyncMessage(doc, syncState, message);
}

/**
 * Initialize a new sync state for a peer connection
 */
export function initSyncState(): Automerge.SyncState {
  return Automerge.initSyncState();
}

/**
 * Clone a document (creates an independent copy)
 */
export function cloneDoc(doc: Automerge.Doc<DocState>): Automerge.Doc<DocState> {
  return Automerge.clone(doc);
}

/**
 * Get the actor ID of the document
 * This identifies which device/user made changes
 */
export function getActorId(doc: Automerge.Doc<DocState>): string {
  // @ts-ignore - Automerge exposes this but types may not include it
  return Automerge.getActorId(doc);
}

/**
 * Fork a document (creates a new independent branch)
 * Useful for creating a copy before making experimental changes
 * Note: Uses clone as fork is not available in stable API
 */
export function forkDoc(doc: Automerge.Doc<DocState>): Automerge.Doc<DocState> {
  return Automerge.clone(doc);
}

/**
 * Check if two documents have the same content
 * This compares the actual state, not just the history
 */
export function equals(
  doc1: Automerge.Doc<DocState>,
  doc2: Automerge.Doc<DocState>
): boolean {
  return (
    doc1.content === doc2.content &&
    doc1.version === doc2.version &&
    doc1.lastModified === doc2.lastModified
  );
}
