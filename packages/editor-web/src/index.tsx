/**
 * @markdownx/editor-web
 * Shared web editor for MarkdownX
 */

// Components
export { Editor, type EditorProps, type EditorHandle } from './Editor';
export { App, type AppProps } from './App';

// Bridge for native communication
export { bridge } from './bridge';
export type { BridgeMessage, Manifest } from './bridge';

// AI hooks (placeholders for future)
export {
  useAICompletion,
  useAISummary,
  useAITags,
  useAISemanticSearch,
  useAIAvailability,
  type AICompletionState,
  type AISummaryState,
  type AITagsState,
  type AISearchState,
} from './ai-hooks';
