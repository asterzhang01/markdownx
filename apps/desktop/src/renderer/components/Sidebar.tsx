/**
 * Sidebar Component - Left navigation panel with react-arborist
 * Supports multi-level directories, drag & drop, inline rename
 */
import { useState, useRef, useCallback } from 'react';
import { Tree, NodeRendererProps, NodeApi, TreeApi } from 'react-arborist';
import {
  FolderIcon,
  DocumentIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  FolderOpenIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ExternalLinkIcon,
} from './icons';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { InputDialog } from './InputDialog';

export interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileItem[] | undefined; // undefined = not loaded yet
}

// TreeNode type for react-arborist (using path as id)
export interface TreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
  isLoading?: boolean;
}

interface SidebarProps {
  items: FileItem[];
  currentPath: string | null;
  expandedFolders: Set<string>;
  loadingFolders: Set<string>;
  rootPath: string | null;
  onFileSelect: (path: string) => void;
  onFolderToggle: (path: string) => void;
  onNewDocument: () => void;
  onOpenDocument: () => void;
  onRenameDocument?: (path: string, newName: string) => void;
  onDeleteDocument?: (path: string) => void;
  onOpenInFinder?: (path: string) => void;
  onCreateFolder?: (parentPath: string | null, name: string) => void;
  onCreateFile?: (parentPath: string | null, name: string) => void;
}

// Convert FileItem[] to TreeNode[] for react-arborist
function convertToTreeData(items: FileItem[], loadingFolders: Set<string>): TreeNode[] {
  return items.map((item) => ({
    id: item.path,
    name: item.name,
    type: item.type,
    isLoading: loadingFolders.has(item.path),
    children: item.children ? convertToTreeData(item.children, loadingFolders) : undefined,
  }));
}

// Custom Node Renderer
function Node({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const isFolder = node.data.type === 'folder';
  const isLoading = node.data.isLoading;

  // Remove .mdx extension from display name
  const displayName = node.data.name.endsWith('.mdx')
    ? node.data.name.slice(0, -4)
    : node.data.name;

  return (
    <div
      style={style}
      ref={dragHandle}
      className={`flex items-center gap-1 px-2 py-1.5 text-sm rounded-md cursor-pointer transition-colors ${
        node.isSelected
          ? 'bg-blue-100 text-blue-900'
          : 'text-gray-700 hover:bg-gray-100'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        if (isFolder) {
          node.toggle();
        } else {
          node.select();
          node.activate();
        }
      }}
    >
      {/* Expand/Collapse Arrow for folders */}
      {isFolder && (
        <span className="flex-shrink-0 w-4 h-4 text-gray-400">
          {isLoading ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : node.isOpen ? (
            <ChevronDownIcon className="w-4 h-4" />
          ) : (
            <ChevronRightIcon className="w-4 h-4" />
          )}
        </span>
      )}

      {/* Icon */}
      {isFolder ? (
        node.isOpen ? (
          <FolderOpenIcon className="w-4 h-4 flex-shrink-0 text-yellow-500" />
        ) : (
          <FolderIcon className="w-4 h-4 flex-shrink-0 text-yellow-500" />
        )
      ) : (
        <DocumentIcon className="w-4 h-4 flex-shrink-0 text-blue-500" />
      )}

      {/* Name (editable when in edit mode) */}
      {node.isEditing ? (
        <input
          type="text"
          defaultValue={displayName}
          autoFocus
          className="flex-1 px-1 py-0.5 text-sm border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-200"
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            const value = e.currentTarget.value.trim();
            if (value && value !== displayName) {
              node.submit(value);
            } else {
              node.reset();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              node.reset();
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              const value = e.currentTarget.value.trim();
              if (value && value !== displayName) {
                node.submit(value);
              } else {
                node.reset();
              }
            }
          }}
        />
      ) : (
        <span className="truncate">{displayName}</span>
      )}
    </div>
  );
}

export function Sidebar({
  items,
  currentPath,
  expandedFolders: _expandedFolders,
  loadingFolders,
  rootPath: _rootPath,
  onFileSelect,
  onFolderToggle,
  onNewDocument,
  onOpenDocument: _onOpenDocument,
  onRenameDocument,
  onDeleteDocument,
  onOpenInFinder,
  onCreateFolder,
  onCreateFile,
}: SidebarProps) {
  const treeRef = useRef<TreeApi<TreeNode>>(null);
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number } | null;
    node: NodeApi<TreeNode> | null;
  }>({ position: null, node: null });

  // Input dialog state
  const [inputDialog, setInputDialog] = useState<{
    isOpen: boolean;
    title: string;
    placeholder?: string;
    onConfirm: (value: string) => void;
  }>({
    isOpen: false,
    title: '',
    onConfirm: () => {},
  });

  // Convert FileItem to TreeNode format
  const treeData = convertToTreeData(items, loadingFolders);

  // Handle node click (file selection)
  const handleActivate = useCallback(
    (node: NodeApi<TreeNode>) => {
      if (node.data.type === 'file') {
        onFileSelect(node.data.id);
      }
    },
    [onFileSelect]
  );

  // Handle folder toggle for lazy loading
  const handleToggle = useCallback(
    (id: string) => {
      onFolderToggle(id);
    },
    [onFolderToggle]
  );

  // Handle rename submission
  const handleRename = useCallback(
    ({ id, name }: { id: string; name: string }) => {
      if (onRenameDocument && name.trim()) {
        onRenameDocument(id, name.trim());
      }
    },
    [onRenameDocument]
  );

  // Handle delete
  const handleDelete = useCallback(
    ({ ids }: { ids: string[] }) => {
      if (onDeleteDocument && ids.length > 0) {
        onDeleteDocument(ids[0]);
      }
    },
    [onDeleteDocument]
  );

  // Context menu handlers
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: NodeApi<TreeNode> | null) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        position: { x: e.clientX, y: e.clientY },
        node,
      });
    },
    []
  );

  const handleEmptyAreaContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      node: null,
    });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu({ position: null, node: null });
  }, []);

  const handleStartRename = useCallback(() => {
    if (contextMenu.node) {
      contextMenu.node.edit();
      handleCloseContextMenu();
    }
  }, [contextMenu.node, handleCloseContextMenu]);

  const handleDeleteItem = useCallback(() => {
    if (contextMenu.node && onDeleteDocument) {
      onDeleteDocument(contextMenu.node.data.id);
      handleCloseContextMenu();
    }
  }, [contextMenu.node, onDeleteDocument, handleCloseContextMenu]);

  const handleOpenInFinderItem = useCallback(() => {
    if (contextMenu.node && onOpenInFinder) {
      onOpenInFinder(contextMenu.node.data.id);
      handleCloseContextMenu();
    }
  }, [contextMenu.node, onOpenInFinder, handleCloseContextMenu]);

  const handleNewDocumentInRoot = useCallback(() => {
    if (onCreateFile) {
      setInputDialog({
        isOpen: true,
        title: '新建文档',
        placeholder: '输入文档名称',
        onConfirm: (name) => {
          onCreateFile(null, name);
          setInputDialog((prev) => ({ ...prev, isOpen: false }));
        },
      });
    }
    handleCloseContextMenu();
  }, [onCreateFile, handleCloseContextMenu]);

  const handleNewFolderInRoot = useCallback(() => {
    if (onCreateFolder) {
      setInputDialog({
        isOpen: true,
        title: '新建文件夹',
        placeholder: '输入文件夹名称',
        onConfirm: (name) => {
          onCreateFolder(null, name);
          setInputDialog((prev) => ({ ...prev, isOpen: false }));
        },
      });
    }
    handleCloseContextMenu();
  }, [onCreateFolder, handleCloseContextMenu]);

  const handleNewDocumentInFolder = useCallback(() => {
    if (contextMenu.node && onCreateFile) {
      const folderPath = contextMenu.node.data.id;
      // 如果目录未展开，先展开它
      if (!contextMenu.node.isOpen) {
        contextMenu.node.toggle();
      }
      setInputDialog({
        isOpen: true,
        title: '新建文档',
        placeholder: '输入文档名称',
        onConfirm: (name) => {
          onCreateFile(folderPath, name);
          setInputDialog((prev) => ({ ...prev, isOpen: false }));
        },
      });
    }
    handleCloseContextMenu();
  }, [contextMenu.node, onCreateFile, handleCloseContextMenu]);

  const handleNewFolderInFolder = useCallback(() => {
    if (contextMenu.node && onCreateFolder) {
      const folderPath = contextMenu.node.data.id;
      // 如果目录未展开，先展开它
      if (!contextMenu.node.isOpen) {
        contextMenu.node.toggle();
      }
      setInputDialog({
        isOpen: true,
        title: '新建文件夹',
        placeholder: '输入文件夹名称',
        onConfirm: (name) => {
          onCreateFolder(folderPath, name);
          setInputDialog((prev) => ({ ...prev, isOpen: false }));
        },
      });
    }
    handleCloseContextMenu();
  }, [contextMenu.node, onCreateFolder, handleCloseContextMenu]);

  // Build context menu items
  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    // Empty area context menu (root directory)
    if (!contextMenu.node) {
      const menuItems: ContextMenuItem[] = [
        {
          label: '新建文档',
          icon: <PlusIcon className="w-4 h-4" />,
          onClick: handleNewDocumentInRoot,
        },
      ];
      if (onCreateFolder) {
        menuItems.push({
          label: '新建文件夹',
          icon: <FolderIcon className="w-4 h-4" />,
          onClick: handleNewFolderInRoot,
        });
      }
      return menuItems;
    }

    // Folder context menu
    if (contextMenu.node.data.type === 'folder') {
      const menuItems: ContextMenuItem[] = [];
      if (onCreateFile) {
        menuItems.push({
          label: '新建文档',
          icon: <PlusIcon className="w-4 h-4" />,
          onClick: handleNewDocumentInFolder,
        });
      }
      if (onCreateFolder) {
        menuItems.push({
          label: '新建文件夹',
          icon: <FolderIcon className="w-4 h-4" />,
          onClick: handleNewFolderInFolder,
        });
      }
      if (menuItems.length > 0) {
        menuItems.push({
          label: '',
          separator: true,
          onClick: () => {},
        });
      }
      menuItems.push(
        {
          label: '重命名',
          icon: <PencilIcon className="w-4 h-4" />,
          onClick: handleStartRename,
        },
        {
          label: '在 Finder 中打开',
          icon: <ExternalLinkIcon className="w-4 h-4" />,
          onClick: handleOpenInFinderItem,
        },
        {
          label: '',
          separator: true,
          onClick: () => {},
        },
        {
          label: '删除',
          icon: <TrashIcon className="w-4 h-4" />,
          onClick: handleDeleteItem,
          danger: true,
        }
      );
      return menuItems;
    }

    // File context menu
    return [
      {
        label: '重命名',
        icon: <PencilIcon className="w-4 h-4" />,
        onClick: handleStartRename,
      },
      {
        label: '在 Finder 中打开',
        icon: <ExternalLinkIcon className="w-4 h-4" />,
        onClick: handleOpenInFinderItem,
      },
      {
        label: '',
        separator: true,
        onClick: () => {},
      },
      {
        label: '删除',
        icon: <TrashIcon className="w-4 h-4" />,
        onClick: handleDeleteItem,
        danger: true,
      },
    ];
  }, [
    contextMenu.node,
    handleNewDocumentInRoot,
    handleNewFolderInRoot,
    handleNewDocumentInFolder,
    handleNewFolderInFolder,
    handleStartRename,
    handleOpenInFinderItem,
    handleDeleteItem,
    onCreateFile,
    onCreateFolder,
  ]);

  // Custom row renderer with context menu
  const renderRow = useCallback(
    (props: NodeRendererProps<TreeNode>) => {
      return (
        <div
          onContextMenu={(e) => handleContextMenu(e, props.node)}
        >
          <Node {...props} />
        </div>
      );
    },
    [handleContextMenu]
  );

  return (
    <div className="w-64 h-full bg-gray-50 border-r border-gray-200 flex flex-col">
      {/* Title bar spacer for macOS */}
      <div className="h-8 bg-gray-100 app-drag" />

      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Explorer
        </h2>
      </div>

      {/* File tree */}
      <div
        className="flex-1 overflow-hidden py-2"
        onContextMenu={handleEmptyAreaContextMenu}
      >
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-500 mb-4">No files or folders opened</p>
            <p className="text-xs text-gray-400">
              Create a new document or open an existing one
            </p>
          </div>
        ) : (
          <Tree<TreeNode>
            ref={treeRef}
            data={treeData}
            openByDefault={false}
            width="100%"
            height={600}
            indent={16}
            rowHeight={32}
            paddingTop={0}
            paddingBottom={8}
            selection={currentPath || undefined}
            onActivate={handleActivate}
            onToggle={handleToggle}
            onRename={handleRename}
            onDelete={handleDelete}
            disableDrag={true}
            disableDrop={true}
          >
            {renderRow}
          </Tree>
        )}
      </div>

      {/* Context Menu */}
      <ContextMenu
        items={getContextMenuItems()}
        position={contextMenu.position}
        onClose={handleCloseContextMenu}
      />

      {/* Input Dialog */}
      <InputDialog
        isOpen={inputDialog.isOpen}
        title={inputDialog.title}
        placeholder={inputDialog.placeholder}
        onConfirm={inputDialog.onConfirm}
        onCancel={() => setInputDialog((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Footer info */}
      <div className="px-3 py-2 border-t border-gray-200 text-xs text-gray-400">
        <p>MarkdownX v1.0</p>
      </div>
    </div>
  );
}
