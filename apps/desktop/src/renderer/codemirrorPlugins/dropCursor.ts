/**
 * Drop cursor plugin — shows a cursor at the current drop position during drag
 * Directly adapted from TEE dropCursor.ts
 */
import { StateField, StateEffect, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

interface MeasureRequest<T> {
  read(view: EditorView): T;
  write?(measure: T, view: EditorView): void;
  key?: unknown;
}

const setDropCursorPos = StateEffect.define<number | null>({
  map(pos, mapping) {
    return pos == null ? null : mapping.mapPos(pos);
  },
});

const dropCursorPos = StateField.define<number | null>({
  create() {
    return null;
  },
  update(pos, tr) {
    if (pos != null) pos = tr.changes.mapPos(pos);
    return tr.effects.reduce(
      (currentPos, effect) => (effect.is(setDropCursorPos) ? effect.value : currentPos),
      pos
    );
  },
});

const drawDropCursor = ViewPlugin.fromClass(
  class {
    cursor: HTMLElement | null = null;
    measureReq: MeasureRequest<{
      left: number;
      top: number;
      height: number;
    } | null>;

    onDragOver: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    onDragEnd: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;

    constructor(readonly view: EditorView) {
      this.measureReq = {
        read: this.readPos.bind(this),
        write: this.drawCursor.bind(this),
      };

      this.onDragOver = (event: DragEvent) => {
        this.setDropPos(
          this.view.posAtCoords({ x: event.clientX, y: event.clientY })
        );
      };

      this.onDragLeave = (event: DragEvent) => {
        if (
          event.target === this.view.contentDOM ||
          !this.view.contentDOM.contains(event.relatedTarget as HTMLElement)
        ) {
          this.setDropPos(null);
        }
      };

      this.onDragEnd = () => {
        this.setDropPos(null);
      };

      this.onDrop = () => {
        this.setDropPos(null);
      };

      view.dom.addEventListener("dragover", this.onDragOver);
      view.dom.addEventListener("dragenter", this.onDragLeave);
      view.dom.addEventListener("dragenter", this.onDragEnd);
      view.dom.addEventListener("drop", this.onDrop);
    }

    update(update: ViewUpdate) {
      const cursorPos = update.state.field(dropCursorPos);
      if (cursorPos == null) {
        if (this.cursor != null) {
          this.cursor?.remove();
          this.cursor = null;
        }
      } else {
        if (!this.cursor) {
          this.cursor = this.view.scrollDOM.appendChild(
            document.createElement("div")
          );
          this.cursor.className = "cm-dropCursor";
        }
        if (
          update.startState.field(dropCursorPos) !== cursorPos ||
          update.docChanged ||
          update.geometryChanged
        ) {
          this.view.requestMeasure(this.measureReq);
        }
      }
    }

    readPos(): { left: number; top: number; height: number } | null {
      const pos = this.view.state.field(dropCursorPos);
      const rect = pos != null && this.view.coordsAtPos(pos);
      if (!rect) return null;
      const outer = this.view.scrollDOM.getBoundingClientRect();
      return {
        left: rect.left - outer.left + this.view.scrollDOM.scrollLeft * this.view.scaleX,
        top: rect.top - outer.top + this.view.scrollDOM.scrollTop * this.view.scaleY,
        height: rect.bottom - rect.top,
      };
    }

    drawCursor(pos: { left: number; top: number; height: number } | null) {
      if (this.cursor) {
        const { scaleX, scaleY } = this.view;
        if (pos) {
          this.cursor.style.left = pos.left / scaleX + "px";
          this.cursor.style.top = pos.top / scaleY + "px";
          this.cursor.style.height = pos.height / scaleY + "px";
        } else {
          this.cursor.style.left = "-100000px";
        }
      }
    }

    destroy() {
      if (this.cursor) this.cursor.remove();
      this.view.dom.removeEventListener("dragover", this.onDragOver);
      this.view.dom.removeEventListener("dragenter", this.onDragLeave);
      this.view.dom.removeEventListener("dragenter", this.onDragEnd);
      this.view.dom.removeEventListener("drop", this.onDrop);
    }

    setDropPos(pos: number | null) {
      if (this.view.state.field(dropCursorPos) !== pos) {
        this.view.dispatch({ effects: setDropCursorPos.of(pos) });
      }
    }
  }
);

export function dropCursor(): Extension {
  return [dropCursorPos, drawDropCursor];
}
