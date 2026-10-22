# Blog post: Claude Code settings recommendations

Post: `src/content/blog/claude-settings/index.mdx`. Tested against Claude Code
2.1.280.

## Post structure

1. Short intro and the version tested.
2. The complete recommended `settings.json` (valid JSON, ready to copy).
3. One section per logical group. Each section repeats its part of the
   settings and explains what it does and how it works:
   - `CLAUDE_CODE_THRIFTY_SONIC`: terminal captures of the Bash 2KB
     truncation failure (item E).
   - `TOTAL_TOKENS_REMINDER` vs `ENABLE_TOKEN_USAGE_ATTACHMENT`: the
     attachment text verbatim, plus a generic CLAUDE.md snippet (item F).
   - Trimming tools (`permissions.deny`, `disable*`): depends on what you use.
     `/context all` capture, cost chart, gist table, Matt Pocock post (item G).
   - `cleanupPeriodDays`.
4. Further reading: clauctl env-var FINDINGS.md.

Hero: bar chart of per-tool token cost, with very little text (item B).

## Items

Dependencies are shown as `needs:`. Items without one can start any time.

### A. Post skeleton and settings block

- Rewrite `index.mdx` into the structure above, with stub sections. Sort the
  existing text into those sections.
- Fix the settings JSON. It has trailing commas after the `deny` array and
  after `disableArtifact`. The `env` values are booleans, but `env` expects
  strings (`"false"`); verify this before publishing (see H).

### B. Tool-cost bar charts

- Source of the table: `~/git/geraschenko/clauctl/scripts/claude-tools/tool-costs.py`
  (it reads `tool-schemas.json` beside it, which is a 2.1.280 capture, and
  counts tokens with tiktoken o200k_base, so the numbers are approximate). Extend
  this script in clauctl instead of copying the table here.
- Two outputs:
  1. Hero: very little text. Highlight the tools the post recommends denying
     and grey out the deferred ones.
  2. In-post: every tool labelled. Decide between SVG and HTML/CSS. HTML/CSS
     reflows and its text can be selected; SVG is a single file like the
     other posts' figures.
- Open: where the generated files live. They are probably committed to the
  blog directory, with a script in this repo that calls into clauctl.
- The gist (https://gist.github.com/geraschenko/3ca459c7d4c67f32dd26189a541a8d24)
  links to the Matt Pocock post; it is needed for G.

### B2. Expandable tool chart with exact token counts

- Copy clauctl's `scripts/claude-tools/tool-schemas.json` (2.1.280 capture,
  has `claudeVersion`) into the post dir; it becomes the chart's only input.
  Anton will delete clauctl's `tool-costs.py` (revert the `--json` change).
- `generate-tool-costs.ts` (post dir) replaces tool-costs.py: uses
  `@anthropic-ai/sdk` `messages.countTokens` with `ANTHROPIC_API_KEY`
  (free, rate-limited; returns only `input_tokens`, no tokenization, so one
  request per measurement). Each tool is measured alone against a minimal
  reference tool R: cost(t) = count([R, t]) − count([R]). R is needed because
  the API adds fixed tool-use instructions to any request with tools, so
  count([t]) − count([]) would include them. The one-word user message cancels
  in the difference. Eager and deferred tools are measured the same way; strip
  `defer_loading`. Model `claude-opus-5-5` (the tokenizer differs by model).
  Output `tool-costs.json` (`ToolCosts`: `claudeVersion`, `tokenizerModel`,
  `tools: {name, isDeferred, tokens}[]`) is committed; the build stays
  offline. The hero needs only this file; the chart looks up each row's
  schema in `tool-schemas.json` by name and checks that the versions match.
- Rows expand (click) to show the tool's description rendered as Markdown and
  the input schema rendered for humans, not as raw JSON (e.g. a parameter
  list: name, type, required, description, nested). The goal is understanding
  what the tool is. Bounds are shown (ranges, lengths, item counts, including
  on array items as "each …"); zod's ±`Number.MAX_SAFE_INTEGER` integer range
  is hidden; `pattern` and `format` are not shown.
- Fix the name column: one grid for all rows (subgrid rows),
  `minmax(min-content, max-content)` names, `<wbr>` at camelCase boundaries.
  Currently a fixed 11em, so DeferredToolPlaceholder wraps.
- No per-tool "why I deny it" notes for now.
- The Artifact tool's name (`"Artifact"` in `removedToolNames`) is not
  verified; it is absent from the capture.

### C. Handoff: extract `ansi-crop` into a standalone package

- Write the handoff doc in `/tmp` for another agent.
- Source: `~/git/muninn/ansi/src/bin/ansi-crop.rs` (343 lines, a
  self-contained binary). It depends on muninn workspace crates
  (`base`, `prelude`, workspace lints) and on `anyhow`, `clap`, `tokio`,
  `unicode-width`. It probably needs only some of these.
- Usage from history: `cargo run --release --bin ansi_crop -- <file>`, run from
  the muninn repo. Auto-crops blank margins; `--row-min/--row-max/--col-*`
  override the detected bounds.
- Scope decision: web_dx renders captures with
  `ansi::normalize_sgr` (`~/git/muninn/ansi/src/normalize_sgr/`, 245 lines
  plus tests in `ansi/tests/normalize_sgr/`) and then the Rust `ansi-to-html`
  crate (`ccc/web_dx/build.rs`). `normalize_sgr` works around span leaks
  and reverse video in that crate. Resolved by D: the package ships only
  crop. Its input here is SGR-only (hyperlinks stripped beforehand), but as
  a public tool it should either skip OSC sequences when counting width
  or document SGR-only input.

### D. Rendering terminal captures

Done. A capture is rendered with `<TerminalCapture capture={capture} />`
(`src/components/`), with `capture` imported from a `.ansi` file via `?raw`.
It is Astro's `<Code lang="ansi">` plus a Shiki transformer
(`terminal-cells.ts`) that puts each non-ASCII grapheme in a `1ch` (or `2ch`
for wide ones) inline-block. That is needed because glyphs missing from the
monospace font (Noto Sans Mono on Anton's desktop lacks ⛀ ⛁ ⛶ ⛝) come from
proportional fallback fonts, and the fallbacks differ by device.

- Pipeline: `tmux capture-pane -e` →
  `node scripts/strip-hyperlinks-from-ansi.ts` → ansi-crop → `.ansi` file in
  the post dir.
- Shiki (Astro's highlighter) tokenizes ANSI itself: SGR 16/256/truecolour,
  bold, dim, reverse, with one token per span, so the span leaks that
  muninn's `normalize_sgr` works around can't happen. Claude Code emits
  only `38;5;N`/`48;5;N`, which map to the stock xterm palette whatever
  the theme; the theme sets only the box background and default foreground.
- Theme: the default (`github-dark`), matching the site's fenced code blocks.
  web_dx's catppuccin was that site's page palette, not Claude Code's or the
  terminal's.
- tmux 3.4 keeps OSC 8 hyperlinks in `-e` output; Shiki prints them as raw
  text (including local `file://` paths), hence the strip step. Stripping
  before cropping keeps the committed files free of local paths.
- Styling: global `pre { line-height: 1.1 }` (Anton's pick on a scratch page,
  since removed; it applies to all code blocks). If captures need their own
  rules, `pre[data-language="ansi"]` selects them (Astro sets `data-language`).
- Font: the system monospace. JetBrains Mono (web_dx's
  `scripts/compress_terminal_fonts.nu`) was not needed.

### E. Captures of the THRIFTY_SONIC failure

- needs: ansi-crop runnable (works from muninn today; C not required),
  D to render.
- Session `2150ff81-e0a3-406e-87f1-7bca7eae1201`, cwd
  `~/.treehouse/clauctl-90dce5/1/clauctl` (still exists), Claude Code 2.1.258.
  Transcript: `~/.claude/projects/-home-anton--treehouse-clauctl-90dce5-1-clauctl/2150ff81-e0a3-406e-87f1-7bca7eae1201.jsonl`,
  25468 lines; the screenshot events are near jsonl lines 2901, 2943, 2966
  (`sed -n '150,1183p'`, `sed -n 420,700p` on `docs/specs/session-tracker.md`),
  around 2026-09-11.
- The PNGs being replaced: `output-too-large-repeated-failure.png`,
  `sed-n-consecutive-blocks.png` (in the post directory; delete them once replaced).
- Method: resume the session in tmux, scroll to the events, `tmux capture-pane -e`,
  then crop with ansi-crop.
- Open: whether resuming under 2.1.280 renders those tool calls the same way.

### F. Token reminder section

- `TOTAL_TOKENS_REMINDER` attachment, verbatim (from
  pre-Sept-11 sessions, e.g. session `2150ff81`, where it appears 2842 times):
  `{"type":"total_tokens_reminder","text":"<total_tokens>15000000 tokens left</total_tokens>"}`
- `ENABLE_TOKEN_USAGE_ATTACHMENT` attachment in the jsonl:
  `{"type":"token_usage","used":0,"total":180000,"remaining":180000}`. The
  model sees it as `Token usage: 0/180000; 180000 remaining`.
- Generic CLAUDE.md snippet, adapted from the CONTEXT WINDOW section of
  `~/.claude/CLAUDE.md`; it's in the post.
- These attachments are not visible in the terminal, so show them as code blocks
  rather than terminal captures.

### G. Tools section

- needs: B (in-post chart), D and a `/context all` capture.
- Decide whether to inline the top of the gist table or only link it.
- Possible framing: a `/context all` capture with default settings and another
  with the recommended ones.

### H. Optional: check the claims against the 2.1.280 minified JS

- What THRIFTY_SONIC does, what the reminder measures, the attachment format,
  and the expected type of the `env` values.

### I. Write the prose

- needs: A, plus each section's material. Anton supplies the voice.

Suggested order: A → B → C → D → E → F → G → I, with H whenever convenient.

## WORK LOG

- 2026-10-22: Spec written; material located (paths above).
- 2026-10-22: A done. `index.mdx` restructured with `TODO(x)` stubs. The full
  settings block is `settings.json` in the post dir (shown via `?raw` +
  `<Code>`), and it is the single source for the chart's highlights. `env`
  values are strings: 2.1.280's schema is `z.record(string, z.coerce.string())`,
  so booleans also work, but strings match the documented type.
- 2026-10-22: B done. clauctl `tool-costs.py --json` (table output unchanged;
  uncommitted in clauctl). Anton writes its output to the post dir's
  `tool-costs.json`; `node src/content/blog/claude-settings/generate-hero-image.ts
  <tool-costs.json>` writes `tool-costs-hero.svg` beside it (both committed).
  `ToolCostChart.astro` renders the labelled HTML/CSS chart; shared types and
  `removedToolNames`/`chartOrder` are in `tool-costs.ts`. Colour = removed by
  settings (accent) vs kept (gray); faint = deferred.
  Findings for prose/H: the only eager tools removed are Workflow (1196),
  ScheduleWakeup (1016) and ReportFindings (469); the other deny entries are
  deferred. The capture lacks Artifact tools (so `disableArtifact` has nothing
  to show) and Grep/Glob (THRIFTY_SONIC or a gate? check in H).
- 2026-10-22: Hero generator moved to `src/content/blog/claude-settings/generate-hero-image.ts <tool-costs.json>` (TDC).
- 2026-10-22: Settings flags researched (2.1.280 schema + code.claude.com
  settings-reference). Post now recommends `enableWorkflows: false` and
  `enableArtifact: false` (the docs give these for personal use; `disableArtifact`
  is deprecated) and no longer recommends `disableRemoteControl` (Remote Control is
  off unless started; outbound-only). Added a flag table to the tools section
  of `index.mdx`, which links the settings reference. B2 specified above.
- 2026-10-22: B2 implemented, pending Anton running `generate-tool-costs.ts`
  (needs the API key) then `generate-hero-image.ts`; until then `astro check`
  reports the missing `tool-costs.json` and nothing else. Files:
  `tool-schemas.json` (copy of clauctl's capture), `generate-tool-costs.ts`,
  `tool-costs.ts` (types; `toolSchemas`, the typed import, cast because
  TypeScript infers JSON arrays as unions with `?: undefined` keys),
  `schema-params.ts` + test, `tool-markdown.ts` (unified pipeline: tag-like
  text stays literal, as text inline and as code when it stands alone; headings
  shifted 3 so `#` becomes h4 under the chart's h3 group headings),
  `SchemaParams.astro`. Astro's `createMarkdownProcessor` was rejected
  (deprecated plugin options in 7.3; adds heading ids). Row alignment uses
  `<details>` as a subgrid; Anton checks it visually.
- 2026-10-22: D done (see D): `<Code lang="ansi">` directly, default theme,
  `scripts/strip-hyperlinks-from-ansi.ts` (+ test), global `pre` line-height
  1.1. C is crop-only.
- 2026-10-23: E captures added, pending Anton's look:
  `thrifty-sonic-output-too-large.ansi` (top of the failed `sed`, through
  "Preview (first 2KB):") and `thrifty-sonic-chunked-reads.ansi` (the whole
  loop), cropped from `/tmp/claude-large-output-fail{-2,}.ansi`. Captured in
  clauctl, because stock Claude Code collapses the run into "Read 1 file, ran
  5 shell commands" and expanding it shows the full outputs; the post says that in
  a sentence rather than showing a capture. Not used: consecutive-blocks
  (redundant), fail-3 (same as -2). The PNGs stay until Anton approves. The
  scripts need node ≥ 22.18 for `.ts` (nvm's v26; `/usr/bin/node` is v18).
  The captures show what happened, not why; H would show that
  THRIFTY_SONIC causes it.
- 2026-10-23: The two captures are now one edited capture, `thrifty-sonic-loop.ansi`,
  written by `generate-thrifty-sonic-capture.ts <collapsed> <sedExpanded>
  <catExpanded>` (inputs: `/tmp/claude-large-output-fail{,-2,-3}.ansi`; not
  committed). Its file comment lists the edits. The post must say the capture is
  clauctl (which wraps the Claude Agent SDK) and was trimmed.
  Evidence for the "why", same session: side conversation at jsonl 3104
  (`05e9bc9c…`, Anton asks) → 3108 (`8f3014b5-e1f2-4e2d-bdba-8eac82997698`,
  model cites the auto-mode reminder; rewind leaf for a capture) → 3166
  (`a6798edd…`, decompiled 2.1.258: reminder gated on THRIFTY_SONIC) → reply
  to 3169 (full reminder text, DEV post + hidden-settings links; Fable forces
  thrifty_sonic). After the flag was set false: 4422 (`3ba731a4…`) asks again, and
  `2dfe5d4b…` says there's no such instruction. Reminder text (2.1.258,
  lean-prompt models in auto mode):
  > While auto mode is active:
  >
  > Do your work through the Bash tool wherever it can accomplish the job: read files with cat, head, or sed -n, search with grep and find, and make file changes with sed, heredocs, or short scripts, rather than using the dedicated Read, Edit, or Write tools. Fall back to a dedicated tool only when Bash genuinely cannot do the job.
- 2026-10-23: E done apart from the prose. Anton hand-trimmed the capture
  (preview line dropped, "+41 lines"), and the generator was deleted (its
  inputs were one-off `/tmp` captures). The THRIFTY_SONIC section now has a
  draft "why" paragraph with the reminder text.
  H, THRIFTY_SONIC part, checked against the 2.1.280 binary (clauctl's
  `node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude`; the
  standalone install is 2.1.309). The `auto_mode` attachment is built only when
  the mode is `auto` or `bypassPermissions`. `bashFirst` = the tools include
  Bash and (Edit or Write), and `iAt()` is true; `iAt()` returns
  `CLAUDE_CODE_THRIFTY_SONIC` if it is set, otherwise the session assignment
  (forced / none / GrowthBook cohort `tengu_thrifty_sonic`). `steerOnly` =
  bypass or a lean-prompt model. `steerOnly && !bashFirst` means no
  attachment; `steerOnly` means "While auto mode is active:\n\n" + the Bash
  paragraph; otherwise the full auto-mode guidance, with the paragraph
  appended when `bashFirst`. So false removes the paragraph, and removes the
  whole reminder for lean-prompt models. New since 2.1.258: a "relaxed" Bash
  paragraph ("You can do much of your work through the Bash tool when it is
  the simpler route… The choice is yours…"), chosen by
  `CLAUDE_CODE_COZY_TEAPOT` / `tengu_cozy_teapot` / a model property; the
  default is "strict" (the text quoted in the post). Template constants
  resolve to Bash/Read/Edit/Write. Fable forcing the flag was not re-checked
  for 2.1.280.
- 2026-10-23: H, "Output too large" part (2.1.280). The tool-result
  persistence function (`V`) saves a result when its size exceeds the tool's
  threshold, `NRe(tool, maxResultSizeChars, persistenceThresholdCeiling)`:
  min(max, ceiling), unless GrowthBook `tengu_velvet_ibis` sets a per-tool
  override. Bash: `maxResultSizeChars` = settings `bashOutputMaxChars` ??
  30000, ceiling 128000. The schema describes `bashOutputMaxChars` as
  "default 30000; values clamp to 4000-128000… Output past this is saved
  to a file and Claude receives a short preview plus the path. When set, this
  also replaces BASH_MAX_OUTPUT_LENGTH, which on its own only sizes the
  read-back window." Other tools default to a 50000 ceiling (`EF`). Preview: the
  first 2000 chars (`Eye`), cut back to the last newline if it falls past
  halfway, then "..." if more follows. So the session's 54.9KB `sed` output went
  over 30000; `cat` on the saved file produced the same 54.9KB and was saved
  again.
- 2026-10-23: E done. The THRIFTY_SONIC section has rough prose (Anton refines it in
  I). Framing decision: the post says Claude helped find and fix the problem.
  It leaves out details that only come from the binary (exact thresholds,
  cohorts, flag internals); the reminder text is fine because the model sees
  it. Binary details may stay in this spec.
- 2026-10-23: F done apart from the prose. H, token part (2.1.280; search the
  binary with `grep -aboF` for byte offsets, then `dd` around them, because
  `grep -aoE '.{N}x.{N}'` on the ~200MB binary pins a core). Both
  attachments go to the model unchanged inside a meta message (`Fa(...)`).
  `total_tokens_reminder`: mode from env, then the `totalTokensReminder`
  setting, then GrowthBook `tengu_lapis_anchor`, defaulting to
  `padded-countdown` (others: off, infinite, fixed = 5000000, countdown = the
  real window minus current context). Padded: budget 15000000
  (`tengu_lapis_anchor_budget`) minus the maximum so far of (context removed by
  compaction + current context − the value at the anchor). It re-anchors on
  each user prompt (`totalTokensReminderAfterUserTurn`, default true). So it
  measures context growth since the last prompt, not billed tokens.
  `token_usage`: `used` = context size from the last response's usage,
  `total` = `nV` = the effective window (window − min(output max, 20000)),
  which is the same window auto-compaction uses; compaction fires somewhat
  before `remaining` reaches 0. The example numbers in the post are
  illustrative; the format is verbatim.
- 2026-10-23: G done apart from the prose. `context-all.ansi` is cut from
  `/tmp/claude-context-all.ansi` (fresh session, recommended settings, Claude
  Code 2.1.309) with `sed 's|/-home-anton-git-geraschenko-clauctl/|/…/|'` piped to
  `ansi-crop --row-min 7 --row-max 42`: the `/context all` line through the
  skills list, without the banner, the tmux notice or the prompt. There was no
  OSC 8 in it, so it didn't need stripping. The in-post chart replaces the
  gist table, so the post no longer links the gist. Matt Pocock's post is
  linked directly. The version mismatch (2.1.309) is fine.
- 2026-10-23: The `/context all` grid was misaligned on desktop because of
  fallback glyph widths; `TerminalCapture` (see D) fixes it. Added direct
  dependencies: `string-width`, and as dev dependencies (types only) `shiki`
  and `@types/hast`; all were already installed transitively.
- 2026-10-23: I in progress (Anton writes; review given). Post renamed to
  `claude-settings` (dir, spec, references). No full settings block up top:
  readers adopt settings piecemeal (the token attachment also needs CLAUDE.md).
  `tool-settings.json` (tool/feature settings only) replaces `settings.json`;
  the tools section renders it with `<Code>` and the chart and hero read it, so
  the shown block and the highlighted bars can't drift. Bar colours are
  `barColours` in `tool-costs.ts`: removed = muted red `#c4453a` (emphasized,
  since removing is the point, without reading as "good"), kept = `--gray`.
  THRIFTY_SONIC's default comes from GrowthBook; its rollout is unknown, so the
  post doesn't call it an experiment.
