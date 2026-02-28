/**
 * Renderer Process - Main App Component
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Editor, type EditorHandle } from '@markdownx/editor-web';
import type { Manifest } from '@markdownx/core';

interface DocumentState {
  content: string;
  manifest: Manifest | null;
  basePath: string | null;
  isDirty: boolean;
  lastSaved: Date | null;
}

export function App() {
  const [state, setState] = useState<DocumentState>({
    content: '',
    manifest: null,
    basePath: null,
    isDirty: false,
    lastSaved: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const editorRef = useRef<EditorHandle>(null);

  // Handle content changes
  const handleChange = useCallback((newContent: string) => {
    setState(prev => ({
      ...prev,
      content: newContent,
      isDirty: true,
    }));
  }, []);

  // Handle save
  const handleSave = useCallback(async (content: string) => {
    if (!window.electronAPI) return;

    const success = await window.electronAPI.document.save(content);
    if (success) {
      setState(prev => ({
        ...prev,
        isDirty: false,
        lastSaved: new Date(),
      }));
    }
  }, []);

  // Listen for document events from main process
  useEffect(() => {
    if (!window.electronAPI) return;

    // Document loaded
    window.electronAPI.onDocumentLoaded((data) => {
      setState({
        content: data.content,
        manifest: data.manifest as Manifest,
        basePath: data.basePath,
        isDirty: false,
        lastSaved: null,
      });
      setIsLoading(false);
      
      // Update editor content
      editorRef.current?.setContent(data.content);
    });

    // Document saved
    window.electronAPI.onDocumentSaved(() => {
      setState(prev => ({
        ...prev,
        isDirty: false,
        lastSaved: new Date(),
      }));
    });

    // External change detected
    window.electronAPI.onExternalChange((content) => {
      setState(prev => ({
        ...prev,
        content,
        isDirty: false,
      }));
      editorRef.current?.setContent(content);
    });

    return () => {
      window.electronAPI.removeAllListeners('document:loaded');
      window.electronAPI.removeAllListeners('document:saved');
      window.electronAPI.removeAllListeners('document:external-change');
    };
  }, []);

  // Welcome screen when no document is open
  if (!state.basePath && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">MarkdownX</h1>
          <p className="text-gray-600 mb-8">
            Local-first, AI-ready note taking
          </p>
          <div className="flex gap-4">
            <p className="text-gray-500 text-sm">
              Use File menu to create or open a document
            </p>
          </div>
          <div className="mt-8 text-sm text-gray-400">
            <p>Cmd+N - New Document</p>
            <p>Cmd+O - Open Document</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Title bar spacer for macOS */}
      <div className="h-8 bg-gray-100 flex items-center justify-center text-sm text-gray-500 app-drag">
        {state.basePath?.split('/').pop()}
        {state.isDirty && ' (Unsaved)'}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b text-sm text-gray-600">
        <div className="flex items-center gap-4">
          {state.isDirty && (
            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">
              Unsaved changes
            </span>
          )}
        </div>
        <div>
          {state.lastSaved && (
            <span>Last saved: {state.lastSaved.toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto bg-white">
        <Editor
          ref={editorRef}
          initialContent={state.content}
          onChange={handleChange}
          onSave={handleSave}
          basePath={state.basePath || undefined}
          className="h-full"
        />
      </div>
    </div>
  );
}

export default App;
