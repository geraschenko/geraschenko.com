import { expect, test } from 'vitest';
import { stripHyperlinksFromAnsi } from './strip-hyperlinks-from-ansi.ts';

const ESC = '\x1b';
const BEL = '\x07';

test('removes both markers of a tmux-captured link and keeps its text and colours', () => {
  const captured =
    `${ESC}[1mUpdate${ESC}[0m(` +
    `${ESC}]8;id=l8d6pz;file:///home/anton/src/event-hub.ts${ESC}\\` +
    `src/event-hub.ts` +
    `${ESC}]8;;${ESC}\\)`;
  expect(stripHyperlinksFromAnsi(captured)).toBe(`${ESC}[1mUpdate${ESC}[0m(src/event-hub.ts)`);
});

test('accepts BEL as the terminator', () => {
  const captured = `${ESC}]8;;https://example.com${BEL}link${ESC}]8;;${BEL}`;
  expect(stripHyperlinksFromAnsi(captured)).toBe('link');
});

test('leaves text without links unchanged', () => {
  const captured = `${ESC}[38;5;231mplain${ESC}[39m\nsecond line`;
  expect(stripHyperlinksFromAnsi(captured)).toBe(captured);
});
