// tests/integration/firewall.integration.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { UnifiClient } from '../../src/unifi/client.js';
import { createFirewallGroup, deleteFirewallGroup, listFirewallGroups } from '../../src/tools/firewall.js';

const TEST_PREFIX = 'mcp-test-';
const skip = !process.env.TEST_INTEGRATION;

describe.skipIf(skip)('firewall integration', () => {
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
      await deleteFirewallGroup(client, id).catch(() => {});
    }
  });

  it('creates and lists a firewall group', async () => {
    const name = `${TEST_PREFIX}group-${Date.now()}`;
    const created = await createFirewallGroup(client, {
      name,
      group_type: 'address-group',
      group_members: ['192.168.99.0/24'],
    });
    expect(created._id).toBeTruthy();
    createdIds.push(created._id as string);

    const list = await listFirewallGroups(client, {});
    const found = list.data.find((g) => g._id === created._id);
    expect(found).toBeTruthy();
  });
});
