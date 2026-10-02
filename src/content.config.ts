import { readFile } from 'node:fs/promises';
import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { parseBib } from './publications';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) => z.object({
		title: z.string(),
		description: z.string().optional(),
		// Transform string to Date object
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: image().optional(),
		// Slug of the series this post belongs to, if any.
		series: z.string().optional(),
		// Marks the post as its series' overview/home page.
		seriesOverview: z.boolean().optional(),
	}),
});

const projects = defineCollection({
	// Load Markdown and MDX files in the `src/content/projects/` directory.
	loader: glob({ base: './src/content/projects', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string(),
		url: z.url(),
		// Transform string to Date object
		date: z.coerce.date(),
	}),
});

const author = z.object({ name: z.string(), cofirst: z.boolean() });

// Geraschenko.bib is the authoritative publication list, shared with the
// LaTeX resume. File order is the intended display order; collections sort by
// id, so it is carried explicitly.
const publications = defineCollection({
	loader: async () =>
		parseBib(await readFile('./src/content/Geraschenko.bib', 'utf8')).map((p, order) => ({
			id: p.key,
			order,
			...p,
		})),
	schema: z.object({
		order: z.number(),
		key: z.string(),
		title: z.string(),
		authors: z.array(author),
		venue: z.string(),
		volume: z.string().optional(),
		number: z.string().optional(),
		pages: z.string().optional(),
		year: z.string(),
		doi: z.string().optional(),
		arxiv: z.string().optional(),
		note: z.string().optional(),
	}),
});

export const collections = { blog, projects, publications };