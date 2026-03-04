/**
 * Line wrapping plugin — indented line wrapping that respects indentation
 * Adapted from TEE lineWrapping.ts, replaced lodash.range with native loop
 */
import { StateField } from "@codemirror/state";
import { EditorView, Decoration } from "@codemirror/view";

const SPACE_WIDTH = 4;
const ARBITRARY_INDENT_LINE_WRAP_LIMIT = 48;

const lineWrappingDecorations = StateField.define({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    const tabSize = tr.state.tabSize;

    if (!tr.docChanged && deco !== Decoration.none) return deco;

    const decorations = [];

    for (let i = 0; i < tr.state.doc.lines; i++) {
      const line = tr.state.doc.line(i + 1);
      if (line.length === 0) continue;

      let indentedChars = 0;
      for (const ch of line.text) {
        if (ch === "\t") {
          indentedChars += tabSize;
        } else if (ch === " ") {
          indentedChars += 1;
        } else {
          break;
        }
      }

      const offset =
        Math.min(indentedChars, ARBITRARY_INDENT_LINE_WRAP_LIMIT) * SPACE_WIDTH;

      const rules = document.createElement("span").style;
      rules.setProperty("--idented", `${offset}px`);
      rules.setProperty("text-indent", "calc(-1 * var(--idented) - 1px)");
      rules.setProperty(
        "padding-left",
        "calc(var(--idented) + var(--cm-left-padding, 4px))"
      );

      const lineWrapper = Decoration.line({
        attributes: { style: rules.cssText },
      });

      decorations.push(lineWrapper.range(line.from, line.from));
    }
    return Decoration.set(decorations, true);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const lineWrappingPlugin = [lineWrappingDecorations];
