/**
 * Formatting Toolbar Component
 *
 * Renders Markdown formatting buttons (headings, bold, italic, etc.).
 * Active-format highlighting is driven by a `useSyncExternalStore`-based
 * subscription to the CodeMirror EditorView, which avoids the render-loop
 * pitfalls of `useEffect` + `setState`.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { EditorView } from '@codemirror/view';
import {
  Heading1, Heading2, Heading3,
  Bold, Italic, Strikethrough, Code,
  Link, Image, Quote,
  List, ListOrdered, Table,
} from 'lucide-react';
import {
  markdownCommands,
  detectActiveFormats,
  type MarkdownCommandType,
} from '../codemirrorPlugins/markdownCommands';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormattingToolbarProps {
  editorViewRef: React.MutableRefObject<EditorView | null>;
}

interface ToolbarButtonDef {
  kind: 'button';
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string }>;
  commandType: MarkdownCommandType;
  shortcut?: string;
  formatType?: string;
}

interface ToolbarSeparatorDef {
  kind: 'separator';
  key: string;
}

type ToolbarItem = ToolbarSeparatorDef | ToolbarButtonDef;

// ---------------------------------------------------------------------------
// Static toolbar definition (never changes, lives outside the component)
// ---------------------------------------------------------------------------

const TOOLBAR_ITEMS: ToolbarItem[] = [
  { kind: 'button', key: 'heading1', label: '标题 1', icon: Heading1, commandType: 'heading1', shortcut: '⌘1', formatType: 'heading1' },
  { kind: 'button', key: 'heading2', label: '标题 2', icon: Heading2, commandType: 'heading2', shortcut: '⌘2', formatType: 'heading2' },
  { kind: 'button', key: 'heading3', label: '标题 3', icon: Heading3, commandType: 'heading3', shortcut: '⌘3', formatType: 'heading3' },
  { kind: 'separator', key: 'sep-1' },
  { kind: 'button', key: 'bold', label: '加粗', icon: Bold, commandType: 'bold', shortcut: '⌘B', formatType: 'bold' },
  { kind: 'button', key: 'italic', label: '斜体', icon: Italic, commandType: 'italic', shortcut: '⌘I', formatType: 'italic' },
  { kind: 'button', key: 'strikethrough', label: '删除线', icon: Strikethrough, commandType: 'strikethrough', shortcut: '⌘⇧X', formatType: 'strikethrough' },
  { kind: 'button', key: 'inlineCode', label: '行内代码', icon: Code, commandType: 'inlineCode', shortcut: '⌘`', formatType: 'inlineCode' },
  { kind: 'separator', key: 'sep-2' },
  { kind: 'button', key: 'codeBlock', label: '代码块', icon: Code, commandType: 'codeBlock', shortcut: '⌘⇧C', formatType: 'codeBlock' },
  { kind: 'button', key: 'quote', label: '引用', icon: Quote, commandType: 'quote', shortcut: '⌘⇧Q', formatType: 'quote' },
  { kind: 'button', key: 'unorderedList', label: '无序列表', icon: List, commandType: 'unorderedList', shortcut: '⌘⇧U', formatType: 'unorderedList' },
  { kind: 'button', key: 'orderedList', label: '有序列表', icon: ListOrdered, commandType: 'orderedList', shortcut: '⌘⇧O', formatType: 'orderedList' },
  { kind: 'separator', key: 'sep-3' },
  { kind: 'button', key: 'link', label: '链接', icon: Link, commandType: 'link', shortcut: '⌘K', formatType: 'link' },
  { kind: 'button', key: 'image', label: '图片', icon: Image, commandType: 'image', formatType: 'image' },
  { kind: 'button', key: 'table', label: '表格', icon: Table, commandType: 'table', formatType: 'table' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Serialise a Set<string> into a stable, comparable string snapshot. */
function serialiseFormats(formats: Set<string>): string {
  if (formats.size === 0) return '';
  return Array.from(formats).sort().join(',');
}

const EMPTY_FORMATS = new Set<string>();

// ---------------------------------------------------------------------------
// Hook: subscribe to editor format changes via useSyncExternalStore
// ---------------------------------------------------------------------------

/**
 * Uses `useSyncExternalStore` with a polling-based subscription so that
 * React controls when to re-render — no `useEffect` + `setState` needed.
 */
function useActiveFormats(
  editorViewRef: React.MutableRefObject<EditorView | null>,
): Set<string> {
  // subscribe: set up a 300 ms polling interval; call `onStoreChange` when
  // the serialised snapshot changes.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const intervalId = setInterval(onStoreChange, 300);
      return () => clearInterval(intervalId);
    },
    [],
  );

  // getSnapshot: return a *stable* string that only changes when the
  // active formats actually change.  `useSyncExternalStore` compares
  // snapshots with `Object.is`, so returning the same string suppresses
  // unnecessary re-renders.
  const getSnapshot = useCallback((): string => {
    const view = editorViewRef.current;
    if (!view) return '';
    try {
      return serialiseFormats(detectActiveFormats(view));
    } catch {
      return '';
    }
  }, [editorViewRef]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => '');

  if (snapshot === '') return EMPTY_FORMATS;
  return new Set(snapshot.split(','));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FormattingToolbar({ editorViewRef }: FormattingToolbarProps) {
  const activeFormats = useActiveFormats(editorViewRef);

  function handleCommand(commandType: MarkdownCommandType) {
    const view = editorViewRef.current;
    if (!view) return;
    const command = markdownCommands[commandType];
    if (!command) return;
    try {
      command(view);
      view.focus();
    } catch (error) {
      console.error(`[FormattingToolbar] Command failed: ${commandType}`, error);
    }
  }

  return (
    <div className="formatting-toolbar h-10 border-b border-gray-200 flex items-center gap-1 px-3 bg-white select-none">
      {TOOLBAR_ITEMS.map((item) => {
        if (item.kind === 'separator') {
          return <div key={item.key} className="w-px h-5 bg-gray-200 mx-1" />;
        }

        const Icon = item.icon;
        const isActive = item.formatType ? activeFormats.has(item.formatType) : false;

        return (
          <button
            key={item.key}
            className={`p-1.5 rounded transition-colors flex items-center justify-center ${
              isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`}
            onClick={() => handleCommand(item.commandType)}
            title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ''}`}
            aria-label={item.label}
            aria-pressed={isActive}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}
