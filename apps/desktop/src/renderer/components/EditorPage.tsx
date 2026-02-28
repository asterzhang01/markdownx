/**
 * Editor Page Component - Document editing view
 */
import { useRef } from 'react';
import { Editor, type EditorHandle } from '@markdownx/editor-web';
import type { Manifest } from '@markdownx/core';

interface EditorPageProps {
  content: string;
  basePath: string;
  manifest: Manifest | null;
  isDirty: boolean;
  lastSaved: Date | null;
  isLoading: boolean;
  onChange: (content: string) => void;
  onSave: (content: string) => void;
}

export function EditorPage({
  content,
  basePath,
  manifest,
  isDirty,
  lastSaved,
  isLoading,
  onChange,
  onSave,
}: EditorPageProps) {
  const editorRef = useRef<EditorHandle>(null);

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

  const documentName = basePath.split('/').pop() || 'Untitled';

  return (
    <div className="flex-1 h-full flex flex-col bg-white">
      {/* Document header */}
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-gray-50">
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
        <div className="flex items-center gap-3 text-sm text-gray-500">
          {manifest && (
            <span className="text-xs">
              Format v{manifest.formatVersion}
            </span>
          )}
          {lastSaved && (
            <span className="text-xs">
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          ref={editorRef}
          initialContent={content}
          onChange={onChange}
          onSave={onSave}
          basePath={basePath}
          className="h-full"
        />
      </div>

      {/* Status bar */}
      <div className="h-8 border-t border-gray-200 flex items-center justify-between px-4 bg-gray-50 text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span>{content.split('\n').length} lines</span>
          <span>{content.length} characters</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Markdown</span>
          {isDirty && <span className="text-orange-600">● Unsaved changes</span>}
        </div>
      </div>
    </div>
  );
}
