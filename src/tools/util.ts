// src/tools/util.ts
import { z } from 'zod';
import { createLogger } from '../logger.js';

// Module-level logger for tool audit logging. LOG_LEVEL is set before tools are loaded.
export const toolLogger = createLogger(
  (process.env.LOG_LEVEL ?? 'info') as 'error' | 'warn' | 'info' | 'debug'
);

export function toolResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function toolError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true as const,
  };
}

export const projectionSchema = {
  fields: z
    .array(z.string())
    .optional()
    .describe('Return only these fields per item (overrides the compact default).'),
  verbose: z
    .boolean()
    .optional()
    .describe('Return full raw objects instead of the compact default. Can be very large.'),
};

export interface ProjectionParams {
  fields?: string[];
  verbose?: boolean;
}

// Reduce raw UniFi objects to a manageable size. Explicit `fields` wins, then `verbose`
// returns everything, otherwise the tool's compact default field set is used.
export function project<T extends Record<string, unknown>>(
  records: T[],
  params: ProjectionParams,
  defaultFields: readonly string[]
): Record<string, unknown>[] {
  if (params.verbose && !params.fields?.length) return records;
  const keys = params.fields?.length ? params.fields : defaultFields;
  return records.map((r) => {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (k in r) out[k] = r[k];
    return out;
  });
}
