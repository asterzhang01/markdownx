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
  editingItem,
  editName,
  setEditName,
  onConfirmRename,
  onCancelRename,
}: {
  item: FileItem;
  level: number;
  currentPath: string | null;
  isExpanded: boolean;
  isLoading: boolean;
  onFileSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onContextMenu?: (e: React.MouseEvent, item: FileItem) => void;
  editingItem?: FileItem | null;
  editName?: string;
  setEditName?: (name: string) => void;
  onConfirmRename?: () => void;
  onCancelRename?: () => void;
}) {
  const isEditing = editingItem?.path === item.path;
  const isSelected = currentPath === item.path;
  const paddingLeft = `${level * 12 + 8}px`;
  const hasChildrenLoaded = item.children !== undefined;

  // Remove .mdx extension from display name
  const displayName = item.name.endsWith('.mdx')
    ? item.name.slice(0, -4)
    : item.name;

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

  // Render rename input when editing
  if (isEditing) {
    return (
      <div className="px-2 py-1" style={{ paddingLeft }}>
        <input
          type="text"
          value={editName || ''}
          onChange={(e) => setEditName?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirmRename?.();
            if (e.key === 'Escape') onCancelRename?.();
          }}
          onBlur={onConfirmRename}
          autoFocus
          className="w-full px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        {item.type === 'folder' && isExpanded && hasChildrenLoaded && item.children && (
          <div>
            {item.children.map((child) => (
              <FileTreeItem
                key={child.path}
                item={child}
                level={level + 1}
                currentPath={currentPath}
                isExpanded={false}
                isLoading={false}
                onFileSelect={onFileSelect}
                onToggle={onToggle}
                onContextMenu={onContextMenu}
                editingItem={editingItem}
                editName={editName}
                setEditName={setEditName}
                onConfirmRename={onConfirmRename}
                onCancelRename={onCancelRename}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

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
        <span className="truncate">{displayName}</span>
      </button>
      {item.type === 'folder' && isExpanded && hasChildrenLoaded && item.children && (
        <div>
          {item.children.map((child) => (
            <FileTreeItem
              key={child.path}
              item={child}
              level={level + 1}
              currentPath={currentPath}
              isExpanded={false}
              isLoading={false}
              onFileSelect={onFileSelect}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
              editingItem={editingItem}
              editName={editName}
              setEditName={setEditName}
              onConfirmRename={onConfirmRename}
              onCancelRename={onCancelRename}
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
      // Remove .mdx extension from display name when starting rename
      const nameForEdit = contextMenu.item.name.endsWith('.mdx')
        ? contextMenu.item.name.slice(0, -4)
        : contextMenu.item.name;
      setEditName(nameForEdit);
      handleCloseContextMenu();
    }
  };

  const handleConfirmRename = () => {
    if (editingItem && editName.trim()) {
      // Get the original name without .mdx extension for comparison
      const originalName = editingItem.name.endsWith('.mdx')
        ? editingItem.name.slice(0, -4)
        : editingItem.name;
      
      if (editName.trim() !== originalName) {
        onRenameDocument?.(editingItem.path, editName.trim());
      }
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
                  editingItem={editingItem}
                  editName={editName}
                  setEditName={setEditName}
                  onConfirmRename={handleConfirmRename}
                  onCancelRename={handleCancelRename}
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
