# RenderDAG: a general-purpose DAG-drawing Astro component

# SPEC

## Problem statement

Blog posts frequently need small DAG diagrams (session trees, commit graphs,
workflow graphs). Horizontal arrow chains in code blocks don't work well on
mobile and can't show branching. We want a reusable, build-time Astro component
that renders a DAG as compact vertical rows of graph art (in the style of
`git log --graph` / sapling / clauctl), using the `@geraschenko/renderdag`
package for graph layout, with arbitrary HTML for node glyphs and messages so
that posts can style node categories via classes and CSS.

Edges are drawn as SVG/CSS vector strokes rather than font box-drawing glyphs:
a font glyph's stroke position and width are font-internal, so exact cross-row
alignment is impossible with text, and Unicode has no dashed corner/tee glyphs
so ancestor edges cannot stay dashed through turns. Drawing our own strokes
gives exact alignment, fully dashed ancestor edges, and CSS control over
stroke width, dash rhythm, and color.

The first consumer is the claude-sdk compaction post, which will replace its
horizontal `1 → 2 → 3 → 4`-style code blocks with vertical DAG diagrams.

## Success criteria

- `<RenderDAG nodes={["1", "2", "3", "4"]} />` renders a vertical chain of four
  rows, one line per node, oldest (first-listed) at top.
- Branches and merges render with correct edge art. Display order is always
  exactly the listed order.
- Vertical edge strokes sit exactly at their column centers (`(2·col+0.5)ch`)
  in both prefix cells and fillers — no kinks at row boundaries, independent
  of the reader's font. Pixel-verifiable in a screenshot.
- Ancestor (indirect) edges are dashed along their entire path, including
  corners and tees.
- `corners` prop: `'curved'` (default) draws rounded arcs; `'square'` draws
  right angles. Junctions of three or more strokes are always square.
- Stroke width, dash rhythm, and color are controllable from CSS
  (`--dag-line-width`, dash custom properties, `currentColor`) without
  touching the component.
- Glyph and message accept arbitrary inline HTML; per-node classes let posts
  style categories (summary, boundary, dim, ...) with CSS.
- Messages may wrap or contain multiple lines; edge columns visually continue
  through tall messages (no gaps, no truncation).
- Vertical edges are visually continuous across rows (`line-height: 1` in the
  graph prefix).
- Invalid input (duplicate ids, unknown parent references, a parent violating
  the direction-dependent ordering requirement) fails the build with a clear
  error.
- No client-side JavaScript; all rendering happens at build time.
- A branchy `parents="below"` example renders correctly (note node 2 exercises
  the direction-aware default parent — the next listed node, 1):

  ```jsx
  <RenderDAG parents="below" nodes={[
    {id: "4", glyph: "x", parents: ["2", "3"], message: "final"},
    {id: "3", glyph: "o", parents: ["1"], message: "middle"},
    {id: "2", glyph: "o", message: "middle"},
    {id: "1", glyph: "o", message: "start"},
  ]} />
  ```

  produces edge structure equivalent to the following (as rendered by the
  test-only text projection of the cell model; structure verified against
  renderdag 0.1.0):

  ```text
  x    final
  ├─╮
  │ o  middle
  o │  middle
  ├─╯
  o  start
  ```

## Definitions

- **Our parent notion**: `parents` on a node names the nodes it descends from,
  exactly as in the domain being drawn (session files, commit graphs).
- **`parents: 'above' | 'below'` (component prop, default `'above'`)**: whether
  a node's parents are drawn above it (time flows down; the compaction-post
  case) or below it (renderdag's native `git log` orientation, newest first).
  In both cases display order is the listed order; the prop only controls edge
  direction handling.
- **Ordering requirement (direction-dependent)**: every parent must be listed
  on its parent-direction side of the child — before the child for `'above'`,
  after it for `'below'`. Equivalently, the list is a linear extension of the
  DAG read in display order.
- **Default parent (direction-dependent)**: when `parents` is omitted, it
  defaults to the adjacent listed node on the parent side — the previous node
  for `'above'`, the next node for `'below'`. The boundary node (first for
  `'above'`, last for `'below'`) defaults to a root (`parents: []`). A plain
  chain is therefore `["1","2","3"]` under `'above'` and `["3","2","1"]` under
  `'below'`.
- **Ancestors (indirect edges)**: `ancestors` names nodes the node eventually
  descends from without a direct edge (renderdag's `Ancestor.ancestor`, drawn
  dashed). Same ordering requirement as parents. Listing a node in `ancestors`
  never triggers the default parent — see below.
- **Anonymous ancestors**: `anonymousAncestors: number` says the node's
  ancestry continues beyond the drawn graph (renderdag's `~` terminator). The
  `~` must always appear on the **parent side** of the node: below it for
  `'below'` (renderdag native), above it for `'above'`.
- **Default parent suppression**: the adjacent-node default applies only when
  `parents`, `ancestors`, and `anonymousAncestors` are all omitted. If any is
  present, an omitted `parents` means `[]`.
- **renderdag inversion**: renderdag draws each node's edges toward its
  renderdag-"parents", which appear on *later* rows. For `parents: 'above'` we
  therefore feed renderdag each node's *children* as its renderdag-parents,
  preserving edge kind (parent vs ancestor). This is the only place edges are
  inverted; everywhere else in our code, "parent" means our notion.
- **Synthetic `~` rows (`'above'` only)**: an anonymous ancestor cannot attach
  to its own node's feed under inversion (renderdag terminators render below
  the fed node — the wrong side). Instead, each anonymous ancestor becomes a
  synthetic row inserted immediately before its node: glyph `~`, empty
  message, class `dag-anon`, fed with a solid `Ancestor.parent(node)` edge
  (matching the solid `│ … ~` art renderdag draws natively). Under `'below'`,
  no synthesis: attach `Ancestor.anonymous()` entries to the node's own feed.
- **Cell**: prefix lines are sequences of 2ch-wide, one-line-tall cells
  (matching renderdag's 2-char columns). A cell's strokes radiate from its
  center `(0.5ch, 0.5·line)`: up/down/left arms reach the cell edge (0.5ch
  each side, half a line vertically); the right arm spans the remaining
  1.5ch so horizontals connect to the next column. A cell is either a stroke
  set, the node-glyph slot, or a `~` terminator (rendered as literal text —
  logically a node glyph).
- **Corner/junction rule**: exactly two perpendicular strokes form a corner —
  an elliptical quarter arc under `corners='curved'`, a right angle under
  `'square'`. Three or more strokes form a square junction (tees are square
  even in curved mode, matching git-log-style art).
- **Per-segment dash policy**: each stroke's style comes from whichever
  layout flag produced it — ancestor-derived strokes are dashed (including
  through corners), parent-derived strokes solid. One cell may mix styles
  (e.g. a solid vertical crossed by a dashed horizontal).

## Type design

```ts
// src/components/render-dag.ts
import type { GraphRowShape, PadLine } from '@geraschenko/renderdag';
// GraphRowShape: stage-1 output (nodeLine, linkLine flags, termLine, padLines,
//   merge, separatorLine) — the input to our local stage 2
// PadLine: per-column pad spec ('blank' | 'parent' | 'ancestor')

export type EdgeStyle = 'solid' | 'dashed';
export interface CellStrokes {
  up?: EdgeStyle;
  down?: EdgeStyle;
  left?: EdgeStyle;
  right?: EdgeStyle;
}
export type Cell =
  | { type: 'strokes'; strokes: CellStrokes }
  | { type: 'node' }   // the HTML glyph slot (glyph in the left 1ch)
  | { type: 'term' };  // anonymous-ancestor terminator, rendered as '~' text
export type CellLineKind = 'node' | 'link' | 'term';
export interface CellLine { kind: CellLineKind; cells: Cell[] }

export interface DagNodeSpec {
  id: string;
  parents?: string[];   // OUR parents; default: adjacent node on the parent side (see Definitions)
  ancestors?: string[];  // OUR eventual ancestors (indirect, drawn dashed); default []
  anonymousAncestors?: number; // ancestry continuing beyond the drawn graph (~); default 0
  glyph?: string;     // inline HTML for the node marker (~1ch wide); default '•'
  message?: string;   // inline HTML; default HTML-escaped id; may be multiline/wrapping
  class?: string;     // extra class(es) applied to this node's row
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
  fillerColumns: PadLine[]; // per-column spec for the stretchable filler under the prefix
  separator: boolean;       // render a small spacer row before this row
}

// Resolves shorthand and defaults, validates, runs renderdag stage 1
// (GraphRowShaper) and our local stage 2 (shape → cell lines).
// Throws Error (failing the Astro build) on: duplicate id, parents referencing
// an unknown id, or a parent violating the direction-dependent ordering
// requirement (see Definitions).
export function dagRows(input: DagNodeInput[], parentDirection: ParentDirection): DagRow[];

// Internal (not exported): shapeToCellLines(shape: GraphRowShape<string>):
// CellLine[] — our stage 2, replacing BoxDrawingPrefixLineRenderer. Mirrors
// renderdag's box_drawing.js LinkLine-flag dispatch branch-for-branch (the
// reference implementation), but selects per-segment solid/dashed from the
// *_PARENT / *_ANCESTOR flag variants instead of collapsing to 14 glyphs,
// and emits only non-repeatable lines (no separator or pad lines). Term
// lines mirror the reference's two-line form: a strokes line, then a line
// of `term` cells.

export type CornerStyle = 'curved' | 'square';

// Pure geometry for the template: SVG path data for a full cell line,
// matching a per-line viewBox="0 0 {2·cells.length} 1": x in ch (the cell
// at index i of `cells` spans [2i, 2i+2], stroke center at 2i+0.5), y in
// lines (0..1, stroke center at 0.5). Node and term cells contribute no
// paths (they render as overlaid spans), leaving gaps for the glyphs.
// Solid and dashed path data are returned separately so the template can
// style them with classes.
export function linePaths(cells: Cell[], corners: CornerStyle): { solid: string; dashed: string };
```

```astro
// src/components/RenderDAG.astro
// Props: {
//   nodes: DagNodeInput[];
//   parents?: ParentDirection; // default 'above'
//   corners?: CornerStyle;     // default 'curved'
// }
```

Template structure per `DagRow` (one flex row per node):

```html
<figure class="render-dag">
  <div class="dag-row {node.className}">      <!-- display: flex -->
    <div class="dag-prefix">                   <!-- monospace metrics (ch), line-height: 1 -->
      <!-- prefill: a ~0.35em filler SVG painted with the PREVIOUS row's
           fillerColumns, centering the node line on the message's first line
           while keeping cross-row edges continuous -->
      <!-- one div per CellLine ({2·cells.length}ch wide, position: relative):
           · one <svg class="dag-cells" viewBox="0 0 {2·cells.length} 1"
             preserveAspectRatio="none"> filling the line, holding
             <path class="dag-stroke-solid" d={solid}> and
             <path class="dag-stroke-dashed" d={dashed}> from
             linePaths(cells) — node/term cells contribute no paths
           · per node/term cell, an absolutely-positioned 1ch
             <span class="dag-glyph"> at left: {2i}ch (HTML glyph via
             set:html / literal '~'), centered on the stroke column -->
      <div class="dag-postfill">               <!-- flex-grow wrapper (a plain div:
           the SVG's intrinsic 150px height would inflate the flex container)
           holding an absolutely-filling <svg class="dag-filler"> with one
           <line class="dag-stroke-*"> per non-blank fillerColumn: solid for
           'parent', dashed for 'ancestor'. Filler SVGs have NO viewBox (user
           units = CSS px, so height stretches without scaling stroke or dash
           geometry) and position lines by percentage of their 2n·ch width,
           resolving to the same (2i+0.5)ch centers as the cell SVGs. -->
    </div>
    <div class="dag-msg" set:html={message}>
  </div>
</figure>
```

Stroke styling (single source of truth for alignment):

- **All edge ink is SVG strokes** — cell paths and filler lines alike. CSS
  gradients rasterize differently from SVG strokes (measured: 3px vs 2px
  width and a half-device-pixel center offset at 2× scaling), which showed
  as wobble at every cell/filler handoff; a single rasterizer makes every
  segment of a column render identically by construction.
- `--dag-line-width` (default `1.5px`): `stroke-width` everywhere (cell
  paths add `vector-effect: non-scaling-stroke` so it stays fixed-px under
  the non-uniform viewBox scale; filler lines are unscaled, px = px).
- Vertical stroke centers: cell SVG x = `2i+0.5` user units scale to
  `(2i+0.5)ch`; filler lines sit at the same fraction of their SVG's width.
  Same math → exact alignment.
- Dash rhythm is em-based via `--dag-dash` (dash/gap length in em),
  consumed by everyone as `stroke-dasharray: calc(var(--dag-dash) * 1em)`.
  For filler lines user units are CSS px, so em resolves directly; cell
  paths use `non-scaling-stroke`, which computes the whole stroke — dash
  pattern included — in screen space, where the em length also lands
  exactly. (A unitless value on cell paths would mean fractions of a
  screen pixel and render as dust.)
- Strokes use `stroke="currentColor"`; row classes recolor edges via CSS.

Component styles are `:global()` under `.render-dag` (scoped styles can't reach
`set:html` content).

## Data flow

1. MDX post passes `nodes` (and optionally `parents`, `corners`) to
   `RenderDAG.astro`.
2. `dagRows` expands string shorthand, applies defaults (direction-aware
   adjacent-node parent, glyph, message), and validates.
3. For `'above'`, it builds a child map preserving edge kind (the renderdag
   inversion) and inserts synthetic `~` rows for anonymous ancestors; for
   `'below'`, edges pass through verbatim and anonymous ancestors become
   `Ancestor.anonymous()` entries on the node's own feed.
4. It feeds nodes in listed order to renderdag stage 1 (`GraphRowShaper`),
   then converts each `GraphRowShape` to `CellLine[]` with our local stage 2
   (`shapeToCellLines`), collecting per-node cell lines, `padLines`
   (→ `fillerColumns`), and `separatorLine`.
5. The Astro template (our replacement for renderdag's rendering stages)
   renders each `DagRow` to static HTML: each prefix line becomes one inline
   SVG whose path data comes from `linePaths(line.cells, corners)`, with
   node/term cells overlaid as positioned spans (HTML glyph / literal `~`),
   plus a stretchable SVG-line filler for tall messages and the message
   block beside them.

## Cost

- All compute at build time, O(n) in node count; negligible for blog-sized
  graphs. No client JS. Output is a handful of divs plus a few small SVGs per
  node.
- Complexity concentrates in three places (review focus):
  - **Our stage divergence**: renderdag's text mode flows extra message
    lines beside link lines; we attach the whole message block top-aligned at
    the node line, with link lines below. Deliberate simplification.
  - **Dispatch fidelity**: `shapeToCellLines` re-derives cell shapes from
    `LinkLine` bitflags. Mitigation: mirror the reference `box_drawing.js`
    dispatch branch-for-branch, and golden-test the cell model's text
    projection against native renderdag output across the test corpus.
  - **Geometry/alignment**: the SVG coordinate mapping (x = ch, y = line) and
    the shared custom properties are the single source of truth tying cell
    strokes, prefill, and fillers together. Verify with a pixel-measured
    screenshot before converting posts.

## Edge cases

- The boundary node (first for `'above'`, last for `'below'`) has no adjacent
  node on the parent side → defaults to a root (`parents: []`).
- Multiple roots: `parents: []` explicitly. Disconnected rows may produce
  `separator: true` → rendered as a small spacer row (not a full-height row).
- Merge nodes (multiple parents) and branch points both supported; under
  `'above'`, our merges become renderdag forks and vice versa — invisible to
  callers.
- Glyphs wider than ~1ch or block-level glyph HTML will misalign columns:
  documented limitation, not validated.
- Horizontal and vertical dashes share the same 0.25em rhythm: under
  `non-scaling-stroke` the dash pattern is measured along the path in
  screen space, so it is uniform in every direction (including corner
  arcs) regardless of the non-uniform ch/em viewBox scale.

## Non-goals (for now)

- Horizontal orientation (newest-at-right, rotated messages). The design keeps
  `DagRow` orientation-agnostic so this can be added as an alternative
  template/renderer later; the cell model makes that easier than box-drawing
  text would have.
- User-facing text output. The box-drawing text projection of the cell model
  lives only in the test helper (readable golden snapshots); DEC/ASCII glyph
  sets are irrelevant to HTML.
- Changes to renderdag-ts for this feature: exposing its glyph dispatch as a
  semantic cell renderer would deviate from the Rust source it ports, and its
  14-glyph vocabulary is lossy for per-segment dash styles anyway. Our stage 2
  consumes the already-public `GraphRowShape`.
- A `SessionTree` wrapper component. The compaction post will use `RenderDAG`
  directly with classes; extract a wrapper only if that feels bulky.
- Sanitizing glyph/message HTML: input is author-written MDX, trusted.
- Validating that a node id appears in at most one of a node's `parents` /
  `ancestors` lists; renderdag draws whatever it's given.

# IMPLEMENTATION IDEAS

- Use `pipeline.GraphRowShaper` (stage 1) directly, not `GraphTextRenderer`;
  our local `shapeToCellLines` replaces stage 2 (originally
  `BoxDrawingPrefixLineRenderer`, which remains the dispatch reference) and
  the Astro template replaces text stage 3. `minRowHeight = 1` must be set on
  the shaper for `separatorLine` (see Implementation-Time Decisions).
- The renderdag inversion for `'above'` was verified empirically (2026-07-23):
  feeding listed order with children-as-parents renders correct oldest-first
  art with no glyph mirroring. Merges/forks swap roles but render correctly.
- Filler line positions: columns are 2ch wide; vertical lines sit at
  `(2·col + 0.5) · 1ch`. (Originally CSS gradients; superseded by SVG
  `<line>` fillers — see the stroke-styling contract in SPEC.)
- Verified (2026-07-23, box_drawing.ts): BoxDrawing emits per row exactly
  [node line, link?, term?, one repeatable `postAncestry` pad line]. So the
  message top-aligns with the first line unconditionally, and "drop repeatable
  lines, use the CSS filler instead" removes exactly that final pad line.
- Testing (decided 2026-07-23): **vitest**, with `vitest.config.ts` wrapping
  Astro's `getViteConfig()` so tests share the site's resolution pipeline
  (`@components` alias, future Container-API component tests). Test `dagRows`
  as a pure function: validation errors, and golden box-art via
  `toMatchInlineSnapshot` (render `prefixLines` parts to plain text with 'o'
  glyphs).
- Anonymous/ancestor rendering verified empirically (2026-07-23):
  - Native feed: anonymous ancestor renders as a solid column ending in `~`
    below the node; named ancestor edges show as dashed continuation glyphs
    (`╷`) and `'ancestor'` pad columns.
  - Inverted feed: the synthetic-`~`-row mirror renders correctly (`~`
    directly above its node, edge threading through intervening rows). Use
    `Ancestor.parent()` for the synthetic edge — `Ancestor.ancestor()` gives
    dashed art, but native `~` columns are solid.

## SVG renderer derisk findings (2026-07-23, all approved by Anton)

Motivation: exact horizontal alignment of vertical edge strokes is impossible
with font box glyphs (stroke position/width are font-internal), so we draw
the edges ourselves. Bonus fidelity win: dashed ancestor *corners/tees*,
which Unicode cannot express (it has dashed `╎`/`╌` but no dashed corner or
tee glyphs) — stage 1's `LinkLine` bitflags carry distinct `*_PARENT` /
`*_ANCESTOR` variants for every component, so the box renderer's 14-glyph
collapse is what discards dashedness at corners, not the data.

- **renderdag-ts stays untouched.** Exposing the flag dispatch as a semantic
  cell renderer upstream would deviate from the Rust source, and its
  14-glyph output is already lossy for our purposes. Instead we write a
  local stage-2 renderer consuming `GraphRowShape` directly (public as of
  v0.1.1), mirroring `box_drawing.js`'s dispatch branch-for-branch as the
  reference but selecting per-segment styles instead of glyphs.
- **Cell representation** (approved type design): each prefix-line cell is
  2ch wide with strokes radiating from the cell center (0.5ch, mid-line);
  the right arm spans the remaining 1.5ch.

  ```ts
  type EdgeStyle = 'solid' | 'dashed';
  interface CellStrokes { up?: EdgeStyle; down?: EdgeStyle;
                          left?: EdgeStyle; right?: EdgeStyle }
  type Cell = { type: 'strokes'; strokes: CellStrokes }
            | { type: 'node' }    // the HTML glyph slot
            | { type: 'term' };   // rendered as literal '~' text
  interface CellLine { kind: PrefixLineKind; cells: Cell[] }
  ```

  Every box glyph decomposes into a stroke set (`╮` = left+down, `├` =
  up+down+right, `╷` = dashed up+down, `┼` = all four). `DagRow.prefixLines`
  becomes `CellLine[]`; the renderdag `PrefixLine` re-export leaves our
  public surface.
- **Rendering rules:** exactly two perpendicular strokes → corner, drawn as
  an arc (`corners="curved"`, default) or right angle (`"square"`) — this is
  where the deferred square/curved API lands, as a component prop affecting
  only path generation. Three or more strokes → square junction (matches
  text art: tees are square even in the curved glyph table).
- **Dash policy at mixed cells:** each segment's style comes from whichever
  flag produced it — an ancestor merge gets a fully dashed corner; a solid
  vertical crossed by a dashed horizontal is mixed within one cell.
- **SVG mechanics:** one inline `<svg>` per prefix line spanning all cells
  (node/term glyphs overlaid as absolutely-positioned spans; `linePaths`
  leaves gaps at their cells), `viewBox` in cell units,
  `preserveAspectRatio="none"`, CSS-sized in `ch` × line-height,
  `vector-effect="non-scaling-stroke"`, `stroke="currentColor"`. Stroke
  width is **fixed px** (crisp; avoids subpixel blur) via a shared
  `--dag-line-width` custom property (default 1.5px). One SVG per line
  (not per stroke run) because browsers pixel-snap each SVG element's
  rendering origin: an SVG starting at a fractional mid-line offset (after
  a 2ch glyph span) shifts its strokes up to half a pixel relative to
  neighboring lines and fillers.
- **Fillers are SVG lines too** (superseding the original "fillers stay CSS
  gradients" decision: gradients rasterize differently from SVG strokes,
  which showed as thickness/position wobble at handoffs). The stretch
  problem the gradients were meant to solve is handled by omitting the
  viewBox: filler user units are CSS px, so height stretches freely while
  `stroke-width` and an em-based `stroke-dasharray` stay fixed.
- **CSS control** is a design goal: stroke width, dash pattern, and color
  all become plain CSS (classes like `.dag-stroke-dashed`; rows already
  accept a `class` prop for per-node styling).
- **Text rendering becomes test-only:** the `art()` test helper maps stroke
  sets back to box chars so golden snapshots stay readable text art (dashed
  corners have no char — helper renders the nearest solid corner; dashedness
  is asserted separately where it matters).

# WORK LOG

**Instructions**: Update this section during each work session. Add new tasks, mark completed ones with [x], document decisions and problems encountered.

- [x] 2026-07-23: Derisk discussion. Decisions: previous-node parent default in
  RenderDAG; `parents: 'above' | 'below'` prop (default `'above'`), display
  order always = listed order; custom HTML stage 3 replacing
  `PrefixLinesToText` (no sentinel hack); multiline messages via stretchable
  CSS filler from `padLines`; `line-height: 1` for edge continuity;
  `minRowHeight: 1`; `separator` → small spacer row; no SessionTree wrapper
  for now; spec lives in docs/specs/.
- [x] 2026-07-23: Verified children-as-parents inversion empirically against
  `@geraschenko/renderdag` 0.1.0 (installed into this repo).
- [x] 2026-07-23: Review round: added branchy `parents="below"` example with
  golden art. This exposed that the ordering requirement and the default
  parent are direction-dependent; Definitions, validation, and success
  criteria updated accordingly.
- [x] 2026-07-23: Review round 2: vitest decided. Added `ancestors` +
  `anonymousAncestors` (renamed from `anonymous_ancestors`, camelCase/number)
  with direction-dependent `~` placement: native feed attachment for
  `'below'`, synthetic `~` rows for `'above'` (verified empirically). Default
  parent suppressed when any ancestry field is present.
- [x] 2026-07-23: Set up vitest (`npm i -D vitest`, `vitest.config.ts` via
  `getViteConfig`, `npm test` script).
- [x] 2026-07-23: Implement `src/components/render-dag.ts` (`dagRows`) with
  tests (15 passing; golden box-art snapshots verified against native
  renderdag text output).
- [x] 2026-07-23: Implement `src/components/RenderDAG.astro` (template +
  global styles).
- [x] 2026-07-23: Screenshot check (headless Firefox on the built site): edge
  continuity, filler alignment, multiline wrapping message, dashed ancestors,
  synthetic `~` row, HTML glyph, separator spacing all render correctly.
- [x] 2026-07-23: Convert compaction-post diagrams (TUI view, relinked chains,
  chain formula); prose mentions and YAML snippets left as-is. Conversion kept
  minimal: plain chains with default glyphs; the `[compacted]` TUI entry uses
  glyph `○` and a `<code>` message. Styling/classes for summary/boundary
  categories deferred to review.
- Note: `src/pages/dag-test.astro` is a temporary visual-check page (renders
  all component features); delete before publishing or keep as a demo.
- [ ] 2026-07-23 review feedback round (TDC comments in commit 1758f99).
  **All proposals below APPROVED by Anton 2026-07-23**, except the
  square/curved glyph-set API, which is DEFERRED to the SVG round (it will
  likely become a corner-style knob on the SVG renderer rather than a
  renderdag glyph-table choice; remove that TDC comment when starting the
  SVG design). Implementation order: dev-only page, escapeHtml TDC removal,
  `'•'` default glyph (remove each TDC comment as it's addressed), then the
  CSS/SVG renderer as a spec expansion (see below). The renderdag-ts
  PrefixLine-export handoff is being handled by Anton via another agent;
  he'll report back when the package is updated.
  **Small items completed 2026-07-23:**
  - [x] dev-only page verified: `npm run dev` serves /dag-test (200, correct
    content); `npm run build` emits no dist/dag-test and the sitemap has no
    entry for it.
  - [x] escapeHtml TDC removed; the 5-liner stays with a rationale comment
    (JS has no stdlib HTML-escape).
  - [x] Default glyph changed `'●'` → `'•'`; TDC removed; snapshots updated
    with `vitest run -u` (pure glyph substitution, art unchanged) plus one
    non-snapshot assertion; 15/15 tests pass; screenshot-checked — the
    bullet is visibly lighter and stays centered on its edge column.
  **CSS/SVG stage-2 renderer approved** as the alignment fix (skip the
  webfont and em-sizing mitigations; go straight to drawing edges
  ourselves). To be specced by EXPANDING THIS SPEC (not a separate doc).
  Derisk round completed 2026-07-23 — all open questions resolved and the
  cell/stroke type design approved; see "SVG renderer derisk findings" in
  IMPLEMENTATION IDEAS. Also done 2026-07-23: renderdag bumped to v0.1.1
  (Anton, via the other agent) and our imports updated to use the now-public
  root exports (`PrefixLine`, `isRepeatable`); fixed implicit-`any` errors
  in the `devPages` integration with an `AstroIntegration` annotation;
  15/15 tests and `astro check` clean.
- [ ] 2026-07-23: SPEC section rewritten for the SVG renderer (problem
  statement, success criteria, cell/corner/dash definitions, type design
  with `CellLine`/`linePaths` and the `corners` prop, data flow, cost, edge
  cases incl. dash-rhythm anisotropy, non-goals). Critique pass fixed:
  prefill added to the template sketch, `linePaths` coordinates made
  explicitly run-relative, `corners` added to data flow, stale
  BoxDrawing/minRowHeight claim in IMPLEMENTATION IDEAS corrected. Spec
  APPROVED by Anton 2026-07-23; implementation approved.
- [x] SVG renderer implementation (2026-07-23), all done:
  - [x] Type stubs compiled first, then implementation.
  - [x] `shapeToCellLines` mirrors box_drawing.js dispatch; all 15 existing
    golden snapshots reproduced BYTE-FOR-BYTE unchanged through the new
    pipeline (strong port-fidelity evidence). Added a dashed-corner
    assertion test (moving ancestor edge: `{up: dashed, left: dashed}`
    corner plus a mixed `├` cell with solid vertical + dashed right arm —
    fidelity box chars can't express). BoxDrawing TDC comment removed.
  - [x] `linePaths` implemented with 6 unit tests (arcs with hand-verified
    sweep flags, square polylines, per-arm junction styling, dash-phase
    merging of opposite same-style arms). 22/22 tests pass.
  - [x] `RenderDAG.astro` rewritten: SVG runs via a `lineRuns` splitter,
    node/term cells as 2ch spans, `corners` prop, shared
    `--dag-line-width`/`--dag-dash` custom properties; `white-space: pre`
    and the whitespace-tight markup requirement are gone (flex layout
    ignores whitespace-only nodes).
  - [x] dag-test: added `corners="square"` and dashed-ancestor-corner
    examples.
  - [x] Screenshot verification (headless Firefox + PIL): vertical strokes
    measure EXACTLY x=25–26 (col 0) and x=49–50 (col 1) through SVG cells,
    link lines, and gradient fillers — no kinks; bullet-row gaps identical
    to the old rendering; dashed corner and square corners render
    correctly; compaction post renders correctly unchanged.
  - [x] 22/22 tests, `astro check` 0 errors, `npm run build` green.
  - **dag-test dev-only**: proposal — move the page to
    `src/dev-pages/dag-test.astro` and add a tiny inline integration in
    `astro.config.mjs` that `injectRoute`s it only when `command === 'dev'`.
    (Underscore-prefix would disable it in dev too; there is no built-in
    dev-only page mechanism for static builds.)
- [x] SVG-origin alignment fix (2026-07-23, approved by Anton): Anton's
  screenshot showed residual vertical-connector jogs. Diagnosis (measured
  via getBoundingClientRect + pixel screenshots + a minimal isolated repro):
  layout was subpixel-exact, but Firefox pixel-snaps each SVG element's
  rendering origin, so SVG runs starting mid-line after a 2ch glyph span
  (fractional x, e.g. 21.667px) shifted their strokes ~0.4px relative to
  full-line SVGs and gradient fillers. Fix: one full-width SVG per prefix
  line (`linePaths(line.cells)` over the whole line — node/term cells
  already contribute no paths), glyphs overlaid as absolutely-positioned
  1ch spans at `left: {2i}ch`; `lineRuns` deleted, no `render-dag.ts` logic
  changes. Verified: node-line strokes now measure identical pixel columns
  to link lines and fillers ([44,45] throughout); all dag-test examples and
  the compaction post render correctly; 22/22 tests, `astro check` clean,
  build green. Known residual: SVG strokes vs. gradient fillers rasterize
  by different mechanisms, so at fractional display scaling they can differ
  by < 0.5 device px (antialiasing asymmetry, not a jog); fixing that would
  need SVG fillers, which can't keep a height-independent dash rhythm.
  [The residual was NOT acceptable in practice — see the next entry. The
  dash-rhythm objection was wrong: it assumed viewBox scaling.]
- [x] SVG-line fillers (2026-07-23): Anton's 2× screenshot showed the
  residual was a real defect: gradient filler segments rendered 3 device px
  wide at center 29 while SVG segments rendered 2 px at center 28.5 —
  thickness + offset wobble at every cell/filler handoff. Isolated repro
  confirmed: at identical fractional coordinates, a viewBox-scaled path and
  a no-viewBox percentage-positioned `<line>` rasterize pixel-identically,
  while a CSS gradient does not; and CSS `stroke-dasharray:
  calc(0.25em …)` on a no-viewBox line keeps exact em rhythm regardless of
  element height (the earlier "SVG dashes can't stretch" concern only
  applies under viewBox scaling). Fix: fillers are `<svg>` (no viewBox)
  with one `<line>` per non-blank column at a percentage x of the 2n·ch
  width; `fillerStyle` → `fillerLines`; gradient custom properties removed;
  filler dashes via `calc(var(--dag-dash) * 1em)`. Gotcha: a replaced
  element's intrinsic 150px height inflates the flex container's intrinsic
  size even with `height: 0`/`min-height: 0` (measured: rows grew to
  174px), so the postfill SVG sits absolutely inside a plain flex-grow div.
  Verified: grayscale stroke profiles are now byte-identical across every
  segment of a column (cells, corner legs, fillers); only faint AA overlap
  at seam rows. All dag-test examples + compaction post correct; 22/22
  tests; `astro check` clean; build green.
- [x] **Seam gaps → downward overdraw** (Anton, 2026-07-23 18:50, screenshot
  `~/Pictures/Screenshots/Screenshot_2026-07-23_18-50-42.png`): thickness
  and alignment right, but ~1px horizontal gaps remained in vertical edges
  at element boundaries. Measured in the screenshot: single rows where edge
  ink drops from 214 to 57–143, at prefix-line and row boundaries — each
  stacked SVG ends its stroke exactly at its box edge, and at fractional
  device positions the two antialiased halves composite to less than full
  ink. Fix: every vertical stroke overdraws 0.05em past its element's
  BOTTOM edge only (`OVERDRAW = 0.05` in `linePaths` user units;
  `--dag-overdraw: 0.05em` for fillers — postfill via
  `height: calc(100% + …)`, prefill via extra SVG height plus a
  compensating negative margin since it's a flex item). Downward-only
  works because the element below always continues the edge (edge
  continuity by construction), and it leaves dash phase untouched for
  every path that starts at its top — the one exception is down-arm right
  corners (`╭`), whose path starts at the bottom edge and gains a
  `M x 1.05 L x 1` stub, shifting their dashed phase by 10% of a period
  (imperceptible). Verified at a forced fractional font size (17.3px via
  headless-profile userContent.css, which reproduced blank seam rows at
  DPR 1): previously-blank seam rows (ink 6–8) now carry full ink
  (165–166); the only other change is slight AA-overlap darkening at three
  seam rows (166→203), the known-acceptable class. 22/22 tests
  (three `linePaths` expectations updated for the overdrawn endpoints),
  `astro check` clean, build green. Awaiting Anton's on-display check.
- [x] **Overdraw bumps vs seam robustness — interim accepted, redesign
  deferred** (Anton, 2026-07-23
  19:17, screenshot `Screenshot_2026-07-23_19-17-08.png`): the 0.05em
  overdraw creates 1–2 device-px "bumps" — measured as the stroke's side
  AA fringe doubling in opacity (26→47, 85→135 out of 255) over the
  overlap length. Anton's mitigation: `--dag-overdraw: 0.006em` (fillers
  only; cell `OVERDRAW` still 0.05), which looks clean on his 2× display.
  Follow-up findings (all measured):
  - **No residual line spacing** — getBoundingClientRect at fractional
    page offset: prefix-line height exactly 1em (20.000px), all gaps
    exactly 0.000 (prefill→line, line→postfill, row→row). The negative
    prefill margin works. Boundaries land at fractional positions
    (x.517px) because of content above the component; that fractionality
    is the trigger, not spacing.
  - **0.006em is not robust**: at DPR 1 with fractional offset, the
    current committed state brings back ~23 fully blank seam rows at
    filler boundaries (ink 159 → 0). It works on Anton's display because
    the tiny extension flips/raises boundary-pixel coverage there, not
    because it covers a worst-case (up to ~1 device px) snap gap.
  - **Joint artifact taxonomy** (isolated 3-way test: sibling SVGs vs
    nested `<svg>` viewports vs em-coordinate lines in one SVG): ANY
    joint between two butt-capped stroke ends produces an artifact —
    abutting ends under-cover the boundary pixel (light seam; SVG
    composites per-shape, coverage doesn't sum), overlapping ends
    over-darken partial-alpha fringe pixels (bump). Sibling SVGs
    additionally snap their rasterizations independently. Grouping into
    one SVG does NOT fix a butt joint (measured 191→164 at the joint).
  - **Implication**: no overdraw constant is artifact-free at all
    DPR/zoom combinations; the artifact count is proportional to the
    number of stroke JOINTS. The robust design direction: one SVG per
    prefix drawing each column's vertical as a single continuous path
    through prefill + all lines + postfill (SVG length attributes accept
    em and %, so fixed-em line geometry and stretchy percentage fillers
    can coexist in one no-viewBox SVG), leaving joints only at real
    corners and one per row boundary (small overdraw there). Requires
    type-design discussion (linePaths reshaping) before implementation.
    Anton's decision: the 0.006em state is a fine interim fix; the
    unified-SVG redesign is appealing but deferred as a substantially
    larger change.
- [x] **Cell dash spacing fix** (Anton, 2026-07-23 19:58, screenshot
  `Screenshot_2026-07-23_19-58-54.png`): ancestor-edge dashes "insanely
  closely spaced" on cell lines (measured: ~3px period dust) while filler
  stretches were correct (0.5em period). Cause: `vector-effect:
  non-scaling-stroke` computes the entire stroke — dash pattern included —
  in SCREEN space, so the cells' unitless `stroke-dasharray: 0.25` meant
  0.25 screen px, not 0.25 user units (isolated test: unitless renders as
  a fused solid line; the same path with `0.25em` renders 5px/5px at 20px
  font, identical to a filler; same in both Firefox and Brave). Fix: one
  em-based rule for everyone — `.dag-stroke-dashed { stroke-dasharray:
  calc(var(--dag-dash) * 1em) … }`, filler-specific override deleted
  (screen-space em == filler-user-unit em). Side effect: horizontal
  dashed arms now dash at 0.25em instead of effectively-solid dust.
  Verified: page diff shows only the dashed-ancestor example changed;
  its cell vertical went from fused runs to a clean 5/5 rhythm matching
  fillers. 22/22 tests, `astro check` clean, build green.
  - **escapeHtml**: JS/Node has no standard-library HTML escape, and Astro
    doesn't export a public one. Options: keep the 5-liner, or depend on the
    `escape-html` npm package. Proposal: keep ours.
  - **Default glyph too heavy**: proposal — default `'•'` (U+2022, smaller
    bullet) instead of `'●'`.
  - **Glyph set option**: proposal — `glyphs?: 'curved' | 'square'` prop
    (default `'curved'`), threaded as a third arg to `dagRows`. DEC glyphs
    are VT100 escape sequences (terminal charset switching, `\x1B(0…`) —
    meaningless in HTML, excluded. ASCII renderers also excluded per Anton.
  - **PrefixLine upstream**: handoff doc written to
    `/tmp/handoff-renderdag-prefixline-export.md` for an agent in the
    renderdag-ts repo (covers root exports of PrefixLine/PrefixLinePart/
    PrefixLineKind/isRepeatable/GraphRowShape, the minRowHeight/separatorLine
    coupling, and a note to check the Rust upstream).
  - **Vertical line alignment** (Anton's screenshots, 14:03): the box-glyph
    stroke is reliably centered at 0.5ch in monospace fonts, but its WIDTH is
    font-internal and unknown to CSS, so a fixed 1.5px CSS line can never
    exactly match thickness/edges across user fonts and DPRs. Exact alignment
    requires either (a) shipping a subset webfont for the prefix (pin metrics,
    tune constants once — few KB) or (b) replacing text art with a CSS/SVG
    stage-2 renderer (exact by construction, stroke scales with font size,
    unlocks horizontal orientation; larger change, spec revision). Short-term
    mitigation available: size the CSS line in em (~0.075em) instead of px.
    Resolved: option (b) chosen and implemented (the SVG renderer above),
    plus the SVG-origin alignment fix.
- [x] **Tile border + side-by-side pairs** (Anton, 2026-07-23 late):
  disconnected graphs are confusing without visible bounds, and before/after
  figure pairs in the compaction post should sit side by side on desktop.
  The figure is now a shrink-to-fit tile: `width: fit-content; max-width:
  100%`, `1px solid rgba(var(--gray), 50%)` border, 8px radius (matching the
  site's pre/img), `0.25em 0.75em` padding. New `.render-dags` wrapper class
  (also in the component's global style block): flex row with `gap: 0 2em`,
  children `min-width: 0`, stacking via a 720px media query. Deliberately no
  `flex-wrap` — flexbox wraps at max-content size *before* shrinking, so a
  tile with one long message line would stack prematurely; instead tiles
  shrink and their messages wrap. Usage: `<div class="render-dags">`
  around two `<div>`s each holding a caption + `<RenderDAG>`. (A raw
  `<style>` tag in MDX does not work: micromark parses `{...}` CSS bodies as
  JSX expressions and the build fails — component-level styling is the way.)

## Implementation-Time Decisions

- **`PrefixLine` import path**: the renderdag root export exposes `PadLine`
  but not `PrefixLine`; `render-dag.ts` re-exports it as
  `type PrefixLine = pipeline.types.PrefixLine`. (Could be fixed upstream by
  exporting it from the package root.)
  TDC: Please elaborate. This probably needs to be fixed in the rust upstream as well. It looks like PrefixLineRenderer is public, but since PrefixLine (in its return type) is not, it's not actually usable. We should make a /handoff doc about this to give to an agent working in the renderdag repo.
- **`minRowHeight = 1` is needed after all**: the spec's claim that it only
  affects text stage 3 was wrong — `GraphRowShaper` only emits
  `separatorLine` when `minRowHeight <= 1`. `dagRows` sets it on the shaper.
- **Synthetic row ids**: `\0anon:<nodeId>:<k>` — the `\0` prefix cannot
  collide with author-written ids.
- **Whitespace-tight template**: Astro collapses template newlines to single
  spaces, which render as characters under `white-space: pre` (and
  whitespace-only text nodes become anonymous flex items). The prefix markup
  in `RenderDAG.astro` is deliberately written without whitespace between
  elements.
- **Pre-filler instead of padding-top**: the node line is centered against
  the message's first line box by a small strip at the top of each prefix,
  painted with the *previous* row's `fillerColumns`, so edges stay continuous
  across row boundaries (plain padding would leave gaps).
- **Glyph grid safety**: `.dag-glyph` is `inline-block; width: 1ch;
  text-align: center` so glyphs wider than 1ch overflow symmetrically instead
  of shifting the column grid.
- **Style attribution in fused link cells** (SVG round): when one cell fuses
  several edges (e.g. `┼` with both fork and merge), the up arm takes the
  merge style, the down arm the fork style, horizontals the horizontal flag's
  style; `combine()` resolves shared arms with solid-wins. Corner cells
  always carry one edge, so both arms share its style.
- **Dash phase**: the default rhythm `--dag-dash: 0.25` gives exactly two
  dash periods per 1em line, so vertical dashes stay in phase across
  consecutive prefix lines. The prefill (0.35em) and stretchable postfill
  break phase at their seams — visually negligible, accepted (also true of
  the previous px-based gradients).
- **`~` vertical position**: the term span relies on the font's natural
  tilde placement (mid-line-ish), same as the previous text rendering.
