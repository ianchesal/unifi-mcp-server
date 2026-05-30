// tests/tools/security.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getNetworkEvents } from '../../src/tools/security.js';
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
  it('fetches network events', async () => {
    const events = [{ _id: 'e1', key: 'EVT_WC_Connected', msg: 'device joined' }];
    const client = makeClient({ get: vi.fn().mockResolvedValue(events) });
    const result = await getNetworkEvents(client, {});
    expect(client.get).toHaveBeenCalledWith('stat/event');
    expect(result.total).toBe(1);
  });
});
