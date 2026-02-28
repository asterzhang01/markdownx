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
  const [sidebarItems, setSidebarItems] = useState<FileItem[]>([]);
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
  const handleNewDocument = useCallback(async () => {
    if (window.electronAPI) {
      await window.electronAPI.document.new();
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

  // Handle rename document
  const handleRenameDocument = useCallback(async (oldPath: string, newName: string) => {
    if (!window.electronAPI) return;

    // Extract parent directory and construct new path
    const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newPath = `${parentDir}/${newName}`;

    // Check if new name already exists
    const exists = await window.electronAPI.fs.exists(newPath);
    if (exists) {
      alert('A file with this name already exists');
      return;
    }

    try {
      await window.electronAPI.fs.rename(oldPath, newPath);
      
      // Update sidebar items
      setSidebarItems(prev => prev.map(item => 
        item.path === oldPath 
          ? { ...item, name: newName, path: newPath }
          : item
      ));

      // If renamed document is currently open, update the state
      if (state.basePath === oldPath) {
        setState(prev => ({ ...prev, basePath: newPath }));
      }
    } catch (error) {
      console.error('Failed to rename document:', error);
      alert('Failed to rename document');
    }
  }, [state.basePath]);

  // Handle delete document
  const handleDeleteDocument = useCallback(async (path: string) => {
    if (!window.electronAPI) return;

    const confirmed = await window.electronAPI.dialog.showConfirm(
      '确定要删除这个文档吗？此操作无法撤销。'
    );
    
    if (!confirmed) return;

    try {
      // Check if it's a directory (mdx files are folders)
      const stat = await window.electronAPI.fs.stat(path);
      
      if (stat.isDirectory) {
        // Use fs:rm for recursive directory deletion
        await window.electronAPI.fs.rm(path);
      } else {
        // Use unlink for single files
        await window.electronAPI.fs.unlink(path);
      }
      
      // Remove from sidebar - filter out the deleted item and all its children
      setSidebarItems(prev => {
        const filtered = prev.filter(item => {
          // Remove the item itself
          if (item.path === path) return false;
          // Remove any children of this item (if it's a folder)
          if (item.path.startsWith(path + '/')) return false;
          return true;
        });
        return filtered;
      });

      // If deleted document is currently open, clear the state and notify main process to close it
      if (state.basePath === path) {
        // Close the current document in main process
        await window.electronAPI.document.close?.();
        
        // Reset the state to initial (show WelcomePage)
        setState({
          content: '',
          manifest: null,
          basePath: null,
          isDirty: false,
          lastSaved: null,
        });
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      alert('删除文档失败');
    }
  }, [state.basePath]);

  // Handle open in Finder
  const handleOpenInFinder = useCallback(async (path: string) => {
    if (!window.electronAPI) return;

    try {
      await window.electronAPI.shell.openPath(path);
    } catch (error) {
      console.error('Failed to open in Finder:', error);
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
      
      // Update sidebar with the opened document
      if (data.basePath) {
        const docName = data.basePath.split('/').pop() || 'Untitled';
        setSidebarItems([{
          name: docName,
          path: data.basePath,
          type: 'file',
        }]);
      }
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
        onRenameDocument={handleRenameDocument}
        onDeleteDocument={handleDeleteDocument}
        onOpenInFinder={handleOpenInFinder}
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
