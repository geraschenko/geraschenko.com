// This can be removed if https://github.com/silvenon/remark-smartypants/pull/103 is merged upstream.

import { visit } from 'unist-util-visit';

// remark-smartypants decides quote direction by concatenating the whole
// document's text, injecting a fake space before paragraphs but NOT before
// headings (https://github.com/silvenon/remark-smartypants — see plugin.js).
// A heading that starts with a quote therefore gets glued to the previous
// block's text and educated as a CLOSING quote (the `he said."` pattern).
// A quote at the very start of a heading is unambiguously an opener, so
// this plugin (which must run after smartypants) flips it back.
const CLOSE_TO_OPEN = { '”': '“', '’': '‘' };

export default function remarkHeadingSmartquotes() {
	return (tree) => {
		visit(tree, 'heading', (heading) => {
			const first = heading.children[0];
			if (!first || first.type !== 'text') return;
			const open = CLOSE_TO_OPEN[first.value[0]];
			if (open && first.value[1] && !/\s/.test(first.value[1])) {
				first.value = open + first.value.slice(1);
			}
		});
	};
}
