import { parse, type Creator, type Entry } from '@retorquere/bibtex-parser';

export interface Author {
  name: string;
  cofirst: boolean;
}

export interface Publication {
  key: string;
  title: string;
  authors: Author[];
  /** Journal, proceedings, or degree-granting institution. */
  venue: string;
  volume?: string;
  number?: string;
  pages?: string;
  year: string;
  doi?: string;
  arxiv?: string;
  note?: string;
}

/** Parses Geraschenko.bib, preserving file order. `cofirst = {N}` marks the first N authors. */
export function parseBib(bibtex: string): Publication[] {
  const library = parse(bibtex);
  if (library.errors.length > 0) {
    throw new Error(`bibtex parse errors: ${JSON.stringify(library.errors)}`);
  }
  return library.entries.map(toPublication);
}

/** Personal names are split into parts by the parser; corporate names arrive whole. */
function creatorName(c: Creator): string {
  const name = c.name ?? [c.firstName, c.prefix, c.lastName, c.suffix].filter(Boolean).join(' ');
  if (!name) throw new Error(`author without a name: ${JSON.stringify(c)}`);
  return name;
}

function toPublication(entry: Entry): Publication {
  const f = entry.fields;
  const cofirst = Number(f.cofirst ?? 0);
  const authors = (f.author ?? []).map((c, i) => ({
    name: creatorName(c),
    cofirst: i < cofirst,
  }));
  const venue = f.journal ?? f.booktitle ?? (f.school && `PhD thesis, ${f.school}`);
  if (!f.title || !f.year || !venue) {
    throw new Error(`entry ${entry.key} lacks title, year, or venue`);
  }
  return {
    key: entry.key,
    title: f.title,
    authors,
    venue,
    volume: f.volume,
    number: f.number,
    pages: f.pages,
    year: f.year,
    doi: f.doi,
    arxiv: f.arxiv,
    note: f.note,
  };
}
