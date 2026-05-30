// src/tools/util.ts
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
