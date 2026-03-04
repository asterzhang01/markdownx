/**
 * Unit tests for Markdown Commands (CodeMirror 6)
 *
 * Covers:
 *   • Heading commands (H1-H6) — empty line, with text, replacing existing heading
 *   • Text formatting — bold, italic, strikethrough, inline code (wrap/unwrap)
 *   • Block elements — code block, quote, unordered/ordered list
 *   • Insertions — link (with/without selection), image, table
 *   • Active format detection
 *
 * Tests use pure EditorState + spec builder functions to avoid jsdom
 * DOM measurement issues with CodeMirror's EditorView.
 */
import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection, TransactionSpec } from '@codemirror/state';
import {
  headingSpec,
  boldSpec,
  italicSpec,
  strikethroughSpec,
  inlineCodeSpec,
  codeBlockSpec,
  linkSpec,
  imageSpec,
  quoteSpec,
  unorderedListSpec,
  orderedListSpec,
  tableSpec,
  markdownCommands,
  detectActiveFormatsFromState,
} from '../markdownCommands';

/**
 * Create an EditorState for testing.
 * @param content - Initial document content
 * @param cursorPos - Cursor position (defaults to end of content)
 * @param selectionRange - Optional [from, to] for a selection range
 */
function createState(
  content: string,
  cursorPos?: number,
  selectionRange?: [number, number],
): EditorState {
  const selection = selectionRange
    ? EditorSelection.create([EditorSelection.range(selectionRange[0], selectionRange[1])])
    : EditorSelection.create([EditorSelection.cursor(cursorPos ?? content.length)]);

  return EditorState.create({ doc: content, selection });
}

/**
 * Apply a TransactionSpec to a state and return the resulting state.
 */
function applySpec(state: EditorState, spec: TransactionSpec): EditorState {
  return state.update(spec).state;
}

/** Get the full document text from state */
function getDocText(state: EditorState): string {
  return state.doc.toString();
}

/** Get the current selection range from state */
function getSelection(state: EditorState): { from: number; to: number } {
  const { from, to } = state.selection.main;
  return { from, to };
}

/** Get the selected text from state */
function getSelectedText(state: EditorState): string {
  const { from, to } = state.selection.main;
  return state.sliceDoc(from, to);
}

// =========================================================================
// Heading Commands
// =========================================================================

describe('Heading Commands', () => {
  it('inserts H1 prefix on empty line', () => {
    const state = createState('', 0);
    const result = applySpec(state, headingSpec(state, 1));
    expect(getDocText(result)).toBe('# ');
  });

  it('inserts H2 prefix on line with text', () => {
    const state = createState('Hello World', 5);
    const result = applySpec(state, headingSpec(state, 2));
    expect(getDocText(result)).toBe('## Hello World');
  });

  it('inserts H3 prefix on line with text', () => {
    const state = createState('Some text', 0);
    const result = applySpec(state, headingSpec(state, 3));
    expect(getDocText(result)).toBe('### Some text');
  });

  it('replaces existing heading level', () => {
    const state = createState('## Old Heading', 5);
    const result = applySpec(state, headingSpec(state, 1));
    expect(getDocText(result)).toBe('# Old Heading');
  });

  it('replaces H1 with H4', () => {
    const state = createState('# Title', 3);
    const result = applySpec(state, headingSpec(state, 4));
    expect(getDocText(result)).toBe('#### Title');
  });

  it('supports all heading levels H1-H6', () => {
    for (let level = 1; level <= 6; level++) {
      const state = createState('Text', 0);
      const result = applySpec(state, headingSpec(state, level));
      expect(getDocText(result)).toBe(`${'#'.repeat(level)} Text`);
    }
  });

  it('only affects the current line in multi-line doc', () => {
    const state = createState('Line 1\nLine 2\nLine 3', 8);
    const result = applySpec(state, headingSpec(state, 2));
    expect(getDocText(result)).toBe('Line 1\n## Line 2\nLine 3');
  });
});

// =========================================================================
// Bold Command
// =========================================================================

describe('Bold Command', () => {
  it('inserts bold placeholder when no selection', () => {
    const state = createState('Hello ', 6);
    const result = applySpec(state, boldSpec(state));
    expect(getDocText(result)).toBe('Hello **加粗文本**');
  });

  it('wraps selected text with bold markers', () => {
    const state = createState('Hello World', undefined, [6, 11]);
    const result = applySpec(state, boldSpec(state));
    expect(getDocText(result)).toBe('Hello **World**');
  });

  it('selects the wrapped text after bolding', () => {
    const state = createState('Hello World', undefined, [6, 11]);
    const result = applySpec(state, boldSpec(state));
    const sel = getSelection(result);
    expect(sel.from).toBe(8); // after **
    expect(sel.to).toBe(13); // before **
  });

  it('selects placeholder when no text selected', () => {
    const state = createState('', 0);
    const result = applySpec(state, boldSpec(state));
    expect(getSelectedText(result)).toBe('加粗文本');
  });
});

// =========================================================================
// Italic Command
// =========================================================================

describe('Italic Command', () => {
  it('inserts italic placeholder when no selection', () => {
    const state = createState('', 0);
    const result = applySpec(state, italicSpec(state));
    expect(getDocText(result)).toBe('*斜体文本*');
  });

  it('wraps selected text with italic markers', () => {
    const state = createState('Hello World', undefined, [6, 11]);
    const result = applySpec(state, italicSpec(state));
    expect(getDocText(result)).toBe('Hello *World*');
  });

  it('selects placeholder when no text selected', () => {
    const state = createState('', 0);
    const result = applySpec(state, italicSpec(state));
    expect(getSelectedText(result)).toBe('斜体文本');
  });
});

// =========================================================================
// Strikethrough Command
// =========================================================================

describe('Strikethrough Command', () => {
  it('inserts strikethrough placeholder when no selection', () => {
    const state = createState('', 0);
    const result = applySpec(state, strikethroughSpec(state));
    expect(getDocText(result)).toBe('~~删除文本~~');
  });

  it('wraps selected text with strikethrough markers', () => {
    const state = createState('old text', undefined, [0, 8]);
    const result = applySpec(state, strikethroughSpec(state));
    expect(getDocText(result)).toBe('~~old text~~');
  });
});

// =========================================================================
// Inline Code Command
// =========================================================================

describe('Inline Code Command', () => {
  it('inserts inline code placeholder when no selection', () => {
    const state = createState('', 0);
    const result = applySpec(state, inlineCodeSpec(state));
    expect(getDocText(result)).toBe('`代码`');
  });

  it('wraps selected text with backticks', () => {
    const state = createState('const x = 1', undefined, [0, 11]);
    const result = applySpec(state, inlineCodeSpec(state));
    expect(getDocText(result)).toBe('`const x = 1`');
  });
});

// =========================================================================
// Code Block Command
// =========================================================================

describe('Code Block Command', () => {
  it('inserts code block with placeholder when no selection', () => {
    const state = createState('', 0);
    const result = applySpec(state, codeBlockSpec(state));
    expect(getDocText(result)).toBe('```\n在此输入代码\n```');
  });

  it('wraps selected text in code block', () => {
    const content = 'console.log("hi")';
    const state = createState(content, undefined, [0, content.length]);
    const result = applySpec(state, codeBlockSpec(state));
    expect(getDocText(result)).toBe('```\nconsole.log("hi")\n```');
  });

  it('places cursor inside code block', () => {
    const state = createState('', 0);
    const result = applySpec(state, codeBlockSpec(state));
    const sel = getSelection(result);
    // Cursor should be after "```\n" = position 4
    expect(sel.from).toBe(4);
  });

  it('selects placeholder text in empty code block', () => {
    const state = createState('', 0);
    const result = applySpec(state, codeBlockSpec(state));
    expect(getSelectedText(result)).toBe('在此输入代码');
  });
});

// =========================================================================
// Link Command
// =========================================================================

describe('Link Command', () => {
  it('inserts link template when no selection', () => {
    const state = createState('', 0);
    const result = applySpec(state, linkSpec(state));
    expect(getDocText(result)).toBe('[文本](url)');
  });

  it('uses selected text as link text', () => {
    const state = createState('click here', undefined, [0, 10]);
    const result = applySpec(state, linkSpec(state));
    expect(getDocText(result)).toBe('[click here](url)');
  });

  it('selects "url" placeholder for easy replacement when text is selected', () => {
    const state = createState('click here', undefined, [0, 10]);
    const result = applySpec(state, linkSpec(state));
    expect(getSelectedText(result)).toBe('url');
  });

  it('selects "url" placeholder when no text is selected', () => {
    const state = createState('', 0);
    const result = applySpec(state, linkSpec(state));
    expect(getSelectedText(result)).toBe('url');
  });
});

// =========================================================================
// Image Command
// =========================================================================

describe('Image Command', () => {
  it('inserts image template', () => {
    const state = createState('', 0);
    const result = applySpec(state, imageSpec(state));
    expect(getDocText(result)).toBe('![替代文本](图片 URL)');
  });

  it('selects alt text placeholder', () => {
    const state = createState('', 0);
    const result = applySpec(state, imageSpec(state));
    expect(getSelectedText(result)).toBe('替代文本');
  });
});

// =========================================================================
// Quote Command
// =========================================================================

describe('Quote Command', () => {
  it('adds quote prefix to current line', () => {
    const state = createState('Some text', 0);
    const result = applySpec(state, quoteSpec(state));
    expect(getDocText(result)).toBe('> Some text');
  });

  it('adds quote prefix at line start regardless of cursor position', () => {
    const state = createState('Some text', 5);
    const result = applySpec(state, quoteSpec(state));
    expect(getDocText(result)).toBe('> Some text');
  });
});

// =========================================================================
// List Commands
// =========================================================================

describe('Unordered List Command', () => {
  it('adds unordered list prefix', () => {
    const state = createState('Item', 0);
    const result = applySpec(state, unorderedListSpec(state));
    expect(getDocText(result)).toBe('- Item');
  });

  it('adds prefix at line start regardless of cursor position', () => {
    const state = createState('Item text', 5);
    const result = applySpec(state, unorderedListSpec(state));
    expect(getDocText(result)).toBe('- Item text');
  });
});

describe('Ordered List Command', () => {
  it('adds ordered list prefix', () => {
    const state = createState('Item', 0);
    const result = applySpec(state, orderedListSpec(state));
    expect(getDocText(result)).toBe('1. Item');
  });
});

// =========================================================================
// Table Command
// =========================================================================

describe('Table Command', () => {
  it('inserts markdown table template', () => {
    const state = createState('', 0);
    const result = applySpec(state, tableSpec(state));
    const text = getDocText(result);
    expect(text).toContain('| 列 1 | 列 2 | 列 3 |');
    expect(text).toContain('|------|------|------|');
    expect(text).toContain('| 单元格 | 单元格 | 单元格 |');
  });

  it('selects first header cell text', () => {
    const state = createState('', 0);
    const result = applySpec(state, tableSpec(state));
    expect(getSelectedText(result)).toBe('列 1');
  });
});

// =========================================================================
// markdownCommands Record
// =========================================================================

describe('markdownCommands record', () => {
  it('contains all expected command types', () => {
    const expectedCommands = [
      'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
      'bold', 'italic', 'strikethrough', 'inlineCode',
      'codeBlock', 'link', 'image', 'quote',
      'unorderedList', 'orderedList', 'table',
    ];

    for (const commandName of expectedCommands) {
      expect(markdownCommands).toHaveProperty(commandName);
      expect(typeof markdownCommands[commandName]).toBe('function');
    }
  });
});

// =========================================================================
// detectActiveFormatsFromState
// =========================================================================

describe('detectActiveFormatsFromState', () => {
  it('detects heading level', () => {
    const state = createState('## My Heading', 5);
    const formats = detectActiveFormatsFromState(state);
    expect(formats.has('heading2')).toBe(true);
  });

  it('detects H1', () => {
    const state = createState('# Title', 3);
    const formats = detectActiveFormatsFromState(state);
    expect(formats.has('heading1')).toBe(true);
  });

  it('detects quote', () => {
    const state = createState('> quoted text', 5);
    const formats = detectActiveFormatsFromState(state);
    expect(formats.has('quote')).toBe(true);
  });

  it('detects unordered list', () => {
    const state = createState('- list item', 5);
    const formats = detectActiveFormatsFromState(state);
    expect(formats.has('unorderedList')).toBe(true);
  });

  it('detects ordered list', () => {
    const state = createState('1. list item', 5);
    const formats = detectActiveFormatsFromState(state);
    expect(formats.has('orderedList')).toBe(true);
  });

  it('returns empty set for plain text', () => {
    const state = createState('plain text', 5);
    const formats = detectActiveFormatsFromState(state);
    expect(formats.size).toBe(0);
  });

  it('detects bold when cursor is inside bold markers', () => {
    const state = createState('some **bold** text', 9);
    const formats = detectActiveFormatsFromState(state);
    expect(formats.has('bold')).toBe(true);
  });

  it('detects inline code when cursor is inside backticks', () => {
    const state = createState('some `code` text', 8);
    const formats = detectActiveFormatsFromState(state);
    expect(formats.has('inlineCode')).toBe(true);
  });
});
