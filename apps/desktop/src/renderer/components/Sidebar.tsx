/**
 * Sidebar Component - Left navigation panel
 * Supports opening files and folder directories
 */
import { useState } from 'react';
import {
  FolderIcon,
  DocumentIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  FolderOpenIcon,
  PencilIcon,
  TrashIcon,
  ExternalLinkIcon,
} from './icons';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';

export interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileItem[] | undefined; // undefined = not loaded yet
}

interface SidebarProps {
  items: FileItem[];
  currentPath: string | null;
  expandedFolders: Set<string>;
  loadingFolders: Set<string>;
  onFileSelect: (path: string) => void;
  onFolderToggle: (path: string) => void;
  onNewDocument: () => void;
  onOpenDocument: () => void;
  onRenameDocument?: (path: string, newName: string) => void;
  onDeleteDocument?: (path: string) => void;
  onOpenInFinder?: (path: string) => void;
}

function FileTreeItem({
  item,
  level,
  currentPath,
  isExpanded,
  isLoading,
  onFileSelect,
  onToggle,
  onContextMenu,
}: {
  item: FileItem;
  level: number;
  currentPath: string | null;
  isExpanded: boolean;
  isLoading: boolean;
  onFileSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onContextMenu?: (e: React.MouseEvent, item: FileItem) => void;
}) {
  const isSelected = currentPath === item.path;
  const paddingLeft = `${level * 12 + 8}px`;
  const hasChildrenLoaded = item.children !== undefined;

  const handleClick = () => {
    if (item.type === 'folder') {
      onToggle(item.path);
    } else {
      onFileSelect(item.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e, item);
  };

  return (
    <div>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`w-full flex items-center gap-1 px-2 py-1.5 text-sm text-left rounded-md transition-colors ${
          isSelected
            ? 'bg-blue-100 text-blue-900'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
        style={{ paddingLeft }}
      >
        {item.type === 'folder' && (
          <span className="flex-shrink-0 w-4 h-4 text-gray-400">
            {isLoading ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : isExpanded ? (
              <ChevronDownIcon className="w-4 h-4" />
            ) : (
              <ChevronRightIcon className="w-4 h-4" />
            )}
          </span>
        )}
        {item.type === 'folder' ? (
          isExpanded ? (
            <FolderOpenIcon className="w-4 h-4 flex-shrink-0 text-yellow-500" />
          ) : (
            <FolderIcon className="w-4 h-4 flex-shrink-0 text-yellow-500" />
          )
        ) : (
          <DocumentIcon className="w-4 h-4 flex-shrink-0 text-blue-500" />
        )}
        <span className="truncate">{item.name}</span>
      </button>
      {item.type === 'folder' && isExpanded && hasChildrenLoaded && item.children && (
        <div>
          {item.children.map((child) => (
            <FileTreeItem
              key={child.path}
              item={child}
              level={level + 1}
              currentPath={currentPath}
              isExpanded={false} // Will be controlled by parent
              isLoading={false}  // Will be controlled by parent
              onFileSelect={onFileSelect}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  items,
  currentPath,
  expandedFolders,
  loadingFolders,
  onFileSelect,
  onFolderToggle,
  onNewDocument,
  onOpenDocument,
  onRenameDocument,
  onDeleteDocument,
  onOpenInFinder,
}: SidebarProps) {
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number } | null;
    item: FileItem | null;
  }>({ position: null, item: null });
  const [editingItem, setEditingItem] = useState<FileItem | null>(null);
  const [editName, setEditName] = useState('');

  const handleContextMenu = (e: React.MouseEvent, item: FileItem) => {
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      item,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu({ position: null, item: null });
  };

  const handleStartRename = () => {
    if (contextMenu.item) {
      setEditingItem(contextMenu.item);
      setEditName(contextMenu.item.name);
      handleCloseContextMenu();
    }
  };

  const handleConfirmRename = () => {
    if (editingItem && editName.trim() && editName.trim() !== editingItem.name) {
      onRenameDocument?.(editingItem.path, editName.trim());
    }
    setEditingItem(null);
    setEditName('');
  };

  const handleCancelRename = () => {
    setEditingItem(null);
    setEditName('');
  };

  const handleDelete = () => {
    if (contextMenu.item) {
      onDeleteDocument?.(contextMenu.item.path);
      handleCloseContextMenu();
    }
  };

  const handleOpenInFinder = () => {
    if (contextMenu.item) {
      onOpenInFinder?.(contextMenu.item.path);
      handleCloseContextMenu();
    }
  };

  const getContextMenuItems = (): ContextMenuItem[] => {
    if (!contextMenu.item) return [];
    
    return [
      {
        label: '重命名',
        icon: <PencilIcon className="w-4 h-4" />,
        onClick: handleStartRename,
      },
      {
        label: '在 Finder 中打开',
        icon: <ExternalLinkIcon className="w-4 h-4" />,
        onClick: handleOpenInFinder,
      },
      {
        label: '',
        separator: true,
        onClick: () => {},
      },
      {
        label: '删除',
        icon: <TrashIcon className="w-4 h-4" />,
        onClick: handleDelete,
        danger: true,
      },
    ];
  };

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

      {/* Action buttons */}
      <div className="px-3 py-2 flex gap-2">
        <button
          onClick={onNewDocument}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          title="New Document (Cmd+N)"
        >
          <PlusIcon className="w-4 h-4" />
          <span>New</span>
        </button>
        <button
          onClick={onOpenDocument}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          title="Open Document (Cmd+O)"
        >
          <FolderOpenIcon className="w-4 h-4" />
          <span>Open</span>
        </button>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-2">
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-500 mb-4">
              No files or folders opened
            </p>
            <p className="text-xs text-gray-400">
              Create a new document or open an existing one
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.path}>
              {editingItem?.path === item.path ? (
                <div className="px-2 py-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmRename();
                      if (e.key === 'Escape') handleCancelRename();
                    }}
                    onBlur={handleConfirmRename}
                    autoFocus
                    className="w-full px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              ) : (
                <FileTreeItem
                  item={item}
                  level={0}
                  currentPath={currentPath}
                  isExpanded={expandedFolders.has(item.path)}
                  isLoading={loadingFolders.has(item.path)}
                  onFileSelect={onFileSelect}
                  onToggle={onFolderToggle}
                  onContextMenu={handleContextMenu}
                />
              )}
            </div>
          ))
        )}
      </div>

      {/* Context Menu */}
      <ContextMenu
        items={getContextMenuItems()}
        position={contextMenu.position}
        onClose={handleCloseContextMenu}
      />

      {/* Footer info */}
      <div className="px-3 py-2 border-t border-gray-200 text-xs text-gray-400">
        <p>MarkdownX v1.0</p>
      </div>
    </div>
  );
}
