// Copies a code block's text when its copy button (plugins/shiki-code-frame.ts)
// is clicked, then shows a check mark for a moment.
const checkMarkDisplayMs = 1500;

document.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('button.code-copy');
  const pre = button?.closest('figure.code-block')?.querySelector('pre');
  if (!button || !pre) return;
  await navigator.clipboard.writeText(pre.textContent ?? '');
  button.setAttribute('data-copied', '');
  setTimeout(() => button.removeAttribute('data-copied'), checkMarkDisplayMs);
});
