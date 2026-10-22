// A terminal draws every character into a grid of fixed-width cells, whatever
// font the glyph comes from. A browser gives a glyph the width of the font it
// falls back to, so characters missing from the page's monospace font (Claude
// Code's ⛁ ⛶ ⛝, for one) break column alignment, differently on each device.
// Non-ASCII characters therefore get explicit cells; ASCII is in every
// monospace font and stays plain text.
import type { ElementContent } from 'hast';
import type { ShikiTransformer } from 'shiki';
import stringWidth from 'string-width';

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** `text` as plain-text runs and one cell element per non-ASCII grapheme
 * (class `terminal-cell`, plus `wide` when it takes two columns). */
export function terminalCells(text: string): ElementContent[] {
  const nodes: ElementContent[] = [];
  let plainRun = '';
  for (const { segment } of graphemes.segment(text)) {
    const width = stringWidth(segment);
    if (/^[\x00-\x7f]*$/.test(segment) || width === 0) {
      plainRun += segment;
      continue;
    }
    if (plainRun) nodes.push({ type: 'text', value: plainRun });
    plainRun = '';
    nodes.push({
      type: 'element',
      tagName: 'span',
      properties: { className: width === 2 ? ['terminal-cell', 'wide'] : ['terminal-cell'] },
      children: [{ type: 'text', value: segment }],
    });
  }
  if (plainRun) nodes.push({ type: 'text', value: plainRun });
  return nodes;
}

/** Shiki transformer that splits each token's text into terminal cells. */
export const terminalCellsTransformer: ShikiTransformer = {
  name: 'terminal-cells',
  span(tokenElement) {
    tokenElement.children = tokenElement.children.flatMap((child) =>
      child.type === 'text' ? terminalCells(child.value) : [child],
    );
  },
};
