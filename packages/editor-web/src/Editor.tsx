/**
 * MarkdownX Editor Component
 * Integrates MDXEditor with custom image handling and native bridge
 */
import { useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  tablePlugin,
  imagePlugin,
  linkPlugin,
  linkDialogPlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  CreateLink,
  InsertImage,
  InsertTable,
  ListsToggle,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { bridge } from './bridge';

export interface EditorProps {
  /** Initial markdown content */
  initialContent?: string;
  /** Called when content changes */
  onChange?: (content: string) => void;
  /** Called when save is triggered (Ctrl+S) */
  onSave?: (content: string) => void;
  /** Base path for asset resolution (used for image uploads) */
  basePath?: string;
  /** Read-only mode */
  readOnly?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Additional class names */
  className?: string;
}

export interface EditorHandle {
  /** Get current markdown content */
  getContent: () => string;
  /** Set markdown content */
  setContent: (content: string) => void;
  /** Focus the editor */
  focus: () => void;
  /** Get underlying MDXEditor ref */
  getEditorRef: () => MDXEditorMethods | null;
}

/**
 * Custom image upload handler
 * Intercepts image paste/drop and uploads via native bridge
 */
async function handleImageUpload(file: File): Promise<string> {
  try {
    // Use bridge to upload to native layer
    const relativePath = await bridge.uploadImage(file);
    return relativePath;
  } catch (error) {
    console.error('Image upload failed:', error);
    throw error;
  }
}

/**
 * MarkdownX Editor Component
 */
export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  {
    initialContent = '',
    onChange,
    onSave,
    readOnly = false,
    placeholder = 'Start writing...',
    className = '',
  },
  ref
) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const contentRef = useRef(initialContent);

  // Expose handle methods
  useImperativeHandle(ref, () => ({
    getContent: () => contentRef.current,
    setContent: (content: string) => {
      contentRef.current = content;
      editorRef.current?.setMarkdown(content);
    },
    focus: () => {
      editorRef.current?.focus();
    },
    getEditorRef: () => editorRef.current,
  }));

  // Handle content changes
  const handleChange = useCallback((content: string) => {
    contentRef.current = content;
    onChange?.(content);
  }, [onChange]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S for save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        onSave?.(contentRef.current);
        bridge.save(contentRef.current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSave]);

  // Listen for external content changes from native
  useEffect(() => {
    const unsubscribe = bridge.onMessage((message) => {
      if (message.type === 'LOADED') {
        contentRef.current = message.content;
        editorRef.current?.setMarkdown(message.content);
      } else if (message.type === 'EXTERNAL_CHANGE') {
        contentRef.current = message.content;
        editorRef.current?.setMarkdown(message.content);
      }
    });

    return unsubscribe;
  }, []);

  return (
    <div className={`markdownx-editor ${className}`}>
      <MDXEditor
        ref={editorRef}
        markdown={initialContent}
        onChange={handleChange}
        readOnly={readOnly}
        placeholder={placeholder}
        contentEditableClassName="prose prose-slate max-w-none min-h-[300px] outline-none"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          markdownShortcutPlugin(),
          tablePlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          imagePlugin({
            imageUploadHandler: handleImageUpload,
            imageAutocompleteSuggestions: [],
          }),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <BlockTypeSelect />
                <BoldItalicUnderlineToggles />
                <ListsToggle />
                <CreateLink />
                <InsertImage />
                <InsertTable />
              </>
            ),
          }),
        ]}
      />
    </div>
  );
});

export default Editor;
