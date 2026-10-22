// The tool definitions Claude Code sends (tool-schemas.json, a capture from
// clauctl's scripts/claude-tools) and what each costs per request
// (tool-costs.json, written by generate-tool-costs.ts from that capture).

import toolSchemasJson from './tool-schemas.json' with { type: 'json' };

/** A JSON Schema, as far as the parameter view reads it. */
export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  [keyword: string]: unknown;
}

/** One tool definition as Claude Code sends it to the Messages API. */
export interface ToolSchema {
  name: string;
  description: string;
  input_schema: JsonSchema;
  /** Absent, not false, on tools loaded on every request. */
  defer_loading?: boolean;
  eager_input_streaming?: boolean;
}

export interface ToolSchemas {
  claudeVersion: string;
  sdkVersion: string;
  tools: ToolSchema[];
}

// TypeScript infers the tools array as one union whose absent keys are
// `?: undefined`, which `Record<string, JsonSchema>` rejects; the capture
// itself has the ToolSchemas shape.
export const toolSchemas = toolSchemasJson as unknown as ToolSchemas;

export interface ToolCost {
  name: string;
  isDeferred: boolean;
  /** Tokens the tool's definition adds to a request. */
  tokens: number;
}

export interface ToolCosts {
  /** The version of the tool-schemas.json capture the costs were counted from. */
  claudeVersion: string;
  /** Token counts depend on the model's tokenizer. */
  tokenizerModel: string;
  tools: ToolCost[];
}

/** The settings that remove tools; tool-settings.json is the post's instance. */
export interface ToolRemovingSettings {
  permissions?: { deny?: string[] };
  enableWorkflows?: boolean;
  enableArtifact?: boolean;
}

/**
 * Names of the tools that `settings` takes out of the model's tool list.
 *
 * The tool names behind `enableWorkflows` and `enableArtifact` are Claude
 * Code 2.1.280's; the `/context all` capture with the recommended settings
 * shows them gone.
 */
export function removedToolNames(settings: ToolRemovingSettings): Set<string> {
  return new Set([
    ...(settings.permissions?.deny ?? []),
    ...(settings.enableWorkflows === false ? ['Workflow'] : []),
    ...(settings.enableArtifact === false ? ['Artifact'] : []),
  ]);
}

/**
 * Bar colours for the chart and the hero. Removed tools are what the post is
 * about, so they get the warm colour; `kept` is global.css's `--gray`.
 */
export const barColours = { removed: '#c4453a', kept: 'rgb(96, 115, 159)' };

/** Eager tools first, then deferred; most expensive first within each. */
export function chartOrder(costs: ToolCost[]): ToolCost[] {
  return [...costs].sort(
    (a, b) => Number(a.isDeferred) - Number(b.isDeferred) || b.tokens - a.tokens,
  );
}
