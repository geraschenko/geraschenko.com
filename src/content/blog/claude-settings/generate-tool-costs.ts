/**
 * Writes tool-costs.json beside this script: what each tool in
 * tool-schemas.json adds to a request, counted by the Messages API's
 * countTokens endpoint (free, rate-limited; needs ANTHROPIC_API_KEY).
 *
 * Usage: node src/content/blog/claude-settings/generate-tool-costs.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolCost, ToolCosts, ToolSchema, ToolSchemas } from './tool-costs.ts';

// Claude Code's default model at 2.1.280. The tokenizer differs between
// models, so the output records which one counted.
const tokenizerModel = 'claude-opus-5-5';

// The API adds fixed tool-use instructions to any request that has tools, so
// a tool's cost is measured against a request holding only this one.
const referenceTool: ToolSchema = {
  name: 'reference',
  description: '',
  input_schema: { type: 'object' },
};

const postDir = dirname(fileURLToPath(import.meta.url));

// Only the fields the model reads; without defer_loading, every definition is
// counted as if it were loaded.
function apiTool(tool: ToolSchema): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { ...tool.input_schema, type: 'object' },
  };
}

async function requestTokens(client: Anthropic, tools: ToolSchema[]): Promise<number> {
  const response = await client.messages.countTokens({
    model: tokenizerModel,
    messages: [{ role: 'user', content: 'x' }],
    tools: tools.map(apiTool),
  });
  return response.input_tokens;
}

async function toolCost(
  client: Anthropic,
  tool: ToolSchema,
  referenceTokens: number,
): Promise<ToolCost> {
  return {
    name: tool.name,
    isDeferred: tool.defer_loading === true,
    tokens: (await requestTokens(client, [referenceTool, tool])) - referenceTokens,
  };
}

const toolSchemas: ToolSchemas = JSON.parse(
  readFileSync(join(postDir, 'tool-schemas.json'), 'utf8'),
);
// The SDK retries rate-limit errors with exponential backoff.
const client = new Anthropic({ maxRetries: 10 });
const referenceTokens = await requestTokens(client, [referenceTool]);
const costs: ToolCost[] = [];
for (const tool of toolSchemas.tools) {
  costs.push(await toolCost(client, tool, referenceTokens));
  console.error(`${tool.name}: ${costs.at(-1)?.tokens}`);
}
const toolCosts: ToolCosts = {
  claudeVersion: toolSchemas.claudeVersion,
  tokenizerModel,
  tools: costs,
};
writeFileSync(join(postDir, 'tool-costs.json'), JSON.stringify(toolCosts, null, 2) + '\n');
