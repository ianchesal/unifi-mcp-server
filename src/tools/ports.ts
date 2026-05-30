// src/tools/ports.ts

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IUnifiClient } from '../unifi/client.js';
import { toolError, toolLogger, toolResult } from './util.js';

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

export async function listPortForwards(client: IUnifiClient, params: { limit?: number }) {
  const all = await client.get<Record<string, unknown>>('rest/portforward');
  return { total: all.length, data: all.slice(0, params.limit ?? 100) };
}

export async function createPortForward(client: IUnifiClient, body: Record<string, unknown>) {
  toolLogger.info(`create_port_forward: creating rule "${body.name}"`);
  const result = await client.post<Record<string, unknown>>('rest/portforward', body);
  toolLogger.info(`create_port_forward: created rule _id=${result[0]?._id}`);
  return result[0];
}

export async function updatePortForward(
  client: IUnifiClient,
  id: string,
  updates: Record<string, unknown>
) {
  toolLogger.info(`update_port_forward: updating ${id}`);
  const items = await client.get<Record<string, unknown>>(`rest/portforward/${id}`);
  if (items.length === 0) throw new Error(`Port forward not found: ${id}`);
  const merged = { ...items[0], ...updates };
  const result = await client.put<Record<string, unknown>>(`rest/portforward/${id}`, merged);
  toolLogger.info(`update_port_forward: updated ${id}`);
  return result[0];
}

export async function deletePortForward(client: IUnifiClient, id: string) {
  toolLogger.info(`delete_port_forward: deleting ${id}`);
  await client.delete(`rest/portforward/${id}`);
  toolLogger.info(`delete_port_forward: deleted ${id}`);
  return { success: true, id };
}

export function registerPortTools(server: McpServer, client: IUnifiClient): void {
  server.tool(
    'list_port_forwards',
    'List all port forwarding rules.',
    { limit: limitSchema },
    async (p) => {
      try {
        return toolResult(await listPortForwards(client, p));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    'create_port_forward',
    'Create a port forward rule. Required: name, dst_port (external port), fwd (destination IP), fwd_port (internal port), proto (tcp/udp/tcp_udp).',
    { rule: z.record(z.string(), z.unknown()) },
    async ({ rule }) => {
      try {
        return toolResult(await createPortForward(client, rule));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    'update_port_forward',
    'Update a port forward rule by ID. Only provide fields to change.',
    { id: z.string(), updates: z.record(z.string(), z.unknown()) },
    async ({ id, updates }) => {
      try {
        return toolResult(await updatePortForward(client, id, updates));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    'delete_port_forward',
    'Delete a port forward rule by ID.',
    { id: z.string() },
    async ({ id }) => {
      try {
        return toolResult(await deletePortForward(client, id));
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
