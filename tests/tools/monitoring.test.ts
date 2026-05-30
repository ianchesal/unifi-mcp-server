// tests/tools/monitoring.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getSiteStats, getDeviceHealth } from '../../src/tools/monitoring.js';
import type { IUnifiClient } from '../../src/unifi/client.js';

function makeClient(overrides: Partial<IUnifiClient> = {}): IUnifiClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    getOne: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), cmd: vi.fn(),
    v2get: vi.fn(), v2getOne: vi.fn(), v2post: vi.fn(), v2put: vi.fn(), v2delete: vi.fn(),
    ...overrides,
  } as unknown as IUnifiClient;
}

describe('getSiteStats', () => {
  it('fetches health stats', async () => {
    const health = [{ subsystem: 'wan', status: 'ok', num_sta: 42 }];
    const client = makeClient({ get: vi.fn().mockResolvedValue(health) });
    const result = await getSiteStats(client);
    expect(client.get).toHaveBeenCalledWith('stat/health');
    expect(result).toEqual(health);
  });
});

describe('getDeviceHealth', () => {
  it('fetches device list', async () => {
    const devices = [{ _id: 'd1', name: 'UDM Pro', state: 1, uptime: 123456 }];
    const client = makeClient({ get: vi.fn().mockResolvedValue(devices) });
    const result = await getDeviceHealth(client);
    expect(client.get).toHaveBeenCalledWith('stat/device');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('UDM Pro');
  });
});
