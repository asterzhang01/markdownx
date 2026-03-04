/**
 * Bridge protocol types for Native-WebView communication.
 *
 * Used by @markdownx/editor-web to communicate with native layers
 * (Electron main process, React Native host).
 */

/** Document manifest — metadata about a loaded .mdx document */
export interface Manifest {
  /** Absolute path to the .mdx document directory */
  basePath: string;
  /** Device ID of the current device */
  deviceId: string;
  /** Format version for forward compatibility */
  formatVersion: string;
  /** ISO 8601 timestamp of last modification */
  lastModified?: string;
  /** Document title extracted from content */
  title?: string;
}

/**
 * Union of all bridge messages exchanged between
 * the web editor and the native host.
 */
export type BridgeMessage =
  | { type: "LOAD"; basePath: string }
  | { type: "SAVE"; content: string }
  | { type: "CONTENT_CHANGED"; content: string }
  | { type: "EXTERNAL_CHANGE"; content: string }
  | { type: "UPLOAD_IMAGE"; id: string; data: ArrayBuffer; fileName: string }
  | { type: "UPLOAD_IMAGE_RESULT"; id: string; path: string }
  | { type: "UPLOAD_IMAGE_ERROR"; id: string; error: string }
  | { type: "DOCUMENT_LOADED"; content: string; manifest: Manifest }
  | { type: "DOCUMENT_SAVED" }
  | { type: "ERROR"; message: string };
