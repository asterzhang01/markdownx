/**
 * Context Menu Component - Right-click menu for file operations
 */
import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number } | null;
  onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!position) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [position, onClose]);

  // Adjust position to keep menu within viewport
  const adjustPosition = (x: number, y: number) => {
    const menuWidth = 180;
    const menuHeight = items.length * 36 + 16;
    
    let adjustedX = x;
    let adjustedY = y;

    // Adjust if too close to right edge
    if (x + menuWidth > window.innerWidth) {
      adjustedX = window.innerWidth - menuWidth - 8;
    }

    // Adjust if too close to bottom edge
    if (y + menuHeight > window.innerHeight) {
      adjustedY = window.innerHeight - menuHeight - 8;
    }

    return { x: adjustedX, y: adjustedY };
  };

  console.log('[ContextMenu] Rendering check:', { hasPosition: !!position, itemsCount: items.length });
  if (!position || items.length === 0) {
    console.log('[ContextMenu] Not rendering: position or items empty');
    return null;
  }

  const adjustedPosition = adjustPosition(position.x, position.y);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] bg-white rounded-md shadow-lg border border-gray-200 py-1"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {items.map((item, index) => (
        <div key={index}>
          {item.separator ? (
            <div className="my-1 border-t border-gray-200" />
          ) : (
            <button
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                item.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {item.icon && <span className="flex-shrink-0 w-4 h-4">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
