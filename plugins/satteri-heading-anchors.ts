// Gives every h2–h6 in a post a `¶` link to itself
// (`<a class="heading-anchor" href="#id">`, styled in global.css). It handles
// Markdown headings (hast elements) and raw `<h2 id="…">` in MDX (JSX
// elements, which keep their hand-picked ids).
//
// Astro's own `heading-ids` plugin runs after user plugins, so Markdown
// headings have no id yet when this one sees them. This plugin assigns that id
// itself, the way `heading-ids` would (github-slugger over the heading text,
// one slugger per document, h1–h6 without an id); `heading-ids` keeps an
// existing id. The link has no text (CSS draws the glyph), so it doesn't
// change the heading's text, which Astro slugs and lists in `getHeadings()`.
import GithubSlugger from 'github-slugger';
import type { Element } from 'hast';
import { defineHastPlugin, type MdxJsxFlowElementHast } from 'satteri';

const sluggedTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const anchoredTags = ['h2', 'h3', 'h4', 'h5', 'h6'];

function anchorTo(id: string): Element {
  return {
    type: 'element',
    tagName: 'a',
    properties: {
      className: ['heading-anchor'],
      href: `#${id}`,
      ariaLabel: 'Link to this section',
    },
    children: [],
  };
}

function jsxId(heading: Readonly<MdxJsxFlowElementHast>): string | undefined {
  const id = heading.attributes.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'id');
  return typeof id?.value === 'string' ? id.value : undefined;
}

export function satteriHeadingAnchors() {
  const slugger = new GithubSlugger();
  return defineHastPlugin({
    name: 'heading-anchors',
    element: {
      filter: sluggedTags,
      visit(heading, ctx) {
        let id = heading.properties.id;
        if (typeof id !== 'string') {
          id = slugger.slug(ctx.textContent(heading));
          ctx.setProperty(heading, 'id', id);
        }
        if (anchoredTags.includes(heading.tagName)) ctx.appendChild(heading, anchorTo(id));
      },
    },
    mdxJsxFlowElement: {
      filter: anchoredTags,
      visit(heading, ctx) {
        const id = jsxId(heading);
        if (id !== undefined) ctx.appendChild(heading, anchorTo(id));
      },
    },
  });
}
