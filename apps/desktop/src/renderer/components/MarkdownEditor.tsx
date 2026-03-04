/**
 * CodeMirror 6 Markdown Editor Component
 * Adapted from TEE MarkdownEditor.tsx for desktop:
 * - Works with string content via IPC (no automerge-codemirror)
 * - Includes desktop-adapted CM plugins
 * - Supports drag-and-drop image upload via Electron IPC
 */
import { useEffect, useRef, useState } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { indentWithTab } from '@codemirror/commands';
import {
  syntaxHighlighting,
  indentOnInput,
  foldKeymap,
  indentUnit,
} from '@codemirror/language';
import { history, historyKeymap, standardKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { completionKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';

import { markdownStyles, essayTheme } from '../codemirrorPlugins/theme';
import { frontmatterPlugin } from '../codemirrorPlugins/frontmatter';
import { codeMonospacePlugin } from '../codemirrorPlugins/codeMonospace';
import { lineWrappingPlugin } from '../codemirrorPlugins/lineWrapping';
import { previewFiguresPlugin } from '../codemirrorPlugins/previewFigures';
import { highlightKeywordsPlugin } from '../codemirrorPlugins/highlightKeywords';
import { tableOfContentsPreviewPlugin } from '../codemirrorPlugins/tableOfContentsPreview';
import { previewImagesPlugin } from '../codemirrorPlugins/previewMarkdownImages';
import { dragAndDropFilesPlugin } from '../codemirrorPlugins/dragAndDropFiles';
import { dropCursor } from '../codemirrorPlugins/dropCursor';

interface MarkdownEditorProps {
  /** Initial document content */
  content: string;
  /** Base path of the .mdx document (for resolving image paths) */
  basePath: string;
  /** Called when document content changes */
  onChange: (content: string) => void;
  /** Called when user triggers save (⌘S) */
  onSave: (content: string) => void;
}

export function MarkdownEditor({
  content,
  basePath,
  onChange,
  onSave,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const [editorCrashed] = useState(false);

  // Use refs to avoid stale closures in CM dispatch
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const contentRef = useRef(content);
  // Track whether the content change originated from the editor itself
  const isInternalChangeRef = useRef(false);

  useEffect(() => {
    console.log('[MarkdownEditor] Component mounted', { basePath, contentLength: content.length });
    return () => {
      console.log('[MarkdownEditor] Component unmounting');
    };
  }, []);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Sync external content changes into the editor (e.g., from file watcher)
  // Skip updates that originated from the editor's own onChange to avoid loops
  useEffect(() => {
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }

    const view = editorViewRef.current;
    if (!view) return;

    const currentEditorContent = view.state.doc.toString();
    if (content !== currentEditorContent) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: content,
        },
      });
    }
  }, [content]);

  // Initialize CodeMirror editor
  useEffect(() => {
    console.log('[MarkdownEditor] Initializing CodeMirror editor', { basePath });
    if (!containerRef.current) {
      console.error('[MarkdownEditor] Container ref not available');
      return;
    }

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: (view) => {
          console.log('[MarkdownEditor] Save triggered via shortcut');
          onSaveRef.current(view.state.doc.toString());
          return true;
        },
      },
    ]);

    const view = new EditorView({
      doc: content,
      extensions: [
        // Save shortcut (must be before other keymaps to take priority)
        saveKeymap,

        // Basic editing capabilities
        history(),
        keymap.of([
          ...standardKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...completionKeymap,
          ...lintKeymap,
          ...foldKeymap,
          indentWithTab,
        ]),
        indentOnInput(),
        indentUnit.of('  '),
        EditorView.lineWrapping,

        // Markdown syntax support
        markdown({ codeLanguages: languages }),
        syntaxHighlighting(markdownStyles),
        essayTheme,

        // Change listener
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newContent = update.state.doc.toString();
            console.log('[MarkdownEditor] Content changed', { newLength: newContent.length });
            isInternalChangeRef.current = true;
            onChangeRef.current(newContent);
          }
        }),

        // Custom CM plugins
        dropCursor(),
        dragAndDropFilesPlugin(),
        frontmatterPlugin,
        previewFiguresPlugin,
        highlightKeywordsPlugin,
        tableOfContentsPreviewPlugin,
        codeMonospacePlugin,
        lineWrappingPlugin,
        previewImagesPlugin(basePath),
      ],
      parent: containerRef.current,
    });

    editorViewRef.current = view;
    view.focus();
    console.log('[MarkdownEditor] CodeMirror editor initialized successfully');

    return () => {
      console.log('[MarkdownEditor] Destroying CodeMirror editor');
      view.destroy();
      editorViewRef.current = null;
    };
    // Only re-create editor when basePath changes (new document loaded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath]);

  if (editorCrashed) {
    return (
      <div className="bg-red-100 p-4 rounded-md m-4">
        <p className="mb-2 font-medium">⛔️ 编辑器崩溃</p>
        <p className="mb-2 text-sm text-gray-700">
          请重新加载窗口以继续编辑。您的数据在崩溃前已保存。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch h-full">
      <div
        className="codemirror-editor flex-grow relative"
        ref={containerRef}
        onKeyDown={(evt) => {
          // Let ⌘S through for saving
          if (evt.key === 's' && (evt.metaKey || evt.ctrlKey)) return;
          // Let ⌘\ through for toggling sidebar/mode
          if (evt.key === '\\' && (evt.metaKey || evt.ctrlKey)) return;
          // Let ⌘E through for edit mode
          if (evt.key === 'e' && (evt.metaKey || evt.ctrlKey)) return;
          // Let ⌘⇧P through for preview mode
          if (evt.key === 'p' && evt.shiftKey && (evt.metaKey || evt.ctrlKey)) return;
          evt.stopPropagation();
        }}
      />
    </div>
  );
}
