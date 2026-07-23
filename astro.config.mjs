// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkHeadingSmartquotes from './plugins/remark-heading-smartquotes.mjs';

// Pages in src/dev-pages/ are served in `astro dev` but excluded from builds.
/** @type {import('astro').AstroIntegration} */
const devPages = {
	name: 'dev-pages',
	hooks: {
		'astro:config:setup': ({ command, injectRoute }) => {
			if (command !== 'dev') return;
			injectRoute({ pattern: '/dag-test', entrypoint: './src/dev-pages/dag-test.astro' });
		},
	},
};

// https://astro.build/config
export default defineConfig({
	site: 'https://geraschenko.com',
	integrations: [mdx(), sitemap(), devPages],
	markdown: {
		remarkPlugins: [remarkMath, remarkHeadingSmartquotes],
		rehypePlugins: [rehypeKatex],
	},
});
