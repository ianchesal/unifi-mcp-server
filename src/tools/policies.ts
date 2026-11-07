// src/tools/policies.ts
// Zone-based firewall (UniFi Network 9.x+): zones and firewall policies via the v2 API.
// Sites that have migrated to zone-based firewall reject legacy rest/firewallrule writes.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IUnifiClient } from '../unifi/client.js';
import {
  type ProjectionParams,
  project,
  projectionSchema,
  toolError,
  toolLogger,
  toolResult,
} from './util.js';

type Rec = Record<string, unknown>;

interface Zone extends Rec {
  _id: string;
  name: string;
  zone_key?: string;
  network_ids?: string[];
}

interface Endpoint extends Rec {
  zone_id?: string;
}

interface Policy extends Rec {
  _id: string;
  name?: string;
  action?: string;
  enabled?: boolean;
  predefined?: boolean;
  index?: number;
  source?: Endpoint;
  destination?: Endpoint;
}

const POLICY_DEFAULT_FIELDS = [
  '_id',
  'name',
  'action',
  'enabled',
  'predefined',
  'index',
  'protocol',
  'ip_version',
  'source_zone',
  'destination_zone',
  'source',
  'destination',
] as const;

async function fetchZones(client: IUnifiClient): Promise<Zone[]> {
  return client.v2get<Zone>('firewall/zone');
}

async function fetchPolicies(client: IUnifiClient): Promise<Policy[]> {
  return client.v2get<Policy>('firewall-policies');
}

// Accept a zone id, name or zone_key (case-insensitive for name/key).
function resolveZone(zones: Zone[], ref: string): Zone {
  const lower = ref.toLowerCase();
  const zone = zones.find(
    (z) => z._id === ref || z.name.toLowerCase() === lower || z.zone_key?.toLowerCase() === lower
  );
  if (!zone) {
    const known = zones.map((z) => z.zone_key ?? z.name).join(', ');
    throw new Error(`Firewall zone not found: ${ref} (known: ${known})`);
  }
  return zone;
}

function inferIpVersion(ips: string[]): 'IPV4' | 'IPV6' | 'BOTH' {
  if (ips.length === 0) return 'BOTH';
  const v6 = ips.filter((ip) => ip.includes(':')).length;
  if (v6 === 0) return 'IPV4';
  if (v6 === ips.length) return 'IPV6';
  throw new Error('Cannot mix IPv4 and IPv6 addresses in one policy; create one policy per family');
}

function buildEndpoint(zoneId: string, ips: string[] | undefined): Endpoint {
  const base = {
    zone_id: zoneId,
    matching_target_type: 'SPECIFIC',
    port_matching_type: 'ANY',
    match_opposite_ports: false,
  };
  if (ips?.length) {
    return { ...base, matching_target: 'IP', ips, match_opposite_ips: false };
  }
  return { ...base, matching_target: 'ANY' };
}

// --- Handler functions (exported for testing) ---

export async function listFirewallZones(client: IUnifiClient) {
  const zones = await fetchZones(client);
  return {
    total: zones.length,
    data: zones.map(({ _id, name, zone_key, network_ids }) => ({
      _id,
      name,
      zone_key,
      network_ids,
    })),
  };
}

export async function listFirewallPolicies(
  client: IUnifiClient,
  params: {
    include_predefined?: boolean;
    source_zone?: string;
    destination_zone?: string;
    limit?: number;
  } & ProjectionParams
) {
  const [zones, policies] = await Promise.all([fetchZones(client), fetchPolicies(client)]);
  const zoneName = new Map(zones.map((z) => [z._id, z.name]));
  const srcId = params.source_zone ? resolveZone(zones, params.source_zone)._id : undefined;
  const dstId = params.destination_zone
    ? resolveZone(zones, params.destination_zone)._id
    : undefined;

  const filtered = policies
    .filter((p) => params.include_predefined || !p.predefined)
    .filter((p) => !srcId || p.source?.zone_id === srcId)
    .filter((p) => !dstId || p.destination?.zone_id === dstId)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => ({
      ...p,
      source_zone: zoneName.get(p.source?.zone_id ?? '') ?? p.source?.zone_id,
      destination_zone: zoneName.get(p.destination?.zone_id ?? '') ?? p.destination?.zone_id,
    }));

  return {
    total: filtered.length,
    data: project(filtered.slice(0, params.limit ?? 100), params, POLICY_DEFAULT_FIELDS),
  };
}

export interface CreatePolicyInput {
  name: string;
  action: 'ALLOW' | 'BLOCK' | 'REJECT';
  source_zone: string;
  destination_zone: string;
  source_ips?: string[];
  destination_ips?: string[];
  protocol?: string;
  enabled?: boolean;
  logging?: boolean;
  description?: string;
  extra?: Rec;
}

export async function createFirewallPolicy(client: IUnifiClient, input: CreatePolicyInput) {
  const zones = await fetchZones(client);
  const src = resolveZone(zones, input.source_zone);
  const dst = resolveZone(zones, input.destination_zone);
  const ipVersion = inferIpVersion([...(input.source_ips ?? []), ...(input.destination_ips ?? [])]);

  const body: Rec = {
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    action: input.action,
    enabled: input.enabled ?? true,
    logging: input.logging ?? false,
    protocol: input.protocol ?? 'all',
    ip_version: ipVersion,
    create_allow_respond: false,
    connection_state_type: 'ALL',
    connection_states: [],
    icmp_typename: 'ANY',
    icmp_v6_typename: 'ANY',
    match_ip_sec: false,
    match_opposite_protocol: false,
    schedule: { mode: 'ALWAYS', repeat_on_days: [], time_all_day: false },
    source: buildEndpoint(src._id, input.source_ips),
    destination: buildEndpoint(dst._id, input.destination_ips),
    ...(input.extra ?? {}),
  };

  toolLogger.info(
    `create_firewall_policy: creating "${input.name}" ${input.action} ${src.name} -> ${dst.name}`
  );
  const created = await client.v2post<Policy>('firewall-policies', body);
  toolLogger.info(`create_firewall_policy: created _id=${created._id} index=${created.index}`);

  // Policies are evaluated by ascending index within a zone pair. Surface any enabled policy
  // with a different action that runs first, since it may stop this one from ever matching.
  const policies = await fetchPolicies(client);
  const createdIndex = created.index ?? Number.POSITIVE_INFINITY;
  const evaluatedAfter = policies
    .filter(
      (p) =>
        p._id !== created._id &&
        p.enabled !== false &&
        p.source?.zone_id === (created.source?.zone_id ?? src._id) &&
        p.destination?.zone_id === (created.destination?.zone_id ?? dst._id) &&
        p.action !== (created.action ?? input.action) &&
        (p.index ?? 0) < createdIndex
    )
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(({ _id, name, action, index }) => ({ _id, name, action, index }));

  return { policy: created, evaluated_after: evaluatedAfter };
}

export async function updateFirewallPolicy(client: IUnifiClient, id: string, updates: Rec) {
  toolLogger.info(`update_firewall_policy: updating ${id}`);
  const current = (await fetchPolicies(client)).find((p) => p._id === id);
  if (!current) throw new Error(`Firewall policy not found: ${id}`);
  const result = await client.v2put<Policy>(`firewall-policies/${id}`, { ...current, ...updates });
  toolLogger.info(`update_firewall_policy: updated ${id}`);
  return result;
}

export async function deleteFirewallPolicy(client: IUnifiClient, id: string) {
  toolLogger.info(`delete_firewall_policy: deleting ${id}`);
  await client.v2delete(`firewall-policies/${id}`);
  toolLogger.info(`delete_firewall_policy: deleted ${id}`);
  return { success: true, id };
}

// --- MCP registration ---

const limitSchema = z.number().int().min(1).max(500).default(100).optional();
const zoneRef = z
  .string()
  .describe('Zone id, name or zone_key (e.g. "external", "internal", "gateway")');
const ipList = z.array(z.string().min(1)).optional();

export function registerPolicyTools(server: McpServer, client: IUnifiClient): void {
  server.tool(
    'list_firewall_zones',
    'List zone-based firewall zones (Internal, External, Gateway, Vpn, Hotspot, Dmz, plus custom zones) with their ids.',
    {},
    async () => {
      try {
        return toolResult(await listFirewallZones(client));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    'list_firewall_policies',
    'List zone-based firewall policies, sorted by evaluation order (index). Predefined (system) policies are hidden unless include_predefined is true. Optionally filter by source/destination zone.',
    {
      include_predefined: z.boolean().optional(),
      source_zone: zoneRef.optional(),
      destination_zone: zoneRef.optional(),
      limit: limitSchema,
      ...projectionSchema,
    },
    async (p) => {
      try {
        return toolResult(await listFirewallPolicies(client, p));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    'create_firewall_policy',
    'Create a zone-based firewall policy (use this instead of create_firewall_rule on sites using zone-based firewall). Matches any port; IPs are optional per side. Returns the created policy plus evaluated_after: enabled policies with a different action that run earlier on the same zone pair and may shadow it.',
    {
      name: z.string().min(1),
      action: z.enum(['ALLOW', 'BLOCK', 'REJECT']),
      source_zone: zoneRef,
      destination_zone: zoneRef,
      source_ips: ipList.describe('Source IPs/CIDRs; omit to match any source'),
      destination_ips: ipList.describe('Destination IPs/CIDRs; omit to match any destination'),
      protocol: z
        .string()
        .optional()
        .describe('Default "all"; e.g. "tcp", "udp", "tcp_udp", "icmp"'),
      enabled: z.boolean().optional(),
      logging: z.boolean().optional(),
      description: z.string().optional(),
      extra: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Raw policy fields merged last, for options not covered above'),
    },
    async (p) => {
      try {
        return toolResult(await createFirewallPolicy(client, p));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    'update_firewall_policy',
    'Update a zone-based firewall policy by _id. Only provide fields to change; they are merged over the current policy.',
    { id: z.string(), updates: z.record(z.string(), z.unknown()) },
    async ({ id, updates }) => {
      try {
        return toolResult(await updateFirewallPolicy(client, id, updates));
      } catch (e) {
        return toolError(e);
      }
    }
  );

  server.tool(
    'delete_firewall_policy',
    'Delete a zone-based firewall policy by _id.',
    { id: z.string() },
    async ({ id }) => {
      try {
        return toolResult(await deleteFirewallPolicy(client, id));
      } catch (e) {
        return toolError(e);
      }
    }
  );
}
