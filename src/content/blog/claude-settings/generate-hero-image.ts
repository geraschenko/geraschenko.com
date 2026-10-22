/**
 * Writes tool-costs-hero.svg, a label-free bar chart of per-tool context cost,
 * beside this script, from tool-costs.json;
 * ToolCostChart.astro is the labelled version of the same chart.
 *
 * Usage: node src/content/blog/claude-settings/generate-hero-image.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  barColours,
  chartOrder,
  removedToolNames,
  type ToolCost,
  type ToolCosts,
} from './tool-costs.ts';

const postDir = dirname(fileURLToPath(import.meta.url));

// Deferred tools are drawn faint.
function heroSvg(costs: ToolCost[], removed: Set<string>): string {
  const [width, height] = [1200, 600];
  const [marginX, marginY] = [60, 60];
  const groupGap = 1; // in bar slots, between eager and deferred tools
  const ordered = chartOrder(costs);
  const slotCount = ordered.length + groupGap;
  const slot = (width - 2 * marginX) / slotCount;
  const barWidth = slot * 0.72;
  const maxTokens = Math.max(...costs.map((cost) => cost.tokens));
  const baseline = height - marginY;
  const firstDeferred = ordered.findIndex((cost) => cost.isDeferred);

  const bars = ordered.map((cost, i) => {
    const slotIndex = i + (i >= firstDeferred ? groupGap : 0);
    const x = marginX + slotIndex * slot + (slot - barWidth) / 2;
    const barHeight = (cost.tokens / maxTokens) * (height - 2 * marginY);
    const fill = removed.has(cost.name) ? barColours.removed : barColours.kept;
    const opacity = cost.isDeferred ? 0.25 : 1;
    return (
      `  <rect x="${x.toFixed(1)}" y="${(baseline - barHeight).toFixed(1)}" ` +
      `width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3" ` +
      `fill="${fill}" fill-opacity="${opacity}"><title>${cost.name}</title></rect>`
    );
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...bars,
    `  <line x1="${marginX}" y1="${baseline}" x2="${width - marginX}" y2="${baseline}" stroke="rgb(34,41,57)" stroke-width="2"/>`,
    '</svg>',
    '',
  ].join('\n');
}

const readPostJson = (name: string) => JSON.parse(readFileSync(join(postDir, name), 'utf8'));
const toolCosts: ToolCosts = readPostJson('tool-costs.json');
writeFileSync(
  join(postDir, 'tool-costs-hero.svg'),
  heroSvg(toolCosts.tools, removedToolNames(readPostJson('tool-settings.json'))),
);
