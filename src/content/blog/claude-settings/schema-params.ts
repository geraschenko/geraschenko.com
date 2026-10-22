// A tool's input schema as a parameter list for readers, in place of raw
// JSON Schema. Covers the keywords Claude Code 2.1.280's tool schemas use,
// except `pattern` and `format`.

import type { JsonSchema } from './tool-costs.ts';

export interface SchemaParam {
  name: string;
  /** TypeScript-like: `string`, `"a" | "b"`, `object[]`, `Record<string, string>`. */
  type: string;
  isRequired: boolean;
  /** Markdown. */
  description?: string;
  defaultLiteral?: string;
  /** Readable limits on the value: `1–4 items`, `≥ 0`, `each ≤ 256 characters`. */
  bounds: string[];
  /** The fields of an object, of an array's object items, or of a record's object values. */
  fields: SchemaParam[];
}

/** The parameters of an object schema, in declaration order. */
export function schemaParams(schema: JsonSchema): SchemaParam[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, property]) => ({
    name,
    type: typeName(property),
    isRequired: required.has(name),
    description: property.description,
    defaultLiteral: property.default === undefined ? undefined : JSON.stringify(property.default),
    bounds: [
      ...valueBounds(property),
      ...(property.items ? valueBounds(property.items).map((bound) => `each ${bound}`) : []),
    ],
    fields: schemaParams(fieldsSchema(property)),
  }));
}

function typeName(schema: JsonSchema): string {
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (schema.type === 'array') return `${schema.items ? typeName(schema.items) : 'unknown'}[]`;
  const recordValues = recordValueSchema(schema);
  if (recordValues) return `Record<string, ${typeName(recordValues)}>`;
  if (Array.isArray(schema.type)) return schema.type.join(' | ');
  return schema.type ?? 'unknown';
}

// zod writes ±Number.MAX_SAFE_INTEGER as the range of every integer; it
// limits nothing a reader cares about.
const realLimit = (limit: number | undefined): number | undefined =>
  limit === undefined || Math.abs(limit) === Number.MAX_SAFE_INTEGER ? undefined : limit;

function valueBounds(schema: JsonSchema): string[] {
  const exclusiveMinimum = realLimit(schema.exclusiveMinimum);
  const exclusiveMaximum = realLimit(schema.exclusiveMaximum);
  return [
    ...rangeBounds(realLimit(schema.minimum), realLimit(schema.maximum), ''),
    ...(exclusiveMinimum === undefined ? [] : [`> ${exclusiveMinimum}`]),
    ...(exclusiveMaximum === undefined ? [] : [`< ${exclusiveMaximum}`]),
    ...rangeBounds(schema.minLength, schema.maxLength, ' characters'),
    ...rangeBounds(schema.minItems, schema.maxItems, ' items'),
  ];
}

function rangeBounds(
  min: number | undefined,
  max: number | undefined,
  unitSuffix: string,
): string[] {
  if (min !== undefined && max !== undefined) return [`${min}–${max}${unitSuffix}`];
  if (min !== undefined) return [`≥ ${min}${unitSuffix}`];
  if (max !== undefined) return [`≤ ${max}${unitSuffix}`];
  return [];
}

/** The schema whose properties are this parameter's nested fields. */
function fieldsSchema(schema: JsonSchema): JsonSchema {
  if (schema.type === 'array' && schema.items) return fieldsSchema(schema.items);
  return recordValueSchema(schema) ?? schema;
}

// An object without declared properties whose values follow one schema.
function recordValueSchema(schema: JsonSchema): JsonSchema | undefined {
  const values = schema.additionalProperties;
  if (schema.properties || typeof values !== 'object') return undefined;
  return values;
}
