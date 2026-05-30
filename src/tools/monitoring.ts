// src/tools/monitoring.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { toolResult, toolError } from './util.js';

export async function getSiteStats(client: IUnifiClient) {
  return client.get<Record<string, unknown>>('stat/health');
}

export async function getDeviceHealth(client: IUnifiClient) {
  return client.get<Record<string, unknown>>('stat/device');
}

export function registerMonitoringTools(server: McpServer, client: IUnifiClient): void {
  server.tool('get_site_stats',
    'Get site-wide health stats: WAN/LAN status, connected device counts, bandwidth usage.',
    {},
    async () => { try { return toolResult(await getSiteStats(client)); } catch (e) { return toolError(e); } });

  server.tool('get_device_health',
    'Get health status of all UniFi devices (UDM Pro, APs, switches): uptime, state, firmware version.',
    {},
    async () => { try { return toolResult(await getDeviceHealth(client)); } catch (e) { return toolError(e); } });
}
