// src/tools/security.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { toolResult, toolError } from './util.js';

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

interface ThreatEvent {
  _id?: string;
  src_ip?: string;
  category?: string;
  action?: string;
  severity?: number;
  timestamp?: number;
  [key: string]: unknown;
}

function topN(
  items: ThreatEvent[],
  keyFn: (item: ThreatEvent) => string | undefined,
  n: number,
): Array<Record<string, string | number>> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (key) counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, count]) => ({ key: k, count }));
}

export async function getThreatEvents(
  client: IUnifiClient,
  params: { min_severity?: number; limit?: number },
) {
  const all = await client.get<ThreatEvent>('stat/ips/event');
  const filtered = params.min_severity !== undefined
    ? all.filter((e) => (e.severity ?? 0) >= params.min_severity!)
    : all;
  return { total: filtered.length, data: filtered.slice(0, params.limit ?? 100) };
}

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

export async function analyzeThreats(
  client: IUnifiClient,
  params: { min_severity?: number },
) {
  const all = await client.get<ThreatEvent>('stat/ips/event');
  const events = params.min_severity !== undefined
    ? all.filter((e) => (e.severity ?? 0) >= params.min_severity!)
    : all;

  const blocked_count = events.filter((e) => e.action === 'blocked').length;
  const alerted_count = events.filter((e) => e.action === 'alerted').length;
  const timestamps = events.map((e) => e.timestamp).filter((t): t is number => t !== undefined);
  const time_range = timestamps.length > 0
    ? { earliest: Math.min(...timestamps), latest: Math.max(...timestamps) }
    : null;

  const top_source_ips = topN(events, (e) => e.src_ip, 10).map(({ key, count }) => ({ ip: key, count }));
  const top_categories = topN(events, (e) => e.category, 10).map(({ key, count }) => ({ category: key, count }));

  return {
    total_events: events.length,
    blocked_count,
    alerted_count,
    time_range,
    top_source_ips,
    top_categories,
    events,
  };
}

export function registerSecurityTools(server: McpServer, client: IUnifiClient): void {
  server.tool('get_threat_events',
    'Get IDS/IPS threat events. Optional: min_severity (1-5), limit. Returns events with src_ip, category, action (blocked|alerted), severity.',
    { min_severity: z.number().int().min(1).max(5).optional(), limit: limitSchema },
    async (p) => { try { return toolResult(await getThreatEvents(client, p)); } catch (e) { return toolError(e); } });

  server.tool('get_network_events',
    'Get network events (client connections, DHCP, admin actions). Optional: key_filter (e.g. "EVT_WC_Connected"), limit.',
    { key_filter: z.string().optional(), limit: limitSchema },
    async (p) => { try { return toolResult(await getNetworkEvents(client, p)); } catch (e) { return toolError(e); } });

  server.tool('analyze_threats',
    'Aggregate IDS/IPS threat events into a summary: top 10 source IPs, top 10 categories, blocked vs alerted counts, time range. Raw events included alongside aggregates.',
    { min_severity: z.number().int().min(1).max(5).optional() },
    async (p) => { try { return toolResult(await analyzeThreats(client, p)); } catch (e) { return toolError(e); } });
}
