/**
 * Renderer Process - Main App Component
 * Layout: Left sidebar (navigation) + Right content (welcome/editor)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { EditorHandle } from '@markdownx/editor-web';
import type { Manifest } from '@markdownx/core';
import { Sidebar } from './components/Sidebar';
import { WelcomePage } from './components/WelcomePage';
import { EditorPage } from './components/EditorPage';

interface DocumentState {
  content: string;
  manifest: Manifest | null;
  basePath: string | null;
  isDirty: boolean;
  lastSaved: Date | null;
}

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileItem[];
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
  const [sidebarItems] = useState<FileItem[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // Handle new document request
  const handleNewDocument = useCallback(() => {
    // Trigger main process dialog via keyboard shortcut simulation
    // or expose a new IPC method
    if (window.electronAPI) {
      // For now, we'll use the menu shortcut
      // In production, add: window.electronAPI.document.new()
    }
  }, []);

  // Handle open document request
  const handleOpenDocument = useCallback(() => {
    // Similar to above
  }, []);

  // Handle file selection from sidebar
  const handleFileSelect = useCallback((path: string) => {
    // Load the selected file
    console.log('Selected file:', path);
  }, []);

  // Handle folder selection from sidebar
  const handleFolderSelect = useCallback((path: string) => {
    // Expand/collapse folder or load folder contents
    console.log('Selected folder:', path);
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

  return (
    <div className="flex h-screen bg-white">
      {/* Left Sidebar */}
      <Sidebar
        items={sidebarItems}
        currentPath={state.basePath}
        onFileSelect={handleFileSelect}
        onFolderSelect={handleFolderSelect}
        onNewDocument={handleNewDocument}
        onOpenDocument={handleOpenDocument}
      />

      {/* Right Content Area */}
      {!state.basePath && !isLoading ? (
        <WelcomePage
          onNewDocument={handleNewDocument}
          onOpenDocument={handleOpenDocument}
        />
      ) : (
        <EditorPage
          content={state.content}
          basePath={state.basePath || ''}
          manifest={state.manifest}
          isDirty={state.isDirty}
          lastSaved={state.lastSaved}
          isLoading={isLoading}
          onChange={handleChange}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

export default App;
