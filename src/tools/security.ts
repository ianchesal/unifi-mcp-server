// src/tools/security.ts

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IUnifiClient } from '../unifi/client.js';
import { toolError, toolResult } from './util.js';

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

export const EVENT_CATEGORIES = [
  'SECURITY',
  'AUDIT',
  'CLIENT_DEVICES',
  'UNIFI_DEVICES',
  'INTERNET_AND_WAN',
] as const;
export const EVENT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'] as const;

// When key_filter is set we filter client-side, so scan a wider window than `limit`.
const KEY_FILTER_SCAN_SIZE = 5000;

interface SystemLogParam {
  id?: string;
  name?: string;
}

interface SystemLogEvent {
  id: string;
  timestamp: number;
  category?: string;
  subcategory?: string;
  key?: string;
  event?: string;
  severity?: string;
  title_raw?: string;
  message_raw?: string;
  parameters?: Record<string, SystemLogParam>;
  [k: string]: unknown;
}

interface SystemLogPage {
  data: SystemLogEvent[];
  total_element_count: number;
}

// message_raw is a template like "{CLIENT} roamed from {DEVICE_FROM} to {DEVICE_TO}."
function renderMessage(e: SystemLogEvent): string | undefined {
  return e.message_raw?.replace(/\{([A-Z0-9_]+)\}/g, (match, name: string) => {
    const param = e.parameters?.[name];
    return param?.name ?? param?.id ?? match;
  });
}

function summarizeEvent(e: SystemLogEvent) {
  return {
    id: e.id,
    time: new Date(e.timestamp).toISOString(),
    category: e.category,
    subcategory: e.subcategory,
    key: e.key,
    severity: e.severity,
    title: e.title_raw,
    message: renderMessage(e),
  };
}

export async function getNetworkEvents(
  client: IUnifiClient,
  params: {
    key_filter?: string;
    category?: (typeof EVENT_CATEGORIES)[number][];
    severity?: (typeof EVENT_SEVERITIES)[number][];
    within?: number;
    limit?: number;
    verbose?: boolean;
  }
) {
  const limit = params.limit ?? 100;
  const now = Date.now();
  const body: Record<string, unknown> = {
    pageNumber: 0,
    pageSize: params.key_filter ? KEY_FILTER_SCAN_SIZE : limit,
    timestampFrom: now - (params.within ?? 24) * 3_600_000,
    timestampTo: now,
  };
  if (params.category?.length) body.categories = params.category;
  if (params.severity?.length) body.severities = params.severity;

  const page = await client.v2post<SystemLogPage>('system-log/all', body);
  let events = page.data;
  let total = page.total_element_count;
  if (params.key_filter) {
    const needle = params.key_filter.toUpperCase();
    events = events.filter((e) =>
      [e.key, e.event].some((v) =>
        String(v ?? '')
          .toUpperCase()
          .includes(needle)
      )
    );
    total = events.length;
  }
  events = events.slice(0, limit);
  return { total, data: params.verbose ? events : events.map(summarizeEvent) };
}

export async function getRogueAps(client: IUnifiClient, params: { within?: number }) {
  const body = params.within !== undefined ? { within: params.within } : {};
  const all = await client.post<Record<string, unknown>>('stat/rogueap', body);
  return { total: all.length, data: all };
}

export function registerSecurityTools(server: McpServer, client: IUnifiClient): void {
  server.tool(
    'get_network_events',
    'Get network events from the UniFi system log (IPS threat blocks, client connects/roams, device alerts, admin access), newest first. Optional: within (hours to look back, default 24), category (e.g. ["SECURITY"]), severity (e.g. ["HIGH","VERY_HIGH"]), key_filter (case-insensitive substring of the event key, e.g. "THREAT_BLOCKED" or "CLIENT_ROAMED"), limit, verbose (true returns raw events with all parameters).',
    {
      key_filter: z.string().optional(),
      category: z.array(z.enum(EVENT_CATEGORIES)).optional(),
      severity: z.array(z.enum(EVENT_SEVERITIES)).optional(),
      within: z.number().int().min(1).max(8760).optional(),
      limit: limitSchema,
      verbose: z.boolean().optional(),
    },
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
