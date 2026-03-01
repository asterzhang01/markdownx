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
  children?: FileItem[] | undefined; // undefined = not loaded yet (lazy loading)
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
  const [openMode, setOpenMode] = useState<'file' | 'folder' | null>(null);
  const [watchedFolder, setWatchedFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
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
    if (!window.electronAPI) return;

    const newPath = await window.electronAPI.document.new();

    if (newPath) {
      if (openMode === 'folder' && watchedFolder) {
        // In folder mode, new file will trigger watcher to auto-refresh
        // No need to manually refresh
      } else {
        // Single file mode, switch to single file view
        // newPath is the .mdx folder path, display it directly
        setOpenMode('file');
        setWatchedFolder(null);
        setSidebarItems([{
          name: newPath.split('/').pop() || 'Untitled',
          path: newPath,
          type: 'file',
        }]);
      }
    }
  }, [openMode, watchedFolder]);

  // Handle open document request
  const handleOpenDocument = useCallback(async () => {
    if (!window.electronAPI) return;

    // Trigger open dialog in main process
    await window.electronAPI.document.open();
  }, []);

  // Handle file selection from sidebar
  const handleFileSelect = useCallback(async (path: string) => {
    if (!window.electronAPI) return;

    // Load the selected mdx document
    setIsLoading(true);
    
    // Request main process to load this document
    await window.electronAPI.document.load(path);
  }, []);

  // Handle folder toggle (expand/collapse) with lazy loading
  // Helper function: find item by path recursively
  const findItemByPath = (items: FileItem[], path: string): FileItem | null => {
    for (const item of items) {
      if (item.path === path) return item;
      if (item.children) {
        const found = findItemByPath(item.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  // Helper function: update children for a specific path
  const updateItemChildren = (
    items: FileItem[],
    path: string,
    children: FileItem[]
  ): FileItem[] => {
    return items.map(item => {
      if (item.path === path) {
        return { ...item, children };
      }
      if (item.children) {
        return { ...item, children: updateItemChildren(item.children, path, children) };
      }
      return item;
    });
  };

  // Helper function: sort file items (folders first, then alphabetically)
  const sortFileItems = (a: FileItem, b: FileItem): number => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'folder' ? -1 : 1;
  };

  const handleFolderToggle = useCallback(async (path: string) => {
    const isExpanded = expandedFolders.has(path);
    
    if (isExpanded) {
      // Collapse: remove from expanded set
      setExpandedFolders(prev => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    } else {
      // Expand: check if we need to load children
      const folderItem = findItemByPath(sidebarItems, path);
      
      if (folderItem && folderItem.children === undefined && window.electronAPI) {
        // Need to load children asynchronously
        setLoadingFolders(prev => new Set(prev).add(path));
        
        try {
          const children = await window.electronAPI.folder.loadChildren(path);
          // Update sidebarItems with loaded children
          setSidebarItems(prev => updateItemChildren(prev, path, children));
        } catch (error) {
          console.error('Failed to load folder children:', error);
        } finally {
          setLoadingFolders(prev => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        }
      }
      
      setExpandedFolders(prev => new Set(prev).add(path));
    }
  }, [sidebarItems, expandedFolders]);

  // Handle rename document
  const handleRenameDocument = useCallback(async (oldPath: string, newName: string) => {
    if (!window.electronAPI) return;

    // Extract parent directory and construct new path
    const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
    
    // Get the original file type (mdx file or regular folder)
    // If original had .mdx extension, add it to the new name
    const oldName = oldPath.split('/').pop() || '';
    const hasMdxExtension = oldName.endsWith('.mdx');
    
    // Add .mdx extension if the original was an mdx file
    const finalName = hasMdxExtension && !newName.endsWith('.mdx')
      ? `${newName}.mdx`
      : newName;
    
    const newPath = `${parentDir}/${finalName}`;

    // Check if new name already exists
    const exists = await window.electronAPI.fs.exists(newPath);
    if (exists) {
      alert('A file with this name already exists');
      return;
    }

    try {
      await window.electronAPI.fs.rename(oldPath, newPath);
      
      // Update sidebar items manually since there's no watcher in file mode
      setSidebarItems(prev => prev.map(item => {
        if (item.path === oldPath) {
          return {
            ...item,
            name: finalName,
            path: newPath,
          };
        }
        return item;
      }));
      
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

    // Folder loaded (legacy event, can be removed later)
    window.electronAPI.onFolderLoaded((data) => {
      setSidebarItems(data.fileTree);
      setIsLoading(false);
    });

    // Single file opened mode
    window.electronAPI.onFileOpened((data) => {
      setOpenMode('file');
      setWatchedFolder(null);
      setSidebarItems([{
        name: data.name,
        path: data.path,
        type: 'file',
      }]);
      setIsLoading(false);
    });

    // Folder opened mode
    window.electronAPI.onFolderOpened((data) => {
      setOpenMode('folder');
      setWatchedFolder(data.folderPath);
      setSidebarItems(data.files);
      setIsLoading(false);
    });

    // Folder changed (file added/removed)
    window.electronAPI.onFolderChanged((change) => {
      if (change.type === 'add' && change.item) {
        setSidebarItems(prev => {
          // Check if item already exists (avoid duplicates)
          const exists = prev.some(item => item.path === change.item!.path);
          if (exists) {
            return prev;
          }
          return [...prev, change.item!];
        });
      } else if (change.type === 'remove' && change.path) {
        setSidebarItems(prev => prev.filter(item => item.path !== change.path));
      }
    });

    // Folder children changed (from file system watcher)
    const unsubscribeFolderChildrenChanged = window.electronAPI.onFolderChildrenChanged((change) => {
      setSidebarItems(prev => {
        const parentItem = findItemByPath(prev, change.parentPath);
        if (!parentItem) return prev;
        
        // If parent has no children loaded yet, ignore the change
        if (parentItem.children === undefined) return prev;
        
        let newChildren = [...parentItem.children];
        
        if (change.type === 'add' && change.item) {
          // Avoid duplicates
          if (!newChildren.some(c => c.path === change.item!.path)) {
            newChildren.push(change.item);
            newChildren.sort(sortFileItems);
          }
        } else if (change.type === 'remove' && change.path) {
          newChildren = newChildren.filter(c => c.path !== change.path);
        }
        
        return updateItemChildren(prev, change.parentPath, newChildren);
      });
    });

    return () => {
      window.electronAPI.removeAllListeners('document:loaded');
      window.electronAPI.removeAllListeners('document:saved');
      window.electronAPI.removeAllListeners('document:external-change');
      window.electronAPI.removeAllListeners('folder:loaded');
      window.electronAPI.removeAllListeners('file:opened');
      window.electronAPI.removeAllListeners('folder:opened');
      window.electronAPI.removeAllListeners('folder:changed');
      unsubscribeFolderChildrenChanged();
    };
  }, []);

  // Determine if sidebar should be shown (only when a document/folder is open)
  const showSidebar = state.basePath !== null || sidebarItems.length > 0;

  return (
    <div className="flex h-screen bg-white">
      {/* Left Sidebar - only show when document/folder is open */}
      {showSidebar && (
        <Sidebar
          items={sidebarItems}
          currentPath={state.basePath}
          expandedFolders={expandedFolders}
          loadingFolders={loadingFolders}
          onFileSelect={handleFileSelect}
          onFolderToggle={handleFolderToggle}
          onNewDocument={handleNewDocument}
          onOpenDocument={handleOpenDocument}
          onRenameDocument={handleRenameDocument}
          onDeleteDocument={handleDeleteDocument}
          onOpenInFinder={handleOpenInFinder}
        />
      )}

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
