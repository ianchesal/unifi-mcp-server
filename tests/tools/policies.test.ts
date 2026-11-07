// tests/tools/policies.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  listFirewallZones,
  listFirewallPolicies,
  createFirewallPolicy,
  updateFirewallPolicy,
  deleteFirewallPolicy,
} from '../../src/tools/policies.js';
import type { IUnifiClient } from '../../src/unifi/client.js';

const ZONES = [
  { _id: 'z-int', name: 'Internal', zone_key: 'internal', network_ids: ['n1'] },
  { _id: 'z-ext', name: 'External', zone_key: 'external', network_ids: ['w1', 'w2'] },
  { _id: 'z-gw', name: 'Gateway', zone_key: 'gateway', network_ids: [] },
];

const POLICIES = [
  {
    _id: 'p-pf',
    name: 'Allow Port Forward Plex',
    action: 'ALLOW',
    predefined: true,
    enabled: true,
    index: 30001,
    source: { zone_id: 'z-ext' },
    destination: { zone_id: 'z-int' },
  },
  {
    _id: 'p-user',
    name: 'Minecraft Malware',
    action: 'REJECT',
    predefined: false,
    enabled: true,
    index: 40000,
    source: { zone_id: 'z-int' },
    destination: { zone_id: 'z-ext' },
  },
];

function makeClient(overrides: Partial<IUnifiClient> = {}): IUnifiClient {
  return {
    get: vi.fn(), getOne: vi.fn(), post: vi.fn(), put: vi.fn(),
    delete: vi.fn(), cmd: vi.fn(),
    v2get: vi.fn(async (path: string) => {
      if (path === 'firewall/zone') return ZONES;
      if (path === 'firewall-policies') return POLICIES;
      return [];
    }),
    v2getOne: vi.fn().mockResolvedValue({}),
    v2post: vi.fn(async (_path: string, body: Record<string, unknown>) => ({
      _id: 'p-new',
      index: 10000,
      ...body,
    })),
    v2put: vi.fn(async (_path: string, body: unknown) => body),
    v2delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IUnifiClient;
}

describe('listFirewallZones', () => {
  it('returns compact zones from the v2 API', async () => {
    const client = makeClient();
    const result = await listFirewallZones(client);
    expect(client.v2get).toHaveBeenCalledWith('firewall/zone');
    expect(result.total).toBe(3);
    expect(result.data[1]).toEqual({ _id: 'z-ext', name: 'External', zone_key: 'external', network_ids: ['w1', 'w2'] });
  });
});

describe('listFirewallPolicies', () => {
  it('hides predefined policies by default and annotates zone names', async () => {
    const result = await listFirewallPolicies(makeClient(), {});
    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      _id: 'p-user',
      source_zone: 'Internal',
      destination_zone: 'External',
    });
  });

  it('includes predefined policies on request and sorts by index', async () => {
    const result = await listFirewallPolicies(makeClient(), { include_predefined: true });
    expect(result.data.map((p) => p._id)).toEqual(['p-pf', 'p-user']);
  });

  it('filters by zone pair, accepting zone names or keys', async () => {
    const result = await listFirewallPolicies(makeClient(), {
      include_predefined: true,
      source_zone: 'external',
      destination_zone: 'Internal',
    });
    expect(result.data.map((p) => p._id)).toEqual(['p-pf']);
  });
});

describe('createFirewallPolicy', () => {
  it('builds a full policy body from simple inputs, resolving zone keys to ids', async () => {
    const client = makeClient();
    await createFirewallPolicy(client, {
      name: 'Block 85.11.167.7',
      action: 'BLOCK',
      source_zone: 'external',
      destination_zone: 'internal',
      source_ips: ['85.11.167.7'],
    });
    const [path, body] = vi.mocked(client.v2post).mock.calls[0] as [string, Record<string, any>];
    expect(path).toBe('firewall-policies');
    expect(body).toMatchObject({
      name: 'Block 85.11.167.7',
      action: 'BLOCK',
      enabled: true,
      logging: false,
      protocol: 'all',
      ip_version: 'IPV4',
      create_allow_respond: false,
      connection_state_type: 'ALL',
      schedule: { mode: 'ALWAYS' },
      source: {
        zone_id: 'z-ext',
        matching_target: 'IP',
        matching_target_type: 'SPECIFIC',
        ips: ['85.11.167.7'],
        match_opposite_ips: false,
        port_matching_type: 'ANY',
      },
      destination: { zone_id: 'z-int', matching_target: 'ANY', port_matching_type: 'ANY' },
    });
    expect(body.destination.ips).toBeUndefined();
  });

  it('uses ip_version BOTH when no IPs are given', async () => {
    const client = makeClient();
    await createFirewallPolicy(client, {
      name: 'x', action: 'BLOCK', source_zone: 'z-int', destination_zone: 'z-gw',
    });
    const body = vi.mocked(client.v2post).mock.calls[0][1] as Record<string, unknown>;
    expect(body.ip_version).toBe('BOTH');
  });

  it('rejects mixed IPv4 and IPv6 addresses', async () => {
    await expect(
      createFirewallPolicy(makeClient(), {
        name: 'x', action: 'BLOCK', source_zone: 'external', destination_zone: 'internal',
        source_ips: ['1.2.3.4', '2001:db8::1'],
      })
    ).rejects.toThrow(/mix/i);
  });

  it('rejects an unknown zone', async () => {
    await expect(
      createFirewallPolicy(makeClient(), {
        name: 'x', action: 'BLOCK', source_zone: 'mars', destination_zone: 'internal',
      })
    ).rejects.toThrow(/zone not found: mars/i);
  });

  it('lets extra fields override the generated body', async () => {
    const client = makeClient();
    await createFirewallPolicy(client, {
      name: 'x', action: 'BLOCK', source_zone: 'external', destination_zone: 'internal',
      extra: { logging: true },
    });
    const body = vi.mocked(client.v2post).mock.calls[0][1] as Record<string, unknown>;
    expect(body.logging).toBe(true);
  });

  it('warns when an enabled policy with a different action runs earlier on the same zone pair', async () => {
    const client = makeClient({
      v2post: vi.fn().mockResolvedValue({
        _id: 'p-new', index: 31000, action: 'BLOCK',
        source: { zone_id: 'z-ext' }, destination: { zone_id: 'z-int' },
      }),
    });
    const result = await createFirewallPolicy(client, {
      name: 'x', action: 'BLOCK', source_zone: 'external', destination_zone: 'internal',
    });
    expect(result.evaluated_after).toEqual([
      { _id: 'p-pf', name: 'Allow Port Forward Plex', action: 'ALLOW', index: 30001 },
    ]);
  });

  it('reports no earlier conflicting policies when placed first', async () => {
    const result = await createFirewallPolicy(makeClient(), {
      name: 'x', action: 'BLOCK', source_zone: 'external', destination_zone: 'internal',
    });
    expect(result.policy._id).toBe('p-new');
    expect(result.evaluated_after).toEqual([]);
  });
});

describe('updateFirewallPolicy', () => {
  it('merges updates over the current policy and PUTs it', async () => {
    const client = makeClient();
    await updateFirewallPolicy(client, 'p-user', { enabled: false });
    expect(client.v2put).toHaveBeenCalledWith('firewall-policies/p-user', { ...POLICIES[1], enabled: false });
  });

  it('throws when the policy does not exist', async () => {
    await expect(updateFirewallPolicy(makeClient(), 'nope', {})).rejects.toThrow(/not found: nope/);
  });
});

describe('deleteFirewallPolicy', () => {
  it('calls v2delete', async () => {
    const client = makeClient();
    const result = await deleteFirewallPolicy(client, 'p-user');
    expect(client.v2delete).toHaveBeenCalledWith('firewall-policies/p-user');
    expect(result).toEqual({ success: true, id: 'p-user' });
  });
});
