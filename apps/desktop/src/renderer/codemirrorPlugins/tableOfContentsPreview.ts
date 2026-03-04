/**
 * Table of contents preview plugin — renders a TOC widget after <!--endintro-->
 * Adapted from TEE tableOfContentsPreview.tsx, converted to pure DOM (no React/JSX)
 */
import { Range } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import {
  WidgetType,
  EditorView,
  Decoration,
  ViewPlugin,
  DecorationSet,
  ViewUpdate,
} from "@codemirror/view";
import { Tree } from "@lezer/common";

type Heading = { level: number; content: string; from: number; to: number };

type HeadingTreeItem = {
  level: "h2";
  content: string;
  from: number;
  to: number;
  children: { level: "h3"; content: string; from: number; to: number }[];
};

class TableOfContentsWidget extends WidgetType {
  constructor(protected headings: HeadingTreeItem[]) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "font-sans bg-gray-100 py-1 px-8 mx-[-20px]";

    const title = document.createElement("h2");
    title.textContent = "Contents";
    container.appendChild(title);

    for (const heading of this.headings) {
      const headingDiv = document.createElement("div");
      const headingTitle = document.createElement("h3");
      headingTitle.textContent = heading.content;
      headingDiv.appendChild(headingTitle);

      if (heading.children.length > 0) {
        const list = document.createElement("ul");
        for (const child of heading.children) {
          const listItem = document.createElement("li");
          listItem.textContent = child.content;
          list.appendChild(listItem);
        }
        headingDiv.appendChild(list);
      }

      container.appendChild(headingDiv);
    }

    return container;
  }

  eq(other: TableOfContentsWidget) {
    return JSON.stringify(other.headings) === JSON.stringify(this.headings);
  }

  ignoreEvent() {
    return true;
  }
}

const END_INTRO_REGEX = /<!--endintro-->/;

function getTOCDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    const tocMatch = text.match(END_INTRO_REGEX);

    if (tocMatch && tocMatch.index !== undefined) {
      const position = tocMatch.index + from;
      const markdownTree = ensureSyntaxTree(view.state, view.state.doc.length);
      if (!markdownTree) continue;

      const headingsList: Heading[] = [];
      const dfs = (tree: Tree, treePosition: number) => {
        let level = 0;
        switch (tree.type.name) {
          case "ATXHeading1": level = 1; break;
          case "ATXHeading2": level = 2; break;
          case "ATXHeading3": level = 3; break;
          case "ATXHeading4": level = 4; break;
        }
        if (level !== 0) {
          const headingFrom = treePosition + tree.children[0].length;
          const headingTo = treePosition + tree.length;
          const headingText = view.state.doc.sliceString(headingFrom, headingTo);
          headingsList.push({ level, content: headingText, from: headingFrom, to: headingTo });
        }

        tree.positions.forEach((childPos, index) => {
          const child = tree.children[index];
          if (child instanceof Tree) {
            dfs(child, treePosition + childPos);
          }
        });
      };
      dfs(markdownTree, 0);

      const headingTree: HeadingTreeItem[] = [];
      headingsList.forEach((item) => {
        if (item.level === 2) {
          headingTree.push({
            level: "h2",
            content: item.content,
            children: [],
            from: item.from,
            to: item.to,
          });
        } else if (item.level === 3 && headingTree.length) {
          headingTree[headingTree.length - 1].children.push({
            level: "h3",
            content: item.content,
            from: item.from,
            to: item.to,
          });
        }
      });

      decorations.push(
        Decoration.widget({
          widget: new TableOfContentsWidget(headingTree),
          side: 1,
        }).range(position + tocMatch[0].length)
      );
    }
  }

  return Decoration.set(
    decorations.sort((a, b) => a.from - b.from)
  );
}

export const tableOfContentsPreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = getTOCDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = getTOCDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
