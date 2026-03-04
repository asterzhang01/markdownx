/**
 * useMarkdownCommands Hook
 * Provides a React interface for executing Markdown formatting commands
 * in CodeMirror 6 editor
 */
import { useCallback, useMemo } from 'react';
import { EditorView } from '@codemirror/view';
import {
  markdownCommands,
  detectActiveFormats,
  MarkdownCommandType,
} from '../codemirrorPlugins/markdownCommands';

/**
 * Hook for managing Markdown commands.
 * Returns stable command functions that operate on the current EditorView.
 *
 * @param editorViewRef - Reference to the CodeMirror EditorView
 */
export function useMarkdownCommands(editorViewRef: React.MutableRefObject<EditorView | null>) {
  /** Read the currently active formats from the editor state */
  const activeFormats = useCallback((): Set<string> => {
    const view = editorViewRef.current;
    if (!view) return new Set<string>();
    return detectActiveFormats(view);
  }, [editorViewRef]);

  /** Execute a Markdown command by type name */
  const executeCommand = useCallback((commandType: MarkdownCommandType): boolean => {
    const view = editorViewRef.current;
    if (!view) {
      console.warn('[useMarkdownCommands] Editor view not available');
      return false;
    }

    const command = markdownCommands[commandType];
    if (!command) {
      console.error(`[useMarkdownCommands] Unknown command: ${commandType}`);
      return false;
    }

    try {
      const result = command(view);
      view.focus();
      return result;
    } catch (error) {
      console.error(`[useMarkdownCommands] Command execution failed: ${commandType}`, error);
      return false;
    }
  }, [editorViewRef]);

  return useMemo(() => ({
    executeCommand,
    activeFormats,
    heading1: () => executeCommand('heading1'),
    heading2: () => executeCommand('heading2'),
    heading3: () => executeCommand('heading3'),
    heading4: () => executeCommand('heading4'),
    heading5: () => executeCommand('heading5'),
    heading6: () => executeCommand('heading6'),
    bold: () => executeCommand('bold'),
    italic: () => executeCommand('italic'),
    strikethrough: () => executeCommand('strikethrough'),
    inlineCode: () => executeCommand('inlineCode'),
    codeBlock: () => executeCommand('codeBlock'),
    link: () => executeCommand('link'),
    image: () => executeCommand('image'),
    quote: () => executeCommand('quote'),
    unorderedList: () => executeCommand('unorderedList'),
    orderedList: () => executeCommand('orderedList'),
    table: () => executeCommand('table'),
  }), [executeCommand, activeFormats]);
}