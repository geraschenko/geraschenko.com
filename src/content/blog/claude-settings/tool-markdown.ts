// Renders a tool description (Markdown written for the model) to HTML for
// the tool cost chart.

import type { Code, Heading, Html, Root, RootContent, Text } from 'mdast';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

// The chart's group headings are h3, so a description's `#` becomes h4.
const headingLevelShift = 3;

// Descriptions contain tags like <system-reminder> and pseudo-XML examples;
// they are text for the model, so they show as text (inline) or code (block)
// rather than vanishing as HTML.
function literalHtml(html: Html, isInline: boolean): Text | Code {
  return isInline ? { type: 'text', value: html.value } : { type: 'code', value: html.value };
}

function remarkToolDescription() {
  return (tree: Root) => {
    const visit = (node: Root | RootContent, isInline: boolean): void => {
      if (node.type === 'html') {
        Object.assign(node, literalHtml(node, isInline));
      } else if (node.type === 'heading') {
        node.depth = Math.min(6, node.depth + headingLevelShift) as Heading['depth'];
      }
      if ('children' in node) {
        const childrenAreInline =
          isInline ||
          node.type === 'paragraph' ||
          node.type === 'heading' ||
          node.type === 'tableCell';
        node.children.forEach((child) => visit(child, childrenAreInline));
      }
    };
    visit(tree, false);
  };
}

const toolDescriptionProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkToolDescription)
  .use(remarkRehype)
  .use(rehypeStringify);

export function renderToolMarkdown(markdown: string): string {
  return String(toolDescriptionProcessor.processSync(markdown));
}
