/**
 * Drag and drop files plugin — handles file drops into the editor
 * Adapted from TEE dragAndDropFiles.ts for Electron desktop:
 * - Uses Electron IPC to upload images to local assets/ directory
 */
import { EditorView, ViewPlugin } from "@codemirror/view";

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
]);

function isSupportedImageFile(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.has(file.type);
}

function loadFileAsUint8Array(file: File): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      resolve(new Uint8Array(arrayBuffer));
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Create the drag-and-drop plugin for Electron desktop
 * Uses window.electronAPI.document.uploadImage to save files via IPC
 */
export function dragAndDropFilesPlugin() {
  let editorView: EditorView;

  const onDragEnter = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
  };

  const onDrop = (event: DragEvent) => {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return true;

    const file = files[0];
    if (!isSupportedImageFile(file)) {
      alert(
        "Only the following image files are supported:\n.png, .jpg, .jpeg, .gif, .webp, .bmp, .tiff"
      );
      return true;
    }

    event.preventDefault();

    loadFileAsUint8Array(file).then(async (data) => {
      if (!window.electronAPI) return;

      try {
        const relativePath = await window.electronAPI.document.uploadImage(
          Array.from(data),
          file.name
        );

        const markdownImageText = `![](${relativePath})`;
        const dropPosition = editorView.posAtCoords({
          x: event.clientX,
          y: event.clientY,
        });

        if (dropPosition !== null) {
          editorView.dispatch({
            changes: { from: dropPosition, insert: markdownImageText },
          });
        }
      } catch (error) {
        console.error("Failed to upload image:", error);
        alert("Failed to upload image");
      }
    });

    return true;
  };

  return ViewPlugin.fromClass(
    class {
      constructor(view: EditorView) {
        editorView = view;
        view.dom.addEventListener("dragenter", onDragEnter);
        view.dom.addEventListener("dragover", onDragOver);
        view.dom.addEventListener("drop", onDrop);
      }

      destroy() {
        editorView.dom.removeEventListener("dragenter", onDragEnter);
        editorView.dom.removeEventListener("dragover", onDragOver);
        editorView.dom.removeEventListener("drop", onDrop);
      }
    }
  );
}
