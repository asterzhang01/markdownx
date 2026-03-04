/**
 * Editor Toolbar Component
 * Provides mode switching (edit/preview), document name display, and save status
 */
import type { EditorMode } from '../hooks/useEditorMode';
import { Pencil, Eye } from 'lucide-react';

interface EditorToolbarProps {
  documentName: string;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  isDirty: boolean;
  lastSaved: Date | null;
}

export function EditorToolbar({
  documentName,
  mode,
  onModeChange,
  isDirty,
  lastSaved,
}: EditorToolbarProps) {
  return (
    <div className="h-12 border-b border-gray-200 flex items-center justify-between px-4 bg-gray-50 select-none">
      {/* Left: document name + save status */}
      <div className="flex items-center gap-3">
        <h2 className="font-medium text-gray-900 truncate max-w-md">
          {documentName}
        </h2>
        {isDirty && (
          <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
            Unsaved
          </span>
        )}
      </div>

      {/* Right: mode toggle + save time */}
      <div className="flex items-center gap-3">
        {/* Mode toggle button group */}
        <div className="flex items-center bg-gray-200 rounded-md p-0.5">
          <button
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-sm transition-colors ${
              mode === 'edit'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => onModeChange('edit')}
            title="编辑模式 (⌘E)"
          >
            <Pencil size={14} />
            <span>编辑</span>
          </button>
          <button
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-sm transition-colors ${
              mode === 'preview'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => onModeChange('preview')}
            title="预览模式 (⌘⇧P)"
          >
            <Eye size={14} />
            <span>预览</span>
          </button>
        </div>

        {/* Save time */}
        {lastSaved && (
          <span className="text-xs text-gray-400">
            Saved {lastSaved.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
