import { describe, expect, it } from 'vitest';
import { parseBib } from './publications';

const bib = `
@article{a,
  title = {A \`\`quoted'' {Deligne--Mumford} title},
  author = {Smith, Jamie and Kast, Anton and {Some Consortium} and van Last, First},
  cofirst = {2},
  journal = {Nature},
  volume = {1},
  pages = {10--20},
  year = {2024},
  doi = {10.1000/x},
  arxiv = {1234.5678}
}
@phdthesis{t,
  title = {Thesis},
  author = {Geraschenko, Anton},
  school = {UC Berkeley},
  year = {2011}
}
`;

describe('parseBib', () => {
	it('normalizes entries in file order', () => {
		const [a, t] = parseBib(bib);
		expect(a.title).toBe('A “quoted” Deligne–Mumford title');
		expect(a.authors).toEqual([
			{ name: 'Jamie Smith', cofirst: true },
			{ name: 'Anton Kast', cofirst: true },
			{ name: 'Some Consortium', cofirst: false },
			{ name: 'First van Last', cofirst: false },
		]);
		expect(a.pages).toBe('10–20');
		expect(a.arxiv).toBe('1234.5678');
		expect(t.venue).toBe('PhD thesis, UC Berkeley');
		expect(t.authors[0].cofirst).toBe(false);
	});
});
