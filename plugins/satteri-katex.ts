// Renders the math that Sätteri's `math` feature parses ($…$ and $$…$$) to
// KaTeX at build time. It works on the HTML tree (hast), replacing the
// elements Sätteri emits for math (`code.math-inline`,
// `pre > code.math-display`) with KaTeX's parsed HTML. Splicing KaTeX's HTML in as Markdown instead would apply backslash
// escapes to the TeX source KaTeX keeps in <annotation> (`\%` → `%`).
// Invalid TeX fails the build.
import katex from 'katex';
import { defineHastPlugin, htmlToHast, type HastNode } from 'satteri';

function hasClass(node: HastNode, className: string): boolean {
  if (node.type !== 'element') return false;
  const classes = node.properties.className;
  return Array.isArray(classes) && classes.includes(className);
}

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') return node.children.map(textOf).join('');
  return '';
}

// satteri 0.10.5's htmlToHast stores `<math xmlns>` under the property key
// `:xmlns`, which its own serializer then writes out literally. Checked by
// diffing dist/ against the unified build; drop this once that diff is clean
// without it.
function renameColonXmlns(node: HastNode): void {
  if (node.type !== 'element') return;
  const xmlns = node.properties[':xmlns'];
  if (typeof xmlns === 'string') {
    delete node.properties[':xmlns'];
    node.properties.xmlns = xmlns;
  }
  node.children.forEach(renameColonXmlns);
}

function renderMath(tex: string, displayMode: boolean): HastNode[] {
  const html = katex.renderToString(tex, { displayMode, throwOnError: true });
  const root = htmlToHast(html, { fragment: true });
  const nodes = root.type === 'root' ? root.children : [root];
  nodes.forEach(renameColonXmlns);
  return nodes;
}

export const satteriKatex = defineHastPlugin({
  name: 'katex',
  element: [
    {
      filter: ['pre'],
      visit(pre, ctx) {
        const code = pre.children[0];
        if (code && hasClass(code, 'math-display')) {
          ctx.replaceNode(pre, renderMath(textOf(code), true));
        }
      },
    },
    {
      filter: ['code'],
      visit(code, ctx) {
        if (hasClass(code, 'math-inline')) {
          ctx.replaceNode(code, renderMath(textOf(code), false));
        }
      },
    },
  ],
});
