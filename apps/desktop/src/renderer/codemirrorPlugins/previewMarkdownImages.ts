/**
 * Markdown image preview plugin — renders images inline in the editor
 * Adapted from TEE previewMarkdownImages.ts for Electron desktop:
 * - Uses file:// protocol instead of Service Worker + AssetsDoc
 * - No Automerge dependency
 */
import {
  WidgetType,
  EditorView,
  ViewPlugin,
  DecorationSet,
  ViewUpdate,
  Decoration,
} from "@codemirror/view";
import { Range } from "@codemirror/state";

class ImageWidget extends WidgetType {
  constructor(
    protected url: string,
    protected caption: string
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    const image = document.createElement("img");

    image.crossOrigin = "anonymous";
    image.src = this.url;
    image.className = "min-w-0";
    image.onerror = () => {
      image.style.opacity = "0";
    };

    wrapper.append(image);
    wrapper.className = "w-fit border border-gray-200";

    if (this.caption.length > 0) {
      const captionDiv = document.createElement("div");
      captionDiv.append(document.createTextNode(this.caption));
      captionDiv.className = "p-4 bg-gray-100 text-sm font-sans";
      wrapper.append(captionDiv);
    }

    return wrapper;
  }

  eq(other: ImageWidget) {
    return other.url === this.url && other.caption === this.caption;
  }

  ignoreEvent() {
    return true;
  }
}

const MARKDOWN_IMAGE_REGEX = /!\[(?<caption>.*?)\]\((?<url>.*?)\)/gs;

/**
 * Resolve image URL: convert assets/ relative paths to file:// absolute paths
 */
function resolveImageUrl(rawUrl: string, basePath: string): string {
  if (
    rawUrl.startsWith("http://") ||
    rawUrl.startsWith("https://") ||
    rawUrl.startsWith("data:")
  ) {
    return rawUrl;
  }
  const normalizedUrl = rawUrl.startsWith("./") ? rawUrl.slice(2) : rawUrl;
  return `file://${basePath}/${normalizedUrl}`;
}

function getImageDecorations(view: EditorView, basePath: string): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);

    let match;
    while ((match = MARKDOWN_IMAGE_REGEX.exec(text))) {
      const position = match.index + from;
      const url = match.groups?.url ?? "";
      const caption = match.groups?.caption ?? "";

      const resolvedUrl = resolveImageUrl(url, basePath);
      const imageWidget = new ImageWidget(resolvedUrl, caption);

      decorations.push(
        Decoration.widget({
          widget: imageWidget,
          side: -1,
        }).range(position)
      );
      decorations.push(
        Decoration.mark({
          class: "text-gray-500 font-mono text-left text-sm leading-snug inline-block opacity-70 mb-1",
        }).range(position, position + match[0].length)
      );
    }
  }

  return Decoration.set(decorations, true);
}

/**
 * Desktop image preview plugin
 * @param basePath - Absolute path to the .mdx document root directory
 */
export function previewImagesPlugin(basePath: string) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = getImageDecorations(view, basePath);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = getImageDecorations(update.view, basePath);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}
