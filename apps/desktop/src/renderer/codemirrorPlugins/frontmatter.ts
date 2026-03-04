/**
 * Frontmatter plugin — dims YAML frontmatter blocks
 * Directly adapted from TEE frontmatter.ts
 */
import {
  ViewPlugin,
  DecorationSet,
  EditorView,
  ViewUpdate,
  Decoration,
} from "@codemirror/view";
import { Range } from "@codemirror/state";

const FRONTMATTER_REGEX = /^---.*---/s;

function getFrontmatterDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    const frontmatterMatch = text.match(FRONTMATTER_REGEX);

    if (frontmatterMatch && frontmatterMatch.index !== undefined) {
      const position = frontmatterMatch.index + from;
      decorations.push(
        Decoration.mark({
          class: "frontmatter",
        }).range(position, position + frontmatterMatch[0].length)
      );
    }
  }

  return Decoration.set(
    decorations.sort((a, b) => a.from - b.from)
  );
}

export const frontmatterPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = getFrontmatterDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = getFrontmatterDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
