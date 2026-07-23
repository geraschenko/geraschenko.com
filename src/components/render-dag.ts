import { Ancestor, pipeline } from '@geraschenko/renderdag';
import type { GraphRowShape, PadLine } from '@geraschenko/renderdag';

export type EdgeStyle = 'solid' | 'dashed';
/** Strokes radiate from the cell center (0.5ch, mid-line); the right arm
 * spans the remaining 1.5ch so horizontals connect to the next column. */
export interface CellStrokes {
  up?: EdgeStyle;
  down?: EdgeStyle;
  left?: EdgeStyle;
  right?: EdgeStyle;
}
export type Cell =
  | { type: 'strokes'; strokes: CellStrokes }
  | { type: 'node' } // the HTML glyph slot (glyph in the left 1ch)
  | { type: 'term' }; // anonymous-ancestor terminator, rendered as '~' text
export type CellLineKind = 'node' | 'link' | 'term';
export interface CellLine {
  kind: CellLineKind;
  cells: Cell[];
}
export type CornerStyle = 'curved' | 'square';

export interface DagNodeSpec {
  id: string;
  /** Our parents; default: adjacent node on the parent side (see spec). */
  parents?: string[];
  /** Our eventual ancestors (indirect, drawn dashed); default []. */
  ancestors?: string[];
  /** Ancestry continuing beyond the drawn graph (~); default 0. */
  anonymousAncestors?: number;
  /** Inline HTML for the node marker (~1ch wide); default '•'. */
  glyph?: string;
  /** Inline HTML; default HTML-escaped id; may be multiline/wrapping. */
  message?: string;
  /** Extra class(es) applied to this node's row. */
  class?: string;
}
export type DagNodeInput = string | DagNodeSpec; // "4" ≡ { id: "4" }
export type ParentDirection = 'above' | 'below';

export interface DagRowNode {
  id: string;
  glyph: string;
  message: string;
  className: string; // '' if none
}

export interface DagRow {
  node: DagRowNode;
  prefixLines: CellLine[]; // node line, optional link line, optional term line pair
  fillerColumns: PadLine[]; // per-column spec for the stretchable filler
  separator: boolean; // render a small spacer row before this row
}

// JS has no stdlib HTML-escape, so this small standard implementation is ours.
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

interface ResolvedNode {
  id: string;
  parents: string[];
  ancestors: string[];
  anonymousAncestors: number;
  glyph: string;
  message: string;
  className: string;
}

function resolveNodes(input: DagNodeInput[], parentDirection: ParentDirection): ResolvedNode[] {
  const specs = input.map((n) => (typeof n === 'string' ? { id: n } : n));
  return specs.map((spec, i) => {
    let parents = spec.parents;
    if (
      parents === undefined &&
      spec.ancestors === undefined &&
      spec.anonymousAncestors === undefined
    ) {
      const adjacent = parentDirection === 'above' ? specs[i - 1] : specs[i + 1];
      parents = adjacent === undefined ? [] : [adjacent.id];
    }
    return {
      id: spec.id,
      parents: parents ?? [],
      ancestors: spec.ancestors ?? [],
      anonymousAncestors: spec.anonymousAncestors ?? 0,
      glyph: spec.glyph ?? '•',
      message: spec.message ?? escapeHtml(spec.id),
      className: spec.class ?? '',
    };
  });
}

function validate(nodes: ResolvedNode[], parentDirection: ParentDirection): void {
  const indexById = new Map<string, number>();
  for (const [i, node] of nodes.entries()) {
    if (indexById.has(node.id)) {
      throw new Error(`RenderDAG: duplicate node id "${node.id}"`);
    }
    indexById.set(node.id, i);
  }
  for (const [i, node] of nodes.entries()) {
    for (const [kind, refs] of [
      ['parent', node.parents],
      ['ancestor', node.ancestors],
    ] as const) {
      for (const ref of refs) {
        const refIndex = indexById.get(ref);
        if (refIndex === undefined) {
          throw new Error(`RenderDAG: node "${node.id}" references unknown ${kind} "${ref}"`);
        }
        const orderOk = parentDirection === 'above' ? refIndex < i : refIndex > i;
        if (!orderOk) {
          throw new Error(
            `RenderDAG: ${kind} "${ref}" of node "${node.id}" must be listed ` +
              `${parentDirection === 'above' ? 'before' : 'after'} it (parents="${parentDirection}")`,
          );
        }
      }
    }
  }
}

interface FeedRow {
  rowNode: DagRowNode;
  feedId: string;
  feedAncestors: Ancestor<string>[];
}

/**
 * Build the rows to feed renderdag, in listed order. renderdag draws each
 * row's edges toward its renderdag-"parents" on *later* rows, so for
 * `parents: 'above'` we feed each node's children as its renderdag-parents
 * (preserving edge kind). This is the only place edges are inverted.
 */
function feedRows(nodes: ResolvedNode[], parentDirection: ParentDirection): FeedRow[] {
  const rowNode = (n: ResolvedNode): DagRowNode => ({
    id: n.id,
    glyph: n.glyph,
    message: n.message,
    className: n.className,
  });

  if (parentDirection === 'below') {
    return nodes.map((n) => ({
      rowNode: rowNode(n),
      feedId: n.id,
      feedAncestors: [
        ...n.parents.map((p) => Ancestor.parent(p)),
        ...n.ancestors.map((a) => Ancestor.ancestor(a)),
        ...Array.from({ length: n.anonymousAncestors }, () => Ancestor.anonymous<string>()),
      ],
    }));
  }

  const childEdges = new Map<string, Ancestor<string>[]>(nodes.map((n) => [n.id, []]));
  for (const n of nodes) {
    for (const p of n.parents) childEdges.get(p)!.push(Ancestor.parent(n.id));
    for (const a of n.ancestors) childEdges.get(a)!.push(Ancestor.ancestor(n.id));
  }

  const rows: FeedRow[] = [];
  for (const n of nodes) {
    // Anonymous ancestors render below the fed node in renderdag, which is
    // the wrong side under inversion; synthesize a `~` row above instead.
    // Solid Ancestor.parent edge matches renderdag's native `~` column art.
    for (let k = 0; k < n.anonymousAncestors; k++) {
      rows.push({
        rowNode: { id: `\0anon:${n.id}:${k}`, glyph: '~', message: '', className: 'dag-anon' },
        feedId: `\0anon:${n.id}:${k}`,
        feedAncestors: [Ancestor.parent(n.id)],
      });
    }
    rows.push({ rowNode: rowNode(n), feedId: n.id, feedAncestors: childEdges.get(n.id)! });
  }
  return rows;
}

const L = pipeline.types.LinkLine;

function strokesCell(strokes: CellStrokes): Cell {
  return { type: 'strokes', strokes };
}

function padCell(pad: PadLine): Cell {
  switch (pad) {
    case 'parent':
      return strokesCell({ up: 'solid', down: 'solid' });
    case 'ancestor':
      return strokesCell({ up: 'dashed', down: 'dashed' });
    case 'blank':
      return strokesCell({});
  }
}

/** Style of the edge a flag pair produced; undefined if neither bit is set. */
function styleOf(flags: number, parentBit: number, ancestorBit: number): EdgeStyle | undefined {
  if (L.intersects(flags, parentBit)) return 'solid';
  if (L.intersects(flags, ancestorBit)) return 'dashed';
  return undefined;
}

/** Merge styles where two edges share an arm; solid wins over dashed. */
function combine(...styles: (EdgeStyle | undefined)[]): EdgeStyle | undefined {
  if (styles.includes('solid')) return 'solid';
  if (styles.includes('dashed')) return 'dashed';
  return undefined;
}

/**
 * One link-line cell. Mirrors the branch structure of renderdag's
 * box_drawing.js dispatch (the reference implementation; branches annotated
 * with its glyphs), but selects per-segment solid/dashed from the *_PARENT /
 * *_ANCESTOR flag variants instead of collapsing to 14 glyphs.
 */
function linkCell(cur: number, rowIsMerge: boolean): Cell {
  const vert = styleOf(cur, L.VERT_PARENT, L.VERT_ANCESTOR);
  const horiz = styleOf(cur, L.HORIZ_PARENT, L.HORIZ_ANCESTOR);
  const leftFork = styleOf(cur, L.LEFT_FORK_PARENT, L.LEFT_FORK_ANCESTOR);
  const rightFork = styleOf(cur, L.RIGHT_FORK_PARENT, L.RIGHT_FORK_ANCESTOR);
  const leftMerge = styleOf(cur, L.LEFT_MERGE_PARENT, L.LEFT_MERGE_ANCESTOR);
  const rightMerge = styleOf(cur, L.RIGHT_MERGE_PARENT, L.RIGHT_MERGE_ANCESTOR);
  const fork = combine(leftFork, rightFork);
  const merge = combine(leftMerge, rightMerge);

  if (L.intersects(cur, L.HORIZONTAL)) {
    const h = horiz ?? 'solid';
    const v = vert ?? combine(fork, merge) ?? 'solid';
    if (L.intersects(cur, L.CHILD)) {
      return strokesCell({ up: v, down: v, left: h, right: h }); // ┼─
    } else if (fork && merge) {
      return strokesCell({ up: merge, down: fork, left: h, right: h }); // ┼─
    } else if (fork && L.intersects(cur, L.VERT_PARENT) && !rowIsMerge) {
      return strokesCell({ up: v, down: v, left: h, right: h }); // ┼─
    } else if (fork) {
      return strokesCell({ down: fork, left: h, right: h }); // ┬─
    } else if (merge) {
      return strokesCell({ up: merge, left: h, right: h }); // ┴─
    }
    return strokesCell({ left: h, right: h }); // ──
  } else if (L.intersects(cur, L.VERT_PARENT) && !rowIsMerge) {
    const left = combine(leftMerge, leftFork);
    const right = combine(rightMerge, rightFork);
    if (left && right) {
      return strokesCell({ up: 'solid', down: 'solid', left, right }); // ┼─
    } else if (left) {
      return strokesCell({ up: 'solid', down: 'solid', left }); // ┤
    } else if (right) {
      return strokesCell({ up: 'solid', down: 'solid', right }); // ├─
    }
    return strokesCell({ up: 'solid', down: 'solid' }); // │
  } else if (
    L.intersects(cur, L.VERT_PARENT | L.VERT_ANCESTOR) &&
    !L.intersects(cur, L.LEFT_FORK | L.RIGHT_FORK)
  ) {
    const v = vert!;
    if (leftMerge && rightMerge) {
      return strokesCell({ up: v, down: v, left: leftMerge, right: rightMerge }); // ┼─
    } else if (leftMerge) {
      return strokesCell({ up: v, down: v, left: leftMerge }); // ┤
    } else if (rightMerge) {
      return strokesCell({ up: v, down: v, right: rightMerge }); // ├─
    }
    return strokesCell({ up: v, down: v }); // │ or ╷
  } else if (L.intersects(cur, L.LEFT_FORK) && L.intersects(cur, L.LEFT_MERGE | L.CHILD)) {
    const left = combine(leftFork, leftMerge) ?? 'solid';
    return strokesCell({ up: leftMerge ?? 'solid', down: leftFork ?? 'solid', left }); // ┤
  } else if (L.intersects(cur, L.RIGHT_FORK) && L.intersects(cur, L.RIGHT_MERGE | L.CHILD)) {
    const right = combine(rightFork, rightMerge) ?? 'solid';
    return strokesCell({ up: rightMerge ?? 'solid', down: rightFork ?? 'solid', right }); // ├─
  } else if (leftMerge && rightMerge) {
    return strokesCell({ up: combine(leftMerge, rightMerge), left: leftMerge, right: rightMerge }); // ┴─
  } else if (leftFork && rightFork) {
    return strokesCell({ down: combine(leftFork, rightFork), left: leftFork, right: rightFork }); // ┬─
  } else if (leftFork) {
    return strokesCell({ down: leftFork, left: leftFork }); // ╮
  } else if (leftMerge) {
    return strokesCell({ up: leftMerge, left: leftMerge }); // ╯
  } else if (rightFork) {
    return strokesCell({ down: rightFork, right: rightFork }); // ╭─
  } else if (rightMerge) {
    return strokesCell({ up: rightMerge, right: rightMerge }); // ╰─
  }
  return strokesCell({});
}

/**
 * Our stage 2, replacing renderdag's BoxDrawingPrefixLineRenderer. Emits only
 * non-repeatable lines (no separator or pad lines); term lines mirror the
 * reference's two-line form: a strokes line, then a line of `term` cells.
 */
function shapeToCellLines(shape: GraphRowShape<string>): CellLine[] {
  const lines: CellLine[] = [];

  const nodeCells: Cell[] = shape.nodeLine.map((entry) => {
    switch (entry) {
      case 'node':
        return { type: 'node' };
      case 'parent':
        return strokesCell({ up: 'solid', down: 'solid' });
      case 'ancestor':
        return strokesCell({ up: 'dashed', down: 'dashed' });
      case 'blank':
        return strokesCell({});
    }
  });
  lines.push({ kind: 'node', cells: nodeCells });

  if (shape.linkLine !== null) {
    lines.push({ kind: 'link', cells: shape.linkLine.map((cur) => linkCell(cur, shape.merge)) });
  }

  if (shape.termLine !== null) {
    const termLine = shape.termLine;
    const strokeCells = termLine.map((isTerm, i) =>
      isTerm ? strokesCell({ up: 'solid', down: 'solid' }) : padCell(shape.padLines[i]!),
    );
    const tildeCells: Cell[] = termLine.map((isTerm, i) =>
      isTerm ? { type: 'term' } : padCell(shape.padLines[i]!),
    );
    lines.push({ kind: 'term', cells: strokeCells });
    lines.push({ kind: 'term', cells: tildeCells });
  }

  return lines;
}

/**
 * SVG path data for a full cell line, matching a per-line
 * viewBox="0 0 {2·cells.length} 1": x in ch (the cell at index i spans
 * [2i, 2i+2], stroke center at 2i+0.5), y in lines (0..1, stroke center at
 * 0.5). Node and term cells contribute no paths (they render as overlaid
 * spans), leaving gaps for the glyphs. Solid and dashed path data are
 * returned separately so the template can style them with classes.
 */
// Vertical strokes overdraw past the line's bottom edge: stacked SVGs each
// end their strokes exactly at the boundary, and the two antialiased halves
// composite to less than full ink at fractional device positions, leaving a
// faint 1px seam. The element below always continues the edge (edges are
// continuous across boundaries by construction), so the overdraw lands on
// ink. Bottom-only so path starts stay put and dash phase is unchanged —
// except down-arm right corners, whose path starts at the bottom edge; their
// dashed phase shifts by OVERDRAW (10% of a period), imperceptibly.
// Keep in sync with --dag-overdraw (the fillers' overdraw) in RenderDAG.astro.
const OVERDRAW = 0.05;

export function linePaths(cells: Cell[], corners: CornerStyle): { solid: string; dashed: string } {
  const paths = { solid: [] as string[], dashed: [] as string[] };
  const yBot = 1 + OVERDRAW;
  cells.forEach((cell, i) => {
    if (cell.type !== 'strokes') return; // node/term cells render as spans, not paths
    const s = cell.strokes;
    const [x0, x, x2] = [2 * i, 2 * i + 0.5, 2 * i + 2];
    const armCount = [s.up, s.down, s.left, s.right].filter(Boolean).length;
    const vArm = s.up && !s.down ? s.up : s.down && !s.up ? s.down : undefined;
    const hArm = s.left && !s.right ? s.left : s.right && !s.left ? s.right : undefined;

    if (armCount === 2 && vArm && hArm) {
      // A corner. Both arms belong to one edge, so style them together
      // (solid wins in the rare mixed case).
      const style = combine(vArm, hArm)!;
      const vEnd: [number, number] = [x, s.up ? 0 : 1]; // arc geometry endpoint
      const vTip = s.up ? 0 : yBot; // stroke endpoint, overdrawn for down arms
      if (s.left) {
        // Quarter ellipse between the left edge and the vertical arm's end.
        const sweep = s.up === undefined ? 1 : 0;
        const corner =
          corners === 'curved'
            ? `M ${x0} 0.5 A 0.5 0.5 0 0 ${sweep} ${vEnd[0]} ${vEnd[1]}` +
              (s.down ? ` L ${x} ${vTip}` : '')
            : `M ${x0} 0.5 L ${x} 0.5 L ${x} ${vTip}`;
        paths[style].push(corner);
      } else {
        // Arc to 0.5ch right of center, then a straight run to the cell edge.
        const sweep = s.up === undefined ? 1 : 0;
        const corner =
          corners === 'curved'
            ? (s.down ? `M ${x} ${vTip} L ` : `M `) +
              `${vEnd[0]} ${vEnd[1]} A 0.5 0.5 0 0 ${sweep} ${x + 0.5} 0.5 L ${x2} 0.5`
            : `M ${x} ${vTip} L ${x} 0.5 L ${x2} 0.5`;
        paths[style].push(corner);
      }
      return;
    }

    // Straight-through lines and junctions: independent full/half segments
    // crossing at the center. Same-style opposite arms merge into one segment
    // so dash phase stays continuous through the cell.
    if (s.up && s.up === s.down) {
      paths[s.up].push(`M ${x} 0 L ${x} ${yBot}`);
    } else {
      if (s.up) paths[s.up].push(`M ${x} 0 L ${x} 0.5`);
      if (s.down) paths[s.down].push(`M ${x} 0.5 L ${x} ${yBot}`);
    }
    if (s.left && s.left === s.right) {
      paths[s.left].push(`M ${x0} 0.5 L ${x2} 0.5`);
    } else {
      if (s.left) paths[s.left].push(`M ${x0} 0.5 L ${x} 0.5`);
      if (s.right) paths[s.right].push(`M ${x} 0.5 L ${x2} 0.5`);
    }
  });
  return { solid: paths.solid.join(' '), dashed: paths.dashed.join(' ') };
}

/**
 * Resolves shorthand and defaults, validates, and runs renderdag stage 1
 * (row shaping) followed by our local stage 2 (shapeToCellLines). The Astro
 * template replaces renderdag's text rendering: repeatable pad lines are
 * dropped in favor of a stretchable CSS filler built from `fillerColumns`.
 */
export function dagRows(input: DagNodeInput[], parentDirection: ParentDirection): DagRow[] {
  const nodes = resolveNodes(input, parentDirection);
  validate(nodes, parentDirection);

  // minRowHeight <= 1 is required for the shaper to emit separatorLine for
  // disconnected one-line rows (our HTML rows are naturally one line tall).
  const shaper = new pipeline.GraphRowShaper<string>();
  shaper.optionsMut().minRowHeight = 1;
  return feedRows(nodes, parentDirection).map((row) => {
    const shape = shaper.nextRowShape(row.feedId, row.feedAncestors);
    return {
      node: row.rowNode,
      prefixLines: shapeToCellLines(shape),
      fillerColumns: shape.padLines,
      separator: shape.separatorLine,
    };
  });
}
