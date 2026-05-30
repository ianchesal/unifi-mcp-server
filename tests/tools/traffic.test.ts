// tests/tools/traffic.test.ts
import { describe, it, expect, vi } from 'vitest';
import { listTrafficRules, createTrafficRule, updateTrafficRule, deleteTrafficRule } from '../../src/tools/traffic.js';
import type { IUnifiClient } from '../../src/unifi/client.js';

function makeClient(overrides: Partial<IUnifiClient> = {}): IUnifiClient {
  return {
    get: vi.fn(), getOne: vi.fn(), post: vi.fn(), put: vi.fn(),
    delete: vi.fn(), cmd: vi.fn(),
    v2get: vi.fn().mockResolvedValue([]),
    v2getOne: vi.fn().mockResolvedValue({}),
    v2post: vi.fn().mockResolvedValue({}),
    v2put: vi.fn().mockResolvedValue({}),
    v2delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IUnifiClient;
}

describe('listTrafficRules', () => {
  it('returns rules from v2 API with total', async () => {
    const rules = [{ id: '1', description: 'block youtube' }];
    const client = makeClient({ v2get: vi.fn().mockResolvedValue(rules) });
    const result = await listTrafficRules(client, {});
    expect(client.v2get).toHaveBeenCalledWith('trafficrules');
    expect(result.total).toBe(1);
  });
});

describe('updateTrafficRule', () => {
  it('reads current from v2 and puts merged', async () => {
    const current = { id: 'r1', description: 'old', enabled: true };
    const client = makeClient({
      v2get: vi.fn().mockResolvedValue([current]),
      v2put: vi.fn().mockResolvedValue({ ...current, description: 'new' }),
    });
    const result = await updateTrafficRule(client, 'r1', { description: 'new' });
    expect(result.description).toBe('new');
    expect(client.v2put).toHaveBeenCalledWith('trafficrules/r1', { ...current, description: 'new' });
  });
});

describe('deleteTrafficRule', () => {
  it('calls v2delete', async () => {
    const client = makeClient();
    await deleteTrafficRule(client, 'r1');
    expect(client.v2delete).toHaveBeenCalledWith('trafficrules/r1');
  });
});
