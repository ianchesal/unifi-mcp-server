// src/tools/monitoring.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { type ProjectionParams, project, projectionSchema, toolError, toolResult } from './util.js';

const DEVICE_SUMMARY_FIELDS = [
  'name',
  'model',
  'type',
  'mac',
  'ip',
  'state',
  'adopted',
  'version',
  'upgradable',
  'uptime',
  'last_seen',
  'num_sta',
  'system-stats',
] as const;

export async function getSiteStats(client: IUnifiClient) {
  return client.get<Record<string, unknown>>('stat/health');
}

export async function getDeviceHealth(client: IUnifiClient, params: ProjectionParams = {}) {
  const devices = await client.get<Record<string, unknown>>('stat/device');
  return project(devices, params, DEVICE_SUMMARY_FIELDS);
}

export function registerMonitoringTools(server: McpServer, client: IUnifiClient): void {
  server.tool(
    'get_site_stats',
    'Get site-wide health stats: WAN/LAN status, connected device counts, bandwidth usage.',
    {},
    async () => {
      try {
        return toolResult(await getSiteStats(client));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    'get_device_health',
    'Get health status of all UniFi devices (UDM Pro, APs, switches). Returns a compact summary per device (name, model, ip, state (1=connected), version, upgradable, uptime, num_sta, cpu/mem); pass fields to choose specific keys (e.g. port_table, radio_table_stats) or verbose=true for full objects.',
    projectionSchema,
    async (p) => {
      try {
        return toolResult(await getDeviceHealth(client, p));
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
