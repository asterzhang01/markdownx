/**
 * Editor Toolbar Component
 * Provides mode switching (edit/preview), document name display,
 * save status, and formatting toolbar toggle
 */
import { useEffect } from 'react';
import type { EditorMode } from '../hooks/useEditorMode';
import { Pencil, Eye, PanelTop } from 'lucide-react';

interface EditorToolbarProps {
  documentName: string;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  isDirty: boolean;
  lastSaved: Date | null;
  showFormattingToolbar?: boolean;
  onToggleFormattingToolbar?: () => void;
}

export function EditorToolbar({
  documentName,
  mode,
  onModeChange,
  isDirty,
  lastSaved,
  showFormattingToolbar,
  onToggleFormattingToolbar,
}: EditorToolbarProps) {
  useEffect(() => {
    console.log('[EditorToolbar] Toolbar rendered', { documentName, mode, isDirty });
  }, [documentName, mode, isDirty]);

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

      {/* Right: formatting toggle + mode toggle + save time */}
      <div className="flex items-center gap-3">
        {/* Formatting toolbar toggle — only in edit mode */}
        {mode === 'edit' && onToggleFormattingToolbar && (
          <button
            className={`p-1.5 rounded transition-colors ${
              showFormattingToolbar
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
            onClick={onToggleFormattingToolbar}
            title={showFormattingToolbar ? '隐藏格式化工具栏' : '显示格式化工具栏'}
            aria-label="切换格式化工具栏"
            aria-pressed={showFormattingToolbar}
          >
            <PanelTop size={16} />
          </button>
        )}

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
