/**
 * Editor Page Component - Document editing view
 * Integrates dual-mode editor (CodeMirror 6 edit + Markdown preview)
 * with toolbar and status bar
 */
import { useEffect } from 'react';
import { EditorToolbar } from './EditorToolbar';
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
      {/* Toolbar */}
      <EditorToolbar
        documentName={documentName}
        mode={mode}
        onModeChange={setMode}
        isDirty={isDirty}
        lastSaved={lastSaved}
      />

      {/* Editor / Preview */}
      <div className="flex-1 overflow-hidden">
        {mode === 'edit' ? (
          <MarkdownEditor
            content={content}
            basePath={basePath}
            onChange={onChange}
            onSave={onSave}
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
