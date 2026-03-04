/**
 * Status Bar Component
 * Displays editor mode, document statistics, and save status at the bottom
 */
import { useEffect } from 'react';
import type { EditorMode } from '../hooks/useEditorMode';
import type { DocumentStats } from '../hooks/useDocumentStats';

interface StatusBarProps {
  mode: EditorMode;
  stats: DocumentStats;
  isDirty: boolean;
}

export function StatusBar({ mode, stats, isDirty }: StatusBarProps) {
  useEffect(() => {
    console.log('[StatusBar] Status bar rendered', { mode, stats, isDirty });
  }, [mode, stats, isDirty]);

  return (
    <div className="h-7 border-t border-gray-200 flex items-center justify-between px-4 bg-gray-50 text-xs text-gray-500 select-none">
      <div className="flex items-center gap-4">
        <span>{stats.lineCount} lines</span>
        <span>{stats.wordCount} words</span>
        <span>{stats.characterCount} chars</span>
        <span>~{stats.estimatedReadingMinutes} min read</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="capitalize">
          {mode === 'edit' ? 'Editing' : 'Preview'}
        </span>
        <span>Markdown</span>
        {isDirty && <span className="text-orange-600">● Unsaved</span>}
      </div>
    </div>
  );
}
