/**
 * Bridge protocol for Native-WebView communication
 * Handles messaging between the web editor and native layer (Electron/React Native)
 */
import type { BridgeMessage, Manifest } from '@markdownx/core';

type MessageHandler = (message: BridgeMessage) => void;

/**
 * Bridge singleton for handling native communication
 */
class Bridge {
  private handlers = new Set<MessageHandler>();
  private imageUploadCallbacks = new Map<string, {
    resolve: (path: string) => void;
    reject: (error: Error) => void;
  }>();
  private isNativeContext = false;
  private uploadRequestId = 0;

  constructor() {
    this.setupMessageListener();
    this.detectNativeContext();
  }

  /**
   * Detect if running inside a native container (Electron/WebView)
   */
  private detectNativeContext(): void {
    // Check for Electron
    if (typeof window !== 'undefined') {
      // Check for electron preload bridge
      this.isNativeContext = !!(
        (window as { electronAPI?: unknown }).electronAPI ||
        (window as { ReactNativeWebView?: unknown }).ReactNativeWebView
      );
    }
  }

  /**
   * Setup message listener for native -> web communication
   */
  private setupMessageListener(): void {
    if (typeof window === 'undefined') return;

    // Handle messages from React Native WebView
    window.addEventListener('message', (event) => {
      this.handleMessage(event.data);
    });

    // Handle messages from Electron (via preload)
    const electronAPI = (window as unknown as { electronAPI?: { onMessage?: (cb: (msg: BridgeMessage) => void) => void } }).electronAPI;
    if (electronAPI?.onMessage) {
      electronAPI.onMessage((message) => {
        this.handleMessage(message);
      });
    }
  }

  /**
   * Handle incoming message from native
   */
  private handleMessage(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    
    const message = data as BridgeMessage;
    
    // Handle upload image results
    if (message.type === 'UPLOAD_IMAGE_RESULT') {
      const callback = this.imageUploadCallbacks.get(message.id);
      if (callback) {
        callback.resolve(message.path);
        this.imageUploadCallbacks.delete(message.id);
      }
      return;
    }

    if (message.type === 'UPLOAD_IMAGE_ERROR') {
      const callback = this.imageUploadCallbacks.get(message.id);
      if (callback) {
        callback.reject(new Error(message.error));
        this.imageUploadCallbacks.delete(message.id);
      }
      return;
    }

    // Notify all handlers
    this.handlers.forEach(handler => handler(message));
  }

  /**
   * Send message to native layer
   */
  sendMessage(message: BridgeMessage): void {
    if (typeof window === 'undefined') return;

    // Send to React Native WebView
    const rnWebView = (window as unknown as { ReactNativeWebView?: { postMessage: (msg: string) => void } }).ReactNativeWebView;
    if (rnWebView) {
      rnWebView.postMessage(JSON.stringify(message));
      return;
    }

    // Send to Electron
    const electronAPISend = (window as unknown as { electronAPI?: { sendMessage?: (msg: BridgeMessage) => void } }).electronAPI;
    if (electronAPISend?.sendMessage) {
      electronAPISend.sendMessage(message);
      return;
    }

    // Fallback: log for debugging
    console.log('[Bridge] No native context, message:', message);
  }

  /**
   * Subscribe to incoming messages
   */
  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Request document load
   */
  requestLoad(basePath: string): void {
    this.sendMessage({ type: 'LOAD', basePath });
  }

  /**
   * Save document content
   */
  save(content: string): void {
    this.sendMessage({ type: 'SAVE', content });
  }

  /**
   * Set save handler for direct calls
   */
  setSaveHandler(_handler: (content: string) => void): void {
    // TODO: Implement save handler
  }

  /**
   * Upload an image and get the relative path
   * Returns a promise that resolves with the relative path for markdown
   */
  async uploadImage(file: File): Promise<string> {
    const id = `upload_${++this.uploadRequestId}_${Date.now()}`;
    
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Create promise for async response
    const promise = new Promise<string>((resolve, reject) => {
      this.imageUploadCallbacks.set(id, { resolve, reject });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.imageUploadCallbacks.has(id)) {
          this.imageUploadCallbacks.delete(id);
          reject(new Error('Image upload timeout'));
        }
      }, 30000);
    });

    // Send upload request
    this.sendMessage({
      type: 'UPLOAD_IMAGE',
      id,
      data: arrayBuffer,
      fileName: file.name,
    });

    return promise;
  }

  /**
   * Check if running in native context
   */
  isNative(): boolean {
    return this.isNativeContext;
  }
}

// Export singleton instance
export const bridge = new Bridge();

// Export types
export type { BridgeMessage, Manifest };
