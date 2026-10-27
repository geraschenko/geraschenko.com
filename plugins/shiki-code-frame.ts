// Frames a code block according to its meta: `title="…"` (the convention
// Starlight, Expressive Code and rehype-pretty-code share) gives it a title
// bar, and a bare `copy` gives it a copy button.
//
//   ```json title="settings.json" copy
//   <Code code={…} lang="json" meta='title="settings.json" copy' transformers={[shikiCodeFrame()]} />
//
// A framed block is `<figure class="code-block">` holding an optional
// `<figcaption>`, the `<pre>`, and an optional `<button class="code-copy">`
// carrying Lucide's clipboard and check icons
// (styled in global.css; src/scripts/code-copy.ts handles its clicks). The
// frame sits outside the `<pre>` because the `<pre>` scrolls horizontally and
// its title bar and button shouldn't.
import type { Element, ElementContent, Root } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { Check, Clipboard } from 'lucide-static';
import type { ShikiTransformer } from 'shiki';

type CodeFrame = { title: string | undefined; hasCopyButton: boolean };

function codeFrameFromMeta(meta: string): CodeFrame {
  return {
    title: /(?:^|\s)title="([^"]*)"/.exec(meta)?.[1],
    hasCopyButton: /(?:^|\s)copy(?:\s|$)/.test(meta),
  };
}

function element(
  tagName: string,
  properties: Element['properties'],
  children: ElementContent[],
): Element {
  return { type: 'element', tagName, properties, children };
}

// Parses a `lucide-static` icon (an `<svg>` string) and adds `className`.
function lucideIcon(svg: string, className: string): Element {
  const icon = fromHtml(svg, { fragment: true }).children.find(
    (child): child is Element => child.type === 'element',
  );
  if (icon === undefined) throw new Error(`not an SVG element: ${svg}`);
  const lucideClasses = Array.isArray(icon.properties.className) ? icon.properties.className : [];
  return {
    ...icon,
    properties: {
      ...icon.properties,
      className: [...lucideClasses, className],
      ariaHidden: 'true',
    },
  };
}

export function shikiCodeFrame(): ShikiTransformer {
  return {
    name: 'code-frame',
    root(root): Root | void {
      const { title, hasCopyButton } = codeFrameFromMeta(this.options.meta?.__raw ?? '');
      if (title === undefined && !hasCopyButton) return;
      const pre = root.children.filter(
        (child): child is ElementContent => child.type !== 'doctype',
      );
      const figcaption =
        title === undefined ? [] : [element('figcaption', {}, [{ type: 'text', value: title }])];
      const copyButton = hasCopyButton
        ? [
            element(
              'button',
              { type: 'button', className: ['code-copy'], ariaLabel: 'Copy code' },
              [lucideIcon(Clipboard, 'code-copy-idle'), lucideIcon(Check, 'code-copy-done')],
            ),
          ]
        : [];
      return {
        type: 'root',
        children: [
          element('figure', { className: ['code-block'] }, [...figcaption, ...pre, ...copyButton]),
        ],
      };
    },
  };
}
