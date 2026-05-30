// tests/tools/firewall.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  listFirewallRules, getFirewallRule, createFirewallRule,
  updateFirewallRule, deleteFirewallRule,
  listFirewallGroups, createFirewallGroup, updateFirewallGroup, deleteFirewallGroup,
} from '../../src/tools/firewall.js';
import type { IUnifiClient } from '../../src/unifi/client.js';

function makeClient(overrides: Partial<IUnifiClient> = {}): IUnifiClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    getOne: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue([{}]),
    put: vi.fn().mockResolvedValue([{}]),
    delete: vi.fn().mockResolvedValue(undefined),
    cmd: vi.fn(),
    v2get: vi.fn(), v2getOne: vi.fn(), v2post: vi.fn(), v2put: vi.fn(), v2delete: vi.fn(),
    ...overrides,
  } as unknown as IUnifiClient;
}

describe('listFirewallRules', () => {
  it('returns all rules with total', async () => {
    const rules = [
      { _id: '1', name: 'r1', ruleset: 'WAN_IN' },
      { _id: '2', name: 'r2', ruleset: 'LAN_IN' },
    ];
    const client = makeClient({ get: vi.fn().mockResolvedValue(rules) });
    const result = await listFirewallRules(client, {});
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
  });

  it('filters by ruleset', async () => {
    const rules = [
      { _id: '1', name: 'r1', ruleset: 'WAN_IN' },
      { _id: '2', name: 'r2', ruleset: 'LAN_IN' },
    ];
    const client = makeClient({ get: vi.fn().mockResolvedValue(rules) });
    const result = await listFirewallRules(client, { ruleset: 'WAN_IN' });
    expect(result.total).toBe(1);
    expect(result.data[0]._id).toBe('1');
  });

  it('respects limit', async () => {
    const rules = Array.from({ length: 10 }, (_, i) => ({ _id: String(i), name: `r${i}`, ruleset: 'WAN_IN' }));
    const client = makeClient({ get: vi.fn().mockResolvedValue(rules) });
    const result = await listFirewallRules(client, { limit: 3 });
    expect(result.total).toBe(10);
    expect(result.data).toHaveLength(3);
  });
});

describe('getFirewallRule', () => {
  it('fetches by id', async () => {
    const rule = { _id: 'abc', name: 'r1' };
    const client = makeClient({ get: vi.fn().mockResolvedValue([rule]) });
    const result = await getFirewallRule(client, 'abc');
    expect(result._id).toBe('abc');
    expect(client.get).toHaveBeenCalledWith('rest/firewallrule/abc');
  });
});

describe('createFirewallRule', () => {
  it('posts rule and returns created object', async () => {
    const created = { _id: 'new-id', name: 'my-rule' };
    const client = makeClient({ post: vi.fn().mockResolvedValue([created]) });
    const result = await createFirewallRule(client, { name: 'my-rule', ruleset: 'WAN_IN', action: 'drop' });
    expect(result._id).toBe('new-id');
    expect(client.post).toHaveBeenCalledWith('rest/firewallrule', expect.objectContaining({ name: 'my-rule' }));
  });
});

describe('updateFirewallRule', () => {
  it('reads current, merges, and puts', async () => {
    const current = { _id: 'abc', name: 'old-name', action: 'drop', enabled: true };
    const updated = [{ ...current, name: 'new-name' }];
    const client = makeClient({
      get: vi.fn().mockResolvedValue([current]),
      put: vi.fn().mockResolvedValue(updated),
    });
    const result = await updateFirewallRule(client, 'abc', { name: 'new-name' });
    expect(result.name).toBe('new-name');
    expect(client.put).toHaveBeenCalledWith('rest/firewallrule/abc', { ...current, name: 'new-name' });
  });
});

describe('deleteFirewallRule', () => {
  it('calls delete with correct path', async () => {
    const client = makeClient();
    await deleteFirewallRule(client, 'abc');
    expect(client.delete).toHaveBeenCalledWith('rest/firewallrule/abc');
  });
});

describe('listFirewallGroups', () => {
  it('returns groups with total', async () => {
    const groups = [{ _id: '1', name: 'g1' }, { _id: '2', name: 'g2' }];
    const client = makeClient({ get: vi.fn().mockResolvedValue(groups) });
    const result = await listFirewallGroups(client, {});
    expect(result.total).toBe(2);
  });
});

describe('deleteFirewallGroup', () => {
  it('calls delete with correct path', async () => {
    const client = makeClient();
    await deleteFirewallGroup(client, 'grp-id');
    expect(client.delete).toHaveBeenCalledWith('rest/firewallgroup/grp-id');
  });
});
