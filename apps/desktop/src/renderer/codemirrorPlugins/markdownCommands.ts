/**
 * Markdown Commands for CodeMirror 6
 * Provides commands for common Markdown formatting operations:
 * - Headings (H1-H6)
 * - Text formatting (bold, italic, strikethrough, inline code)
 * - Block elements (code blocks, quotes, lists, tables)
 * - Insertions (links, images)
 *
 * Architecture:
 *   Each command is split into a pure "transaction spec builder" (xxxSpec)
 *   that works on EditorState alone, and a thin wrapper that dispatches
 *   the spec on an EditorView.  This makes the core logic fully testable
 *   without a real DOM.
 *
 * All view-level commands follow CodeMirror 6 Command pattern:
 *   (view: EditorView) => boolean
 */
import { EditorView, Command } from '@codemirror/view';
import { EditorState, TransactionSpec, EditorSelection } from '@codemirror/state';

export type MarkdownCommandType =
  | 'heading1' | 'heading2' | 'heading3'
  | 'heading4' | 'heading5' | 'heading6'
  | 'bold' | 'italic' | 'strikethrough' | 'inlineCode'
  | 'codeBlock' | 'link' | 'image' | 'quote'
  | 'unorderedList' | 'orderedList' | 'table';

// ---------------------------------------------------------------------------
// Pure helpers (operate on EditorState, return TransactionSpec)
// ---------------------------------------------------------------------------

interface InsertOrWrapOptions {
  type: 'wrap' | 'prefix' | 'block' | 'line';
  before: string;
  after?: string;
  placeholder?: string;
}

/**
 * Build a TransactionSpec for inserting / wrapping Markdown syntax.
 * Pure function — no side-effects, no DOM access.
 */
export function buildInsertOrWrapSpec(
  state: EditorState,
  options: InsertOrWrapOptions,
): TransactionSpec {
  const { from, to } = state.selection.main;
  const selected = state.sliceDoc(from, to);

  let changes: { from: number; to?: number; insert: string };
  let newCursorFrom: number;
  let newCursorTo: number;

  if (options.type === 'wrap') {
    const before = options.before;
    const after = options.after || options.before;
    const insertText = selected
      ? `${before}${selected}${after}`
      : `${before}${options.placeholder || ''}${after}`;

    changes = { from, to, insert: insertText };

    if (selected) {
      newCursorFrom = from + before.length;
      newCursorTo = to + before.length;
    } else {
      const placeholderLen = options.placeholder?.length || 0;
      newCursorFrom = from + before.length;
      newCursorTo = from + before.length + placeholderLen;
    }
  } else if (options.type === 'prefix') {
    const lineFrom = state.doc.lineAt(from).from;
    changes = { from: lineFrom, insert: options.before };
    newCursorFrom = from + options.before.length;
    newCursorTo = to + options.before.length;
  } else if (options.type === 'block') {
    const after = options.after || options.before;
    const body = selected || options.placeholder || '';
    const insertText = `${options.before}\n${body}\n${after}`;
    changes = { from, to, insert: insertText };

    const bodyStart = from + options.before.length + 1;
    if (selected) {
      newCursorFrom = bodyStart;
      newCursorTo = bodyStart + selected.length;
    } else {
      newCursorFrom = bodyStart;
      newCursorTo = bodyStart + body.length;
    }
  } else {
    // 'line' — headings
    const lineFrom = state.doc.lineAt(from).from;
    const lineTo = state.doc.lineAt(from).to;
    const lineText = state.sliceDoc(lineFrom, lineTo);
    const strippedLine = lineText.replace(/^#+\s*/, '');

    changes = { from: lineFrom, to: lineTo, insert: options.before + strippedLine };
    newCursorFrom = lineFrom + options.before.length;
    newCursorTo = lineFrom + options.before.length + strippedLine.length;
  }

  return {
    changes,
    selection: EditorSelection.create([EditorSelection.range(newCursorFrom, newCursorTo)]),
    userEvent: 'input',
  };
}

// ---------------------------------------------------------------------------
// Spec builders for individual commands
// ---------------------------------------------------------------------------

export function headingSpec(state: EditorState, level: number): TransactionSpec {
  const prefix = '#'.repeat(level) + ' ';
  return buildInsertOrWrapSpec(state, { type: 'line', before: prefix, placeholder: '标题文本' });
}

export function boldSpec(state: EditorState): TransactionSpec {
  return buildInsertOrWrapSpec(state, { type: 'wrap', before: '**', after: '**', placeholder: '加粗文本' });
}

export function italicSpec(state: EditorState): TransactionSpec {
  return buildInsertOrWrapSpec(state, { type: 'wrap', before: '*', after: '*', placeholder: '斜体文本' });
}

export function strikethroughSpec(state: EditorState): TransactionSpec {
  return buildInsertOrWrapSpec(state, { type: 'wrap', before: '~~', after: '~~', placeholder: '删除文本' });
}

export function inlineCodeSpec(state: EditorState): TransactionSpec {
  return buildInsertOrWrapSpec(state, { type: 'wrap', before: '`', after: '`', placeholder: '代码' });
}

export function codeBlockSpec(state: EditorState): TransactionSpec {
  return buildInsertOrWrapSpec(state, { type: 'block', before: '```', after: '```', placeholder: '在此输入代码' });
}

export function quoteSpec(state: EditorState): TransactionSpec {
  return buildInsertOrWrapSpec(state, { type: 'prefix', before: '> ', placeholder: '引用内容' });
}

export function unorderedListSpec(state: EditorState): TransactionSpec {
  return buildInsertOrWrapSpec(state, { type: 'prefix', before: '- ', placeholder: '列表项' });
}

export function orderedListSpec(state: EditorState): TransactionSpec {
  return buildInsertOrWrapSpec(state, { type: 'prefix', before: '1. ', placeholder: '列表项' });
}

/**
 * Build TransactionSpec for link insertion.
 * When text is selected it becomes the link text; "url" is always selected for easy replacement.
 */
export function linkSpec(state: EditorState): TransactionSpec {
  const { from, to } = state.selection.main;
  const selected = state.sliceDoc(from, to);

  const linkText = selected || '文本';
  const insert = `[${linkText}](url)`;

  // Select "url" placeholder
  const urlStart = from + 1 + linkText.length + 2; // after "[linkText]("
  const urlEnd = urlStart + 3;

  return {
    changes: { from, to, insert },
    selection: EditorSelection.create([EditorSelection.range(urlStart, urlEnd)]),
    userEvent: 'input',
  };
}

/**
 * Build TransactionSpec for image insertion.
 * Selects "替代文本" placeholder.
 */
export function imageSpec(state: EditorState): TransactionSpec {
  const { from, to } = state.selection.main;
  const insert = '![替代文本](图片 URL)';

  const altStart = from + 2; // after "!["
  const altEnd = altStart + 4; // "替代文本" = 4 chars

  return {
    changes: { from, to, insert },
    selection: EditorSelection.create([EditorSelection.range(altStart, altEnd)]),
    userEvent: 'input',
  };
}

/**
 * Build TransactionSpec for table insertion.
 * Selects "列 1" in the first header cell.
 */
export function tableSpec(state: EditorState): TransactionSpec {
  const { from, to } = state.selection.main;

  const tableMarkdown = `| 列 1 | 列 2 | 列 3 |
|------|------|------|
| 单元格 | 单元格 | 单元格 |
| 单元格 | 单元格 | 单元格 |`;

  const headerStart = from + 2; // after "| "
  const headerEnd = headerStart + 3; // "列 1" = 3 chars ("列", " ", "1")

  return {
    changes: { from, to, insert: tableMarkdown },
    selection: EditorSelection.create([EditorSelection.range(headerStart, headerEnd)]),
    userEvent: 'input',
  };
}

// ---------------------------------------------------------------------------
// View-level command wrappers (dispatch the spec)
// ---------------------------------------------------------------------------

function dispatchSpec(view: EditorView, spec: TransactionSpec): boolean {
  view.dispatch(spec);
  return true;
}

export function heading(level: number): Command {
  return (view: EditorView) => dispatchSpec(view, headingSpec(view.state, level));
}

export function bold(): Command {
  return (view: EditorView) => dispatchSpec(view, boldSpec(view.state));
}

export function italic(): Command {
  return (view: EditorView) => dispatchSpec(view, italicSpec(view.state));
}

export function strikethrough(): Command {
  return (view: EditorView) => dispatchSpec(view, strikethroughSpec(view.state));
}

export function inlineCode(): Command {
  return (view: EditorView) => dispatchSpec(view, inlineCodeSpec(view.state));
}

export function codeBlock(): Command {
  return (view: EditorView) => dispatchSpec(view, codeBlockSpec(view.state));
}

export function link(): Command {
  return (view: EditorView) => dispatchSpec(view, linkSpec(view.state));
}

export function image(): Command {
  return (view: EditorView) => dispatchSpec(view, imageSpec(view.state));
}

export function quote(): Command {
  return (view: EditorView) => dispatchSpec(view, quoteSpec(view.state));
}

export function unorderedList(): Command {
  return (view: EditorView) => dispatchSpec(view, unorderedListSpec(view.state));
}

export function orderedList(): Command {
  return (view: EditorView) => dispatchSpec(view, orderedListSpec(view.state));
}

export function table(): Command {
  return (view: EditorView) => dispatchSpec(view, tableSpec(view.state));
}

/**
 * Export all commands as a record
 */
export const markdownCommands: Record<string, Command> = {
  heading1: heading(1),
  heading2: heading(2),
  heading3: heading(3),
  heading4: heading(4),
  heading5: heading(5),
  heading6: heading(6),
  bold: bold(),
  italic: italic(),
  strikethrough: strikethrough(),
  inlineCode: inlineCode(),
  codeBlock: codeBlock(),
  link: link(),
  image: image(),
  quote: quote(),
  unorderedList: unorderedList(),
  orderedList: orderedList(),
  table: table(),
};

// ---------------------------------------------------------------------------
// Active format detection (pure — works on EditorState)
// ---------------------------------------------------------------------------

/**
 * Detect active formats at the current cursor position.
 * Used for highlighting active toolbar buttons.
 *
 * Accepts EditorView for backward-compatibility; internally reads only state.
 */
export function detectActiveFormats(view: EditorView): Set<string> {
  return detectActiveFormatsFromState(view.state);
}

/**
 * Pure version — operates on EditorState only.
 */
export function detectActiveFormatsFromState(state: EditorState): Set<string> {
  const formats = new Set<string>();
  const { from } = state.selection.main;
  const line = state.doc.lineAt(from);
  const lineText = line.text;
  const lineOffset = from - line.from;

  // Detect heading
  const headingMatch = lineText.match(/^(#+)\s/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    if (level >= 1 && level <= 6) {
      formats.add(`heading${level}`);
    }
  }

  // Detect bold
  const beforeCursor = lineText.slice(0, lineOffset);
  const afterCursor = lineText.slice(lineOffset);
  const boldBefore = beforeCursor.match(/\*\*[^*]*$/);
  const boldAfter = afterCursor.match(/^[^*]*\*\*/);
  if (boldBefore && boldAfter) {
    formats.add('bold');
  }

  // Detect italic (exclude if inside bold)
  const italicBefore = beforeCursor.match(/\*[^*]*$/);
  const italicAfter = afterCursor.match(/^[^*]*\*/);
  if (italicBefore && italicAfter && !boldBefore && !boldAfter) {
    formats.add('italic');
  }

  // Detect inline code
  const codeBefore = beforeCursor.match(/`[^`]*$/);
  const codeAfter = afterCursor.match(/^[^`]*`/);
  if (codeBefore && codeAfter) {
    formats.add('inlineCode');
  }

  // Detect quote
  if (lineText.trimStart().startsWith('>')) {
    formats.add('quote');
  }

  // Detect unordered list
  if (/^\s*[-*+]\s/.test(lineText)) {
    formats.add('unorderedList');
  }

  // Detect ordered list
  if (/^\s*\d+\.\s/.test(lineText)) {
    formats.add('orderedList');
  }

  return formats;
}
