// src/tools/clients.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { toolResult, toolError, toolLogger } from './util.js';

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

export async function listClients(
  client: IUnifiClient,
  params: { include_offline?: boolean; limit?: number },
) {
  const endpoint = params.include_offline ? 'stat/alluser' : 'stat/sta';
  const all = await client.get<Record<string, unknown>>(endpoint);
  return { total: all.length, data: all.slice(0, params.limit ?? 100) };
}

export async function getClient(client: IUnifiClient, mac: string) {
  const all = await client.get<Record<string, unknown>>('stat/sta');
  const found = all.find((c) => c.mac === mac.toLowerCase());
  if (!found) throw new Error(`Client not found: ${mac}`);
  return found;
}

export async function blockClient(client: IUnifiClient, mac: string) {
  toolLogger.info(`block_client: blocking ${mac}`);
  await client.cmd('stamgr', { cmd: 'block-sta', mac });
  toolLogger.info(`block_client: blocked ${mac}`);
  return { success: true, mac, action: 'blocked' };
}

export async function unblockClient(client: IUnifiClient, mac: string) {
  toolLogger.info(`unblock_client: unblocking ${mac}`);
  await client.cmd('stamgr', { cmd: 'unblock-sta', mac });
  toolLogger.info(`unblock_client: unblocked ${mac}`);
  return { success: true, mac, action: 'unblocked' };
}

async function findUserByMac(client: IUnifiClient, mac: string) {
  const users = await client.get<Record<string, unknown>>('rest/user');
  const user = users.find((u) => u.mac === mac.toLowerCase());
  if (!user) throw new Error(`Client not found: ${mac}`);
  return user;
}

export async function setClientFixedIp(client: IUnifiClient, mac: string, ip: string) {
  toolLogger.info(`set_client_fixed_ip: setting ${mac} -> ${ip}`);
  const user = await findUserByMac(client, mac);
  const updated = await client.put<Record<string, unknown>>(
    `rest/user/${user._id}`,
    { ...user, use_fixedip: true, fixed_ip: ip },
  );
  toolLogger.info(`set_client_fixed_ip: set fixed IP for ${mac}`);
  return updated[0];
}

export async function removeClientFixedIp(client: IUnifiClient, mac: string) {
  toolLogger.info(`remove_client_fixed_ip: clearing ${mac}`);
  const user = await findUserByMac(client, mac);
  const updated = await client.put<Record<string, unknown>>(
    `rest/user/${user._id}`,
    { ...user, use_fixedip: false, fixed_ip: '' },
  );
  toolLogger.info(`remove_client_fixed_ip: cleared fixed IP for ${mac}`);
  return updated[0];
}

export function registerClientTools(server: McpServer, client: IUnifiClient): void {
  server.tool('list_clients',
    'List network clients. include_offline=true includes recently seen offline clients.',
    { include_offline: z.boolean().default(false).optional(), limit: limitSchema },
    async (p) => { try { return toolResult(await listClients(client, p)); } catch (e) { return toolError(e); } });

  server.tool('get_client', 'Get details for a connected client by MAC address.',
    { mac: z.string() },
    async ({ mac }) => { try { return toolResult(await getClient(client, mac)); } catch (e) { return toolError(e); } });

  server.tool('block_client', 'Block a client from the network by MAC address.',
    { mac: z.string() },
    async ({ mac }) => { try { return toolResult(await blockClient(client, mac)); } catch (e) { return toolError(e); } });

  server.tool('unblock_client', 'Unblock a previously blocked client by MAC address.',
    { mac: z.string() },
    async ({ mac }) => { try { return toolResult(await unblockClient(client, mac)); } catch (e) { return toolError(e); } });

  server.tool('set_client_fixed_ip', 'Assign a fixed/static IP address to a client by MAC.',
    { mac: z.string(), ip: z.string() },
    async ({ mac, ip }) => { try { return toolResult(await setClientFixedIp(client, mac, ip)); } catch (e) { return toolError(e); } });

  server.tool('remove_client_fixed_ip', 'Remove the fixed IP assignment from a client.',
    { mac: z.string() },
    async ({ mac }) => { try { return toolResult(await removeClientFixedIp(client, mac)); } catch (e) { return toolError(e); } });
}
