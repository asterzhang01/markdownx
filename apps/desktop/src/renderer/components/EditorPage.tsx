/**
 * Editor Page Component - Document editing view
 * Integrates dual-mode editor (CodeMirror 6 edit + Markdown preview)
 * with formatting toolbar, top toolbar and status bar
 */
import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorToolbar } from './EditorToolbar';
import { FormattingToolbar } from './FormattingToolbar';
import { MarkdownEditor } from './MarkdownEditor';
import { MarkdownPreview } from './MarkdownPreview';
import { StatusBar } from './StatusBar';
import { useEditorMode } from '../hooks/useEditorMode';
import { useDocumentStats } from '../hooks/useDocumentStats';

interface EditorPageProps {
  content: string;
  basePath: string;
  isDirty: boolean;
  lastSaved: Date | null;
  isLoading: boolean;
  onChange: (content: string) => void;
  onSave: (content: string) => void;
}

export function EditorPage({
  content,
  basePath,
  isDirty,
  lastSaved,
  isLoading,
  onChange,
  onSave,
}: EditorPageProps) {
  const { mode, setMode } = useEditorMode();
  const documentStats = useDocumentStats(content);
  const editorViewRef = useRef<EditorView | null>(null);
  const [showFormattingToolbar, setShowFormattingToolbar] = useState(true);

  const documentName =
    basePath.split('/').pop()?.replace('.mdx', '') || 'Untitled';

  useEffect(() => {
    console.log('[EditorPage] Page rendered', { documentName, mode, isLoading, isDirty });
  }, [documentName, mode, isLoading, isDirty]);

  if (isLoading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500">Loading document...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex flex-col bg-white">
      {/* Top toolbar */}
      <EditorToolbar
        documentName={documentName}
        mode={mode}
        onModeChange={setMode}
        isDirty={isDirty}
        lastSaved={lastSaved}
        showFormattingToolbar={showFormattingToolbar}
        onToggleFormattingToolbar={() => setShowFormattingToolbar((prev) => !prev)}
      />

      {/* Formatting toolbar — only visible in edit mode */}
      {mode === 'edit' && showFormattingToolbar && (
        <FormattingToolbar editorViewRef={editorViewRef} />
      )}

      {/* Editor / Preview */}
      <div className="flex-1 overflow-hidden">
        {mode === 'edit' ? (
          <MarkdownEditor
            content={content}
            basePath={basePath}
            onChange={onChange}
            onSave={onSave}
            editorViewRef={editorViewRef}
          />
        ) : (
          <MarkdownPreview content={content} basePath={basePath} />
        )}
      </div>

      {/* Status bar */}
      <StatusBar mode={mode} stats={documentStats} isDirty={isDirty} />
    </div>
  );
}
