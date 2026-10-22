// Removes OSC 8 hyperlink markers from ANSI text, keeping the link text.
// `tmux capture-pane -e` (tmux >= 3.4) keeps them, and Shiki renders them as
// raw text, which would put local file:// paths on the page.
// Usage: node scripts/strip-hyperlinks-from-ansi.ts < capture > capture.ansi
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A link is wrapped in two markers. Each is `ESC ] 8 ; params ; URI` followed
// by a terminator, either `ESC \` or BEL; the closing marker has empty
// params and URI:
//   ESC]8;id=x;file:///a.ts ESC\ a.ts ESC]8;; ESC\
// Neither params nor URI can contain ESC or BEL.
const hyperlinkMarker = /\x1b\]8;[^\x1b\x07]*;[^\x1b\x07]*(?:\x1b\\|\x07)/g;

export function stripHyperlinksFromAnsi(ansi: string): string {
  return ansi.replace(hyperlinkMarker, '');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(stripHyperlinksFromAnsi(readFileSync(0, 'utf8')));
}
