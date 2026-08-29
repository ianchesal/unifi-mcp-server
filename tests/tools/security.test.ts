// tests/tools/security.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getNetworkEvents, getRogueAps } from '../../src/tools/security.js';
import type { IUnifiClient } from '../../src/unifi/client.js';

function makeClient(overrides: Partial<IUnifiClient> = {}): IUnifiClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    getOne: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), cmd: vi.fn(),
    v2get: vi.fn(), v2getOne: vi.fn(), v2post: vi.fn(), v2put: vi.fn(), v2delete: vi.fn(),
    ...overrides,
  } as unknown as IUnifiClient;
}

describe('getNetworkEvents', () => {
  it('fetches network alarms', async () => {
    const events = [{ _id: 'e1', key: 'EVT_WC_Connected', msg: 'device joined' }];
    const client = makeClient({ get: vi.fn().mockResolvedValue(events) });
    const result = await getNetworkEvents(client, {});
    expect(client.get).toHaveBeenCalledWith('list/alarm');
    expect(result.total).toBe(1);
  });

  it('filters by archived status', async () => {
    const events = [
      { _id: 'e1', key: 'EVT_IPS_IpsAlert', archived: false },
      { _id: 'e2', key: 'EVT_IPS_IpsAlert', archived: true },
    ];
    const client = makeClient({ get: vi.fn().mockResolvedValue(events) });
    const result = await getNetworkEvents(client, { archived: false });
    expect(result.total).toBe(1);
    expect((result.data[0] as { _id: string })._id).toBe('e1');
  });
});

describe('getRogueAps', () => {
  it('fetches rogue/neighboring access points', async () => {
    const aps = [{ bssid: 'aa:bb:cc:dd:ee:ff', essid: 'neighbor-wifi' }];
    const client = makeClient({ post: vi.fn().mockResolvedValue(aps) });
    const result = await getRogueAps(client, {});
    expect(client.post).toHaveBeenCalledWith('stat/rogueap', {});
    expect(result.total).toBe(1);
  });

  it('passes within param when provided', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue([]) });
    await getRogueAps(client, { within: 24 });
    expect(client.post).toHaveBeenCalledWith('stat/rogueap', { within: 24 });
  });
});
