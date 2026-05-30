// src/tools/network.ts

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IUnifiClient } from '../unifi/client.js';
import { toolError, toolLogger, toolResult } from './util.js';

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

export async function listNetworks(client: IUnifiClient, params: { limit?: number }) {
  const all = await client.get<Record<string, unknown>>('rest/networkconf');
  return { total: all.length, data: all.slice(0, params.limit ?? 100) };
}

export async function getNetwork(client: IUnifiClient, id: string) {
  const items = await client.get<Record<string, unknown>>(`rest/networkconf/${id}`);
  if (items.length === 0) throw new Error(`Network not found: ${id}`);
  return items[0];
}

export async function createNetwork(client: IUnifiClient, body: Record<string, unknown>) {
  toolLogger.info(`create_network: creating network "${body.name}"`);
  const result = await client.post<Record<string, unknown>>('rest/networkconf', body);
  toolLogger.info(`create_network: created network _id=${result[0]?._id}`);
  return result[0];
}

export async function updateNetwork(
  client: IUnifiClient,
  id: string,
  updates: Record<string, unknown>
) {
  toolLogger.info(`update_network: updating ${id}`);
  const items = await client.get<Record<string, unknown>>(`rest/networkconf/${id}`);
  if (items.length === 0) throw new Error(`Network not found: ${id}`);
  const merged = { ...items[0], ...updates };
  const result = await client.put<Record<string, unknown>>(`rest/networkconf/${id}`, merged);
  toolLogger.info(`update_network: updated ${id}`);
  return result[0];
}

export async function deleteNetwork(client: IUnifiClient, id: string, confirmName: string) {
  const items = await client.get<Record<string, unknown>>(`rest/networkconf/${id}`);
  if (items.length === 0) throw new Error(`Network not found: ${id}`);
  const network = items[0];
  if (network.name !== confirmName) {
    throw new Error(
      `Confirmation name '${confirmName}' does not match network name '${network.name}'. Pass the exact network name to confirm deletion.`
    );
  }
  toolLogger.info(`delete_network: deleting ${id} (${confirmName})`);
  await client.delete(`rest/networkconf/${id}`);
  toolLogger.info(`delete_network: deleted ${id}`);
  return { success: true, id, name: confirmName };
}

export function registerNetworkTools(server: McpServer, client: IUnifiClient): void {
  server.tool(
    'list_networks',
    'List all networks and VLANs.',
    { limit: limitSchema },
    async (p) => {
      try {
        return toolResult(await listNetworks(client, p));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool('get_network', 'Get a network by ID.', { id: z.string() }, async ({ id }) => {
    try {
      return toolResult(await getNetwork(client, id));
    } catch (e) {
      return toolError(e);
    }
  });

  server.tool(
    'create_network',
    'Create a network. Required: name, ip_subnet (CIDR). Optional: vlan_id, dhcpd_enabled, purpose.',
    { network: z.record(z.unknown()) },
    async ({ network }) => {
      try {
        return toolResult(await createNetwork(client, network));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    'update_network',
    'Update a network by ID. Only provide fields to change.',
    { id: z.string(), updates: z.record(z.unknown()) },
    async ({ id, updates }) => {
      try {
        return toolResult(await updateNetwork(client, id, updates));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    'delete_network',
    'Delete a network by ID. DESTRUCTIVE: disconnects all devices on the network. Must pass confirm_name matching the network name exactly.',
    { id: z.string(), confirm_name: z.string().describe('Must exactly match the network name') },
    async ({ id, confirm_name }) => {
      try {
        return toolResult(await deleteNetwork(client, id, confirm_name));
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
