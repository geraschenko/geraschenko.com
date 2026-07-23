import { describe, expect, it } from 'vitest';
import {
  dagRows,
  escapeHtml,
  linePaths,
  type Cell,
  type CellStrokes,
  type DagNodeInput,
  type DagRow,
} from './render-dag';

const FILLER_GLYPH = { blank: ' ', parent: '│', ancestor: '╷' } as const;

// Stroke set → 2ch box glyph, keyed by present arms (UDLR order). Dashedness
// is projected only for the pure vertical (╷); corners/tees have no dashed
// box chars, so dashed variants render as their solid glyph — assert
// dashedness directly on `strokes` where it matters.
const STROKES_GLYPH: Record<string, string> = {
  '': '  ',
  UD: '│ ',
  LR: '──',
  UL: '╯ ',
  UR: '╰─',
  ULR: '┴─',
  DL: '╮ ',
  DR: '╭─',
  DLR: '┬─',
  UDL: '┤ ',
  UDR: '├─',
  UDLR: '┼─',
};

function cellText(cell: Cell, nodeGlyph: string): string {
  switch (cell.type) {
    case 'node':
      return `${nodeGlyph} `;
    case 'term':
      return '~ ';
    case 'strokes': {
      const { up, down, left, right } = cell.strokes;
      if (up === 'dashed' && down === 'dashed' && !left && !right) return '╷ ';
      const key =
        (up ? 'U' : '') + (down ? 'D' : '') + (left ? 'L' : '') + (right ? 'R' : '');
      return STROKES_GLYPH[key]!;
    }
  }
}

/**
 * Project rows to plain box-art text: glyph slots filled with the node glyph,
 * the message beside the node line, one line for non-blank filler columns
 * (standing in for the CSS filler), and a blank line for separators.
 */
function art(rows: DagRow[]): string {
  const lines: string[] = [];
  for (const row of rows) {
    if (row.separator) lines.push('');
    for (const line of row.prefixLines) {
      const prefix = line.cells.map((cell) => cellText(cell, row.node.glyph)).join('');
      const message = line.kind === 'node' ? ` ${row.node.message}` : '';
      lines.push((prefix + message).trimEnd());
    }
    const filler = row.fillerColumns.map((c) => FILLER_GLYPH[c]).join(' ').trimEnd();
    if (filler !== '') lines.push(filler);
  }
  return lines.join('\n');
}

describe('dagRows', () => {
  it('renders a linear chain with default parents (above)', () => {
    expect(art(dagRows(['1', '2', '3'], 'above'))).toMatchInlineSnapshot(`
      "•  1
      │
      •  2
      │
      •  3"
    `);
  });

  it('renders the spec golden example (below)', () => {
    const nodes: DagNodeInput[] = [
      { id: '4', glyph: 'x', parents: ['2', '3'], message: 'final' },
      { id: '3', glyph: 'o', parents: ['1'], message: 'middle' },
      { id: '2', glyph: 'o', message: 'middle' },
      { id: '1', glyph: 'o', message: 'start' },
    ];
    expect(art(dagRows(nodes, 'below'))).toMatchInlineSnapshot(`
      "x    final
      ├─╮
      │ │
      │ o  middle
      │ │
      o │  middle
      ├─╯
      │
      o  start"
    `);
  });

  it('renders a branch (above): 5 forks from 2', () => {
    const nodes: DagNodeInput[] = ['1', '2', '3', '4', { id: '5', parents: ['2'] }];
    expect(art(dagRows(nodes, 'above'))).toMatchInlineSnapshot(`
      "•  1
      │
      •    2
      ├─╮
      │ │
      • │  3
      │ │
      • │  4
        │
        •  5"
    `);
  });

  it('renders ancestors dashed (below)', () => {
    const nodes: DagNodeInput[] = [{ id: '3', ancestors: ['1'] }, { id: '2', parents: ['1'] }, '1'];
    expect(art(dagRows(nodes, 'below'))).toMatchInlineSnapshot(`
      "•  3
      ╷
      ╷ •  2
      ╭─╯
      │
      •  1"
    `);
  });

  it('renders anonymous ancestors natively (below)', () => {
    const nodes: DagNodeInput[] = [{ id: '2', parents: ['1'] }, { id: '1', anonymousAncestors: 1 }];
    expect(art(dagRows(nodes, 'below'))).toMatchInlineSnapshot(`
      "•  2
      │
      •  1
      │
      ~"
    `);
  });

  it('renders anonymous ancestors as synthetic rows above (above)', () => {
    const nodes: DagNodeInput[] = [
      { id: '1', anonymousAncestors: 1 },
      { id: '2', parents: ['1'] },
    ];
    const rows = dagRows(nodes, 'above');
    expect(rows[0]!.node.className).toBe('dag-anon');
    expect(art(rows)).toMatchInlineSnapshot(`
      "~
      │
      •  1
      │
      •  2"
    `);
  });

  it('suppresses the default parent when any ancestry field is present', () => {
    // Edge from 1 to 2 must be dashed (ancestor), not a solid default-parent edge.
    expect(art(dagRows(['1', { id: '2', ancestors: ['1'] }], 'above'))).toMatchInlineSnapshot(`
      "•  1
      ╷
      •  2"
    `);
  });

  it('separates disconnected roots', () => {
    const rows = dagRows(['1', { id: '2', parents: [] }], 'above');
    expect(rows[1]!.separator).toBe(true);
  });

  it('defaults message to the escaped id and glyph to •', () => {
    const [row] = dagRows(['a<b'], 'above');
    expect(row!.node.message).toBe('a&lt;b');
    expect(row!.node.glyph).toBe('•');
  });

  it('keeps a moving ancestor edge dashed through its corner', () => {
    // 3's dashed edge to 2 must merge left with a dashed corner (╯-shaped)
    // and a dashed right arm on the join cell — fidelity beyond box chars,
    // which have no dashed corners.
    const nodes: DagNodeInput[] = [
      { id: '4', parents: ['2'] },
      { id: '3', ancestors: ['2'] },
      { id: '2', parents: [] },
    ];
    const link = dagRows(nodes, 'below')[1]!.prefixLines.find((l) => l.kind === 'link')!;
    expect(link.cells).toEqual([
      { type: 'strokes', strokes: { up: 'solid', down: 'solid', right: 'dashed' } },
      { type: 'strokes', strokes: { up: 'dashed', left: 'dashed' } },
    ]);
  });

  it('exposes filler columns for the stretchable filler', () => {
    const nodes: DagNodeInput[] = ['1', '2', '3', { id: '4', parents: ['2'] }];
    const rows = dagRows(nodes, 'above');
    // Row 3 ends its column; only the still-open 2→4 edge continues below it.
    expect(rows[2]!.fillerColumns).toEqual(['blank', 'parent']);
  });

  it('rejects duplicate ids', () => {
    expect(() => dagRows(['1', '1'], 'above')).toThrow(/duplicate node id "1"/);
  });

  it('rejects unknown parent references', () => {
    expect(() => dagRows([{ id: '1', parents: ['nope'] }], 'above')).toThrow(
      /unknown parent "nope"/,
    );
  });

  it('rejects parents violating the ordering requirement (above)', () => {
    expect(() => dagRows([{ id: '1', parents: ['2'] }, '2'], 'above')).toThrow(
      /must be listed before/,
    );
  });

  it('rejects parents violating the ordering requirement (below)', () => {
    expect(() => dagRows(['2', { id: '1', parents: ['2'] }], 'below')).toThrow(
      /must be listed after/,
    );
  });
});

describe('linePaths', () => {
  const strokes = (s: CellStrokes): Cell => ({ type: 'strokes', strokes: s });

  it('renders a full vertical as one segment (continuous dash phase)', () => {
    // Down ends overdraw past y=1 to cover the seam with the element below.
    expect(linePaths([strokes({ up: 'solid', down: 'solid' })], 'curved')).toEqual({
      solid: 'M 0.5 0 L 0.5 1.05',
      dashed: '',
    });
  });

  it('separates dashed from solid paths', () => {
    expect(linePaths([strokes({ up: 'dashed', down: 'dashed' })], 'curved')).toEqual({
      solid: '',
      dashed: 'M 0.5 0 L 0.5 1.05',
    });
  });

  it('draws curved corners as quarter arcs', () => {
    // ╯ at cell 0: left edge up to the top edge.
    expect(linePaths([strokes({ up: 'solid', left: 'solid' })], 'curved').solid).toBe(
      'M 0 0.5 A 0.5 0.5 0 0 0 0.5 0',
    );
    // ╭─ at cell 1: overdrawn stub up to the bottom edge, quarter arc to
    // 0.5ch right of center, then out to the edge.
    expect(linePaths([strokes({}), strokes({ down: 'solid', right: 'solid' })], 'curved').solid).toBe(
      'M 2.5 1.05 L 2.5 1 A 0.5 0.5 0 0 1 3 0.5 L 4 0.5',
    );
  });

  it('draws square corners as polylines through the center', () => {
    expect(linePaths([strokes({ up: 'solid', left: 'solid' })], 'square').solid).toBe(
      'M 0 0.5 L 0.5 0.5 L 0.5 0',
    );
  });

  it('draws junctions as crossing segments, styled per arm', () => {
    // ├ with a dashed right arm (the mixed cell from the ancestor-merge test).
    expect(linePaths([strokes({ up: 'solid', down: 'solid', right: 'dashed' })], 'curved')).toEqual({
      solid: 'M 0.5 0 L 0.5 1.05',
      dashed: 'M 0.5 0.5 L 2 0.5',
    });
  });

  it('emits nothing for node, term, and empty cells', () => {
    expect(linePaths([{ type: 'node' }, strokes({}), { type: 'term' }], 'curved')).toEqual({
      solid: '',
      dashed: '',
    });
  });
});

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});
