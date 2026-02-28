/**
 * MarkdownX Editor App
 * Main application wrapper for the web editor
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Editor, type EditorHandle } from './Editor';
import { bridge } from './bridge';
import type { Manifest } from '@markdownx/core';

export interface AppProps {
  /** Base path for the document (optional, can be set via bridge) */
  basePath?: string;
  /** Initial content (optional, can be loaded via bridge) */
  initialContent?: string;
  /** Manifest data (optional, can be loaded via bridge) */
  manifest?: Manifest;
}

export function App({ basePath, initialContent = '' }: AppProps) {
  const [content, setContent] = useState(initialContent);
  const [isLoading, setIsLoading] = useState(false);
  const [validation] = useState<'ok' | 'read-only' | 'blocked'>('ok');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const editorRef = useRef<EditorHandle>(null);

  // Handle content changes
  const handleChange = useCallback((newContent: string) => {
    setContent(newContent);
    setIsDirty(true);
  }, []);

  // Handle save
  const handleSave = useCallback((savedContent: string) => {
    bridge.save(savedContent);
    setLastSaved(new Date());
    setIsDirty(false);
  }, []);

  // Listen for messages from native
  useEffect(() => {
    const unsubscribe = bridge.onMessage((message) => {
      switch (message.type) {
        case 'LOADED':
          setContent(message.content);
          setIsLoading(false);
          setIsDirty(false);
          // Determine validation from manifest
          if (message.manifest) {
            // Simple validation check based on format version
            // More complex logic would be in the core package
          }
          break;
        case 'SAVED':
          setLastSaved(new Date());
          setIsDirty(false);
          break;
        case 'EXTERNAL_CHANGE':
          setContent(message.content);
          setIsDirty(false);
          break;
        case 'ERROR':
          console.error('Bridge error:', message.message);
          setIsLoading(false);
          break;
      }
    });

    // Request load if basePath is provided
    if (basePath) {
      setIsLoading(true);
      bridge.requestLoad(basePath);
    }

    return unsubscribe;
  }, [basePath]);

  // Warn before unload if dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (validation === 'blocked') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center p-8">
          <h2 className="text-xl font-semibold text-red-600 mb-2">
            Incompatible Document
          </h2>
          <p className="text-gray-600">
            This document was created with a newer version of MarkdownX.
            Please update the app to open this file.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b text-sm text-gray-600">
        <div className="flex items-center gap-4">
          {validation === 'read-only' && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
              Read-only (newer format)
            </span>
          )}
          {isDirty && (
            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">
              Unsaved changes
            </span>
          )}
        </div>
        <div>
          {lastSaved && (
            <span>Last saved: {lastSaved.toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto">
        <Editor
          ref={editorRef}
          initialContent={content}
          onChange={handleChange}
          onSave={handleSave}
          readOnly={validation === 'read-only'}
          basePath={basePath}
          className="h-full"
        />
      </div>
    </div>
  );
}

export default App;
