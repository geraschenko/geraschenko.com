import { describe, expect, it } from 'vitest';
import { schemaParams } from './schema-params';
import { toolSchemas, type JsonSchema } from './tool-costs';

function inputSchema(toolName: string): JsonSchema {
  const tool = toolSchemas.tools.find((candidate) => candidate.name === toolName);
  if (!tool) throw new Error(`no tool ${toolName} in tool-schemas.json`);
  return tool.input_schema;
}

describe('schemaParams', () => {
  it('lists scalar parameters with required flags and defaults', () => {
    const params = schemaParams({
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command' },
        timeout: { type: 'number', default: 120000 },
      },
      required: ['command'],
    });
    expect(params).toEqual([
      {
        name: 'command',
        type: 'string',
        isRequired: true,
        description: 'The command',
        defaultLiteral: undefined,
        bounds: [],
        fields: [],
      },
      {
        name: 'timeout',
        type: 'number',
        isRequired: false,
        description: undefined,
        defaultLiteral: '120000',
        bounds: [],
        fields: [],
      },
    ]);
  });

  it('writes enums and consts as literal unions', () => {
    const [mode, status] = schemaParams({
      type: 'object',
      properties: { mode: { type: 'string', enum: ['a', 'b'] }, status: { const: 'proactive' } },
    });
    expect(mode.type).toBe('"a" | "b"');
    expect(status.type).toBe('"proactive"');
  });

  it('nests the fields of array items', () => {
    const [questions] = schemaParams(inputSchema('AskUserQuestion'));
    expect(questions.type).toBe('object[]');
    expect(questions.fields.map((field) => field.name)).toContain('options');
  });

  it('nests the fields of record values', () => {
    const annotations = schemaParams(inputSchema('AskUserQuestion')).find(
      (param) => param.name === 'annotations',
    );
    expect(annotations?.type).toBe('Record<string, object>');
    expect(annotations?.fields.map((field) => field.name)).toEqual(['preview', 'notes']);
  });

  it('treats an unconstrained record as an open object', () => {
    const body = schemaParams(inputSchema('RemoteTrigger')).find((param) => param.name === 'body');
    expect(body?.type).toBe('Record<string, unknown>');
  });

  it('states ranges, one-sided limits, and limits on array items', () => {
    const bounds = (toolName: string, paramName: string): string[] | undefined =>
      schemaParams(inputSchema(toolName)).find((param) => param.name === paramName)?.bounds;
    expect(bounds('AskUserQuestion', 'questions')).toEqual(['1–4 items']);
    expect(bounds('Monitor', 'timeout_ms')).toEqual(['1000–3600000']);
    expect(bounds('WebSearch', 'query')).toEqual(['≥ 2 characters']);
    expect(bounds('DesignSync', 'writes')).toEqual(['≤ 256 items', 'each 1–256 characters']);
  });

  it('omits the safe-integer range zod writes on every integer', () => {
    const limit = schemaParams(inputSchema('Read')).find((param) => param.name === 'limit');
    expect(limit?.bounds).toEqual(['> 0']);
  });
});
