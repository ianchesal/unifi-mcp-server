import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { toolResult, toolError, toolLogger } from './util.js';

// --- Handler functions (exported for testing) ---

export async function listFirewallRules(
  client: IUnifiClient,
  params: { ruleset?: string; limit?: number },
) {
  const all = await client.get<Record<string, unknown>>('rest/firewallrule');
  const filtered = params.ruleset ? all.filter((r) => r.ruleset === params.ruleset) : all;
  return { total: filtered.length, data: filtered.slice(0, params.limit ?? 100) };
}

export async function getFirewallRule(client: IUnifiClient, id: string) {
  const items = await client.get<Record<string, unknown>>(`rest/firewallrule/${id}`);
  if (items.length === 0) throw new Error(`Firewall rule not found: ${id}`);
  return items[0];
}

export async function createFirewallRule(client: IUnifiClient, body: Record<string, unknown>) {
  toolLogger.info(`create_firewall_rule: creating rule "${body.name}"`);
  const result = await client.post<Record<string, unknown>>('rest/firewallrule', body);
  toolLogger.info(`create_firewall_rule: created rule _id=${result[0]?._id}`);
  return result[0];
}

export async function updateFirewallRule(
  client: IUnifiClient,
  id: string,
  updates: Record<string, unknown>,
) {
  toolLogger.info(`update_firewall_rule: updating ${id}`);
  const items = await client.get<Record<string, unknown>>(`rest/firewallrule/${id}`);
  if (items.length === 0) throw new Error(`Firewall rule not found: ${id}`);
  const merged = { ...items[0], ...updates };
  const result = await client.put<Record<string, unknown>>(`rest/firewallrule/${id}`, merged);
  toolLogger.info(`update_firewall_rule: updated ${id}`);
  return result[0];
}

export async function deleteFirewallRule(client: IUnifiClient, id: string) {
  toolLogger.info(`delete_firewall_rule: deleting ${id}`);
  await client.delete(`rest/firewallrule/${id}`);
  toolLogger.info(`delete_firewall_rule: deleted ${id}`);
  return { success: true, id };
}

export async function listFirewallGroups(
  client: IUnifiClient,
  params: { limit?: number },
) {
  const all = await client.get<Record<string, unknown>>('rest/firewallgroup');
  return { total: all.length, data: all.slice(0, params.limit ?? 100) };
}

export async function createFirewallGroup(client: IUnifiClient, body: Record<string, unknown>) {
  toolLogger.info(`create_firewall_group: creating group "${body.name}"`);
  const result = await client.post<Record<string, unknown>>('rest/firewallgroup', body);
  toolLogger.info(`create_firewall_group: created group _id=${result[0]?._id}`);
  return result[0];
}

export async function updateFirewallGroup(
  client: IUnifiClient,
  id: string,
  updates: Record<string, unknown>,
) {
  toolLogger.info(`update_firewall_group: updating ${id}`);
  const items = await client.get<Record<string, unknown>>(`rest/firewallgroup/${id}`);
  if (items.length === 0) throw new Error(`Firewall group not found: ${id}`);
  const merged = { ...items[0], ...updates };
  const result = await client.put<Record<string, unknown>>(`rest/firewallgroup/${id}`, merged);
  toolLogger.info(`update_firewall_group: updated ${id}`);
  return result[0];
}

export async function deleteFirewallGroup(client: IUnifiClient, id: string) {
  toolLogger.info(`delete_firewall_group: deleting ${id}`);
  await client.delete(`rest/firewallgroup/${id}`);
  toolLogger.info(`delete_firewall_group: deleted ${id}`);
  return { success: true, id };
}

// --- MCP registration ---

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

export function registerFirewallTools(server: McpServer, client: IUnifiClient): void {
  server.tool('list_firewall_rules',
    'List firewall rules. Optionally filter by ruleset (WAN_IN, WAN_OUT, LAN_IN, LAN_OUT, GUEST_IN, GUEST_OUT).',
    { ruleset: z.string().optional(), limit: limitSchema },
    async (p) => { try { return toolResult(await listFirewallRules(client, p)); } catch (e) { return toolError(e); } });

  server.tool('get_firewall_rule',
    'Get a single firewall rule by its ID.',
    { id: z.string() },
    async ({ id }) => { try { return toolResult(await getFirewallRule(client, id)); } catch (e) { return toolError(e); } });

  server.tool('create_firewall_rule',
    'Create a new firewall rule. Required fields: name, ruleset, action (accept|drop|reject). Optional: src_address, dst_address, protocol, src_port, dst_port, enabled.',
    { rule: z.record(z.unknown()) },
    async ({ rule }) => { try { return toolResult(await createFirewallRule(client, rule)); } catch (e) { return toolError(e); } });

  server.tool('update_firewall_rule',
    'Update an existing firewall rule by ID. Only provide fields to change — existing fields are preserved via read-before-write.',
    { id: z.string(), updates: z.record(z.unknown()) },
    async ({ id, updates }) => { try { return toolResult(await updateFirewallRule(client, id, updates)); } catch (e) { return toolError(e); } });

  server.tool('delete_firewall_rule',
    'Delete a firewall rule by ID.',
    { id: z.string() },
    async ({ id }) => { try { return toolResult(await deleteFirewallRule(client, id)); } catch (e) { return toolError(e); } });

  server.tool('list_firewall_groups',
    'List firewall groups (IP sets and port sets used in firewall rules).',
    { limit: limitSchema },
    async (p) => { try { return toolResult(await listFirewallGroups(client, p)); } catch (e) { return toolError(e); } });

  server.tool('create_firewall_group',
    'Create a firewall group. Required: name, group_type (address-group|port-group|ipv6-address-group), group_members (array of IPs/CIDRs or ports).',
    { group: z.record(z.unknown()) },
    async ({ group }) => { try { return toolResult(await createFirewallGroup(client, group)); } catch (e) { return toolError(e); } });

  server.tool('update_firewall_group',
    'Update a firewall group by ID. Only provide fields to change.',
    { id: z.string(), updates: z.record(z.unknown()) },
    async ({ id, updates }) => { try { return toolResult(await updateFirewallGroup(client, id, updates)); } catch (e) { return toolError(e); } });

  server.tool('delete_firewall_group',
    'Delete a firewall group by ID.',
    { id: z.string() },
    async ({ id }) => { try { return toolResult(await deleteFirewallGroup(client, id)); } catch (e) { return toolError(e); } });
}
