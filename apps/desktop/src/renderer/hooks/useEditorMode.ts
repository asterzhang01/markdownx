/**
 * Editor mode hook — manages edit/preview mode state with keyboard shortcuts
 */
import { useState, useCallback, useEffect } from 'react';

export type EditorMode = 'edit' | 'preview';

export function useEditorMode(initialMode: EditorMode = 'edit') {
  const [mode, setMode] = useState<EditorMode>(initialMode);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'edit' ? 'preview' : 'edit'));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isModKey = event.metaKey || event.ctrlKey;

      // ⌘E → edit mode
      if (isModKey && event.key === 'e' && !event.shiftKey) {
        event.preventDefault();
        setMode('edit');
      }
      // ⌘⇧P → preview mode
      if (isModKey && event.shiftKey && event.key === 'p') {
        event.preventDefault();
        setMode('preview');
      }
      // ⌘\ → toggle mode
      if (isModKey && event.key === '\\') {
        event.preventDefault();
        toggleMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleMode]);

  return { mode, setMode, toggleMode };
}
