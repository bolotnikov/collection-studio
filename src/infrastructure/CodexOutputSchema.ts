import { z } from 'zod';

/** Adapt optional application fields to required nullable CLI fields without changing persisted contracts. */
export class CodexOutputSchema<T> {
  private readonly original: z.core.JSONSchema.BaseSchema;
  readonly jsonSchema: z.core.JSONSchema.BaseSchema;

  constructor(private readonly schema: z.ZodType<T>) {
    this.original = z.toJSONSchema(schema, { target: 'draft-7', cycles: 'throw' });
    this.jsonSchema = z.toJSONSchema(schema, {
      target: 'draft-7',
      cycles: 'throw',
      override: ({ jsonSchema }) => {
        const properties = jsonSchema.properties;
        if (!properties) return;
        const required = new Set(jsonSchema.required ?? []);
        for (const [key, value] of Object.entries(properties)) {
          if (required.has(key)) continue;
          if (typeof value === 'boolean')
            throw new Error(`Boolean property schemas are not supported by Codex: ${key}`);
          properties[key] = { anyOf: [value, { type: 'null' }] };
        }
        jsonSchema.required = Object.keys(properties);
      },
    });
  }

  parse(value: unknown): T {
    return this.schema.parse(this.restore(value, this.original));
  }

  private restore(value: unknown, schema: z.core.JSONSchema.BaseSchema | boolean): unknown {
    if (typeof schema === 'boolean') return value;
    if (schema.anyOf) {
      for (const branch of schema.anyOf) {
        const restored = this.restore(value, branch);
        if (typeof branch === 'boolean' ? branch : z.fromJSONSchema(branch).safeParse(restored).success)
          return restored;
      }
      return value;
    }
    if (Array.isArray(value) && schema.items && !Array.isArray(schema.items)) {
      const items = schema.items;
      return value.map((entry: unknown) => this.restore(entry, items));
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && schema.properties) {
      const required = new Set(schema.required ?? []);
      return Object.fromEntries(
        Object.entries(value).flatMap(([key, entry]: [string, unknown]) => {
          const property = schema.properties?.[key];
          if (property === undefined) return [[key, entry]];
          if (
            entry === null &&
            !required.has(key) &&
            !(typeof property === 'boolean' ? property : z.fromJSONSchema(property).safeParse(null).success)
          )
            return [];
          return [[key, this.restore(entry, property)]];
        }),
      );
    }
    return value;
  }
}
