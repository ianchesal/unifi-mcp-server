// src/tools/traffic.ts

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IUnifiClient } from '../unifi/client.js';
import { toolError, toolLogger, toolResult } from './util.js';

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

export async function listTrafficRules(client: IUnifiClient, params: { limit?: number }) {
  const all = await client.v2get<Record<string, unknown>>('trafficrules');
  return { total: all.length, data: all.slice(0, params.limit ?? 100) };
}

export async function createTrafficRule(client: IUnifiClient, body: Record<string, unknown>) {
  toolLogger.info(`create_traffic_rule: creating rule "${body.description}"`);
  const result = await client.v2post<Record<string, unknown>>('trafficrules', body);
  toolLogger.info(`create_traffic_rule: created rule id=${result.id ?? result._id}`);
  return result;
}

export async function updateTrafficRule(
  client: IUnifiClient,
  id: string,
  updates: Record<string, unknown>
) {
  toolLogger.info(`update_traffic_rule: updating ${id}`);
  const all = await client.v2get<Record<string, unknown>>('trafficrules');
  const current = all.find((r) => r.id === id || r._id === id);
  if (!current) throw new Error(`Traffic rule not found: ${id}`);
  const merged = { ...current, ...updates };
  const result = await client.v2put<Record<string, unknown>>(`trafficrules/${id}`, merged);
  toolLogger.info(`update_traffic_rule: updated ${id}`);
  return result;
}

export async function deleteTrafficRule(client: IUnifiClient, id: string) {
  toolLogger.info(`delete_traffic_rule: deleting ${id}`);
  await client.v2delete(`trafficrules/${id}`);
  toolLogger.info(`delete_traffic_rule: deleted ${id}`);
  return { success: true, id };
}

export function registerTrafficTools(server: McpServer, client: IUnifiClient): void {
  server.tool(
    'list_traffic_rules',
    'List traffic management rules (newer policy-based rules, separate from classic firewall rules).',
    { limit: limitSchema },
    async (p) => {
      try {
        return toolResult(await listTrafficRules(client, p));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    'create_traffic_rule',
    'Create a traffic rule. Required: description, action, matching_target. See UniFi docs for full schema.',
    { rule: z.record(z.string(), z.unknown()) },
    async ({ rule }) => {
      try {
        return toolResult(await createTrafficRule(client, rule));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    'update_traffic_rule',
    'Update a traffic rule by ID. Only provide fields to change.',
    { id: z.string(), updates: z.record(z.string(), z.unknown()) },
    async ({ id, updates }) => {
      try {
        return toolResult(await updateTrafficRule(client, id, updates));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    'delete_traffic_rule',
    'Delete a traffic rule by ID.',
    { id: z.string() },
    async ({ id }) => {
      try {
        return toolResult(await deleteTrafficRule(client, id));
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
