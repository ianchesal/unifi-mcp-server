// tests/integration/policies.integration.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { UnifiClient } from '../../src/unifi/client.js';
import {
  createFirewallPolicy,
  deleteFirewallPolicy,
  listFirewallPolicies,
  listFirewallZones,
  updateFirewallPolicy,
} from '../../src/tools/policies.js';

const TEST_PREFIX = 'mcp-test-';
const skip = !process.env.TEST_INTEGRATION;

describe.skipIf(skip)('zone-based firewall policy integration', () => {
  const client = new UnifiClient({
    host: process.env.UNIFI_HOST!,
    apiKey: process.env.UNIFI_API_KEY!,
    site: process.env.UNIFI_SITE ?? 'default',
    verifyTls: process.env.UNIFI_VERIFY_TLS === 'true',
    timeoutMs: 10000,
  });

  const createdIds: string[] = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteFirewallPolicy(client, id).catch(() => {});
    }
  });

  it('lists zones including internal and external', async () => {
    const zones = await listFirewallZones(client);
    const keys = zones.data.map((z) => z.zone_key);
    expect(keys).toContain('internal');
    expect(keys).toContain('external');
  });

  it('creates, updates, lists and deletes a disabled policy', async () => {
    const name = `${TEST_PREFIX}policy-${Date.now()}`;
    // Disabled, and targets TEST-NET-1 (RFC 5737), so it can never affect real traffic
    const { policy } = await createFirewallPolicy(client, {
      name,
      action: 'BLOCK',
      source_zone: 'external',
      destination_zone: 'internal',
      source_ips: ['192.0.2.1'],
      enabled: false,
    });
    expect(policy._id).toBeTruthy();
    createdIds.push(policy._id);
    expect(policy.enabled).toBe(false);

    const updated = await updateFirewallPolicy(client, policy._id, { logging: true });
    expect(updated.logging).toBe(true);

    const list = await listFirewallPolicies(client, { fields: ['_id', 'name'] });
    expect(list.data.find((p) => p._id === policy._id)).toBeTruthy();

    await deleteFirewallPolicy(client, policy._id);
    createdIds.pop();
    const after = await listFirewallPolicies(client, { fields: ['_id'] });
    expect(after.data.find((p) => p._id === policy._id)).toBeFalsy();
  });
});
