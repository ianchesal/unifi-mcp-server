// src/tools/security.ts

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IUnifiClient } from '../unifi/client.js';
import { toolError, toolResult } from './util.js';

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

export async function getNetworkEvents(
  client: IUnifiClient,
  params: { key_filter?: string; limit?: number; archived?: boolean }
) {
  const all = await client.get<Record<string, unknown>>('list/alarm');
  let filtered = params.key_filter
    ? all.filter((e) => String(e.key ?? '').includes(params.key_filter ?? ''))
    : all;
  if (params.archived !== undefined) {
    filtered = filtered.filter((e) => Boolean(e.archived) === params.archived);
  }
  return { total: filtered.length, data: filtered.slice(0, params.limit ?? 100) };
}

export async function getRogueAps(client: IUnifiClient, params: { within?: number }) {
  const body = params.within !== undefined ? { within: params.within } : {};
  const all = await client.post<Record<string, unknown>>('stat/rogueap', body);
  return { total: all.length, data: all };
}

export function registerSecurityTools(server: McpServer, client: IUnifiClient): void {
  server.tool(
    'get_network_events',
    'Get network alarms/alerts (e.g. IPS/IDS blocks, rogue AP detected, admin actions). Optional: key_filter (e.g. "EVT_WC_Connected"), limit, archived (true/false to filter by archived status).',
    { key_filter: z.string().optional(), limit: limitSchema, archived: z.boolean().optional() },
    async (p) => {
      try {
        return toolResult(await getNetworkEvents(client, p));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    'get_rogue_aps',
    'Get neighboring/rogue access points detected near your network. Optional: within (hours to look back, e.g. 24).',
    { within: z.number().int().min(1).max(8760).optional() },
    async (p) => {
      try {
        return toolResult(await getRogueAps(client, p));
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
