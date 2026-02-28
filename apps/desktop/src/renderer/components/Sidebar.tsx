/**
 * Sidebar Component - Left navigation panel
 * Supports opening files and folder directories
 */
import { useState, useCallback } from 'react';
import {
  FolderIcon,
  DocumentIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  FolderOpenIcon,
} from './icons';

export interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileItem[];
  isExpanded?: boolean;
}

interface SidebarProps {
  items: FileItem[];
  currentPath: string | null;
  onFileSelect: (path: string) => void;
  onFolderSelect?: (path: string) => void;
  onNewDocument: () => void;
  onOpenDocument: () => void;
}

function FileTreeItem({
  item,
  level,
  currentPath,
  onFileSelect,
  onToggle,
}: {
  item: FileItem;
  level: number;
  currentPath: string | null;
  onFileSelect: (path: string) => void;
  onToggle: (path: string) => void;
}) {
  const isSelected = currentPath === item.path;
  const paddingLeft = `${level * 12 + 8}px`;

  const handleClick = () => {
    if (item.type === 'folder') {
      onToggle(item.path);
    } else {
      onFileSelect(item.path);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-1 px-2 py-1.5 text-sm text-left rounded-md transition-colors ${
          isSelected
            ? 'bg-blue-100 text-blue-900'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
        style={{ paddingLeft }}
      >
        {item.type === 'folder' && (
          <span className="flex-shrink-0 w-4 h-4 text-gray-400">
            {item.isExpanded ? (
              <ChevronDownIcon className="w-4 h-4" />
            ) : (
              <ChevronRightIcon className="w-4 h-4" />
            )}
          </span>
        )}
        {item.type === 'folder' ? (
          item.isExpanded ? (
            <FolderOpenIcon className="w-4 h-4 flex-shrink-0 text-yellow-500" />
          ) : (
            <FolderIcon className="w-4 h-4 flex-shrink-0 text-yellow-500" />
          )
        ) : (
          <DocumentIcon className="w-4 h-4 flex-shrink-0 text-blue-500" />
        )}
        <span className="truncate">{item.name}</span>
      </button>
      {item.type === 'folder' && item.isExpanded && item.children && (
        <div>
          {item.children.map((child) => (
            <FileTreeItem
              key={child.path}
              item={child}
              level={level + 1}
              currentPath={currentPath}
              onFileSelect={onFileSelect}
              onToggle={onToggle}
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
  onFileSelect,
  onNewDocument,
  onOpenDocument,
}: SidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const handleToggle = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Apply expanded state to items
  const applyExpandedState = (items: FileItem[]): FileItem[] => {
    return items.map((item) => ({
      ...item,
      isExpanded: item.type === 'folder' ? expandedFolders.has(item.path) : undefined,
      children: item.children ? applyExpandedState(item.children) : undefined,
    }));
  };

  const displayItems = applyExpandedState(items);

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
        {displayItems.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-500 mb-4">
              No files or folders opened
            </p>
            <p className="text-xs text-gray-400">
              Create a new document or open an existing one
            </p>
          </div>
        ) : (
          displayItems.map((item) => (
            <FileTreeItem
              key={item.path}
              item={item}
              level={0}
              currentPath={currentPath}
              onFileSelect={onFileSelect}
              onToggle={handleToggle}
            />
          ))
        )}
      </div>

      {/* Footer info */}
      <div className="px-3 py-2 border-t border-gray-200 text-xs text-gray-400">
        <p>MarkdownX v1.0</p>
      </div>
    </div>
  );
}
