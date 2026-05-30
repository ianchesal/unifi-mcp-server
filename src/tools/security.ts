// src/tools/security.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { toolResult, toolError } from './util.js';

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

export async function getNetworkEvents(
  client: IUnifiClient,
  params: { key_filter?: string; limit?: number },
) {
  const all = await client.get<Record<string, unknown>>('stat/event');
  const filtered = params.key_filter
    ? all.filter((e) => String(e.key ?? '').includes(params.key_filter!))
    : all;
  return { total: filtered.length, data: filtered.slice(0, params.limit ?? 100) };
}

export function registerSecurityTools(server: McpServer, client: IUnifiClient): void {
  server.tool('get_network_events',
    'Get network events (client connections, DHCP, admin actions). Optional: key_filter (e.g. "EVT_WC_Connected"), limit.',
    { key_filter: z.string().optional(), limit: limitSchema },
    async (p) => { try { return toolResult(await getNetworkEvents(client, p)); } catch (e) { return toolError(e); } });

}
