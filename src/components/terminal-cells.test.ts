import { describe, expect, it } from 'vitest';
import { terminalCells } from './terminal-cells';

const cell = (value: string, isWide = false) => ({
  type: 'element',
  tagName: 'span',
  properties: { className: isWide ? ['terminal-cell', 'wide'] : ['terminal-cell'] },
  children: [{ type: 'text', value }],
});
const text = (value: string) => ({ type: 'text', value });

describe('terminalCells', () => {
  it('leaves ASCII as one text run', () => {
    expect(terminalCells('System tools: 7.1k')).toEqual([text('System tools: 7.1k')]);
  });

  it('gives each non-ASCII character its own cell between ASCII runs', () => {
    expect(terminalCells('⛁ ⛶⛝ x')).toEqual([
      cell('⛁'),
      text(' '),
      cell('⛶'),
      cell('⛝'),
      text(' x'),
    ]);
  });

  it('marks wide characters', () => {
    expect(terminalCells('a漢')).toEqual([text('a'), cell('漢', true)]);
  });

  it('keeps a grapheme cluster in one cell', () => {
    expect(terminalCells('é')).toEqual([cell('é')]);
  });

  it('returns nothing for empty text', () => {
    expect(terminalCells('')).toEqual([]);
  });
});
