// tests/tools/network.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  listNetworks, getNetwork, createNetwork, updateNetwork, deleteNetwork,
} from '../../src/tools/network.js';
import type { IUnifiClient } from '../../src/unifi/client.js';

function makeClient(overrides: Partial<IUnifiClient> = {}): IUnifiClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue([{}]),
    put: vi.fn().mockResolvedValue([{}]),
    delete: vi.fn().mockResolvedValue(undefined),
    getOne: vi.fn(), cmd: vi.fn(),
    v2get: vi.fn(), v2getOne: vi.fn(), v2post: vi.fn(), v2put: vi.fn(), v2delete: vi.fn(),
    ...overrides,
  } as unknown as IUnifiClient;
}

describe('listNetworks', () => {
  it('returns networks with total', async () => {
    const nets = [{ _id: '1', name: 'IoT', ip_subnet: '10.0.10.0/24' }];
    const client = makeClient({ get: vi.fn().mockResolvedValue(nets) });
    const result = await listNetworks(client, {});
    expect(result.total).toBe(1);
    expect(result.data[0].name).toBe('IoT');
  });
});

describe('deleteNetwork', () => {
  it('deletes when confirm_name matches', async () => {
    const net = { _id: 'net-id', name: 'IoT' };
    const client = makeClient({ get: vi.fn().mockResolvedValue([net]) });
    await deleteNetwork(client, 'net-id', 'IoT');
    expect(client.delete).toHaveBeenCalledWith('rest/networkconf/net-id');
  });

  it('throws when confirm_name does not match', async () => {
    const net = { _id: 'net-id', name: 'IoT' };
    const client = makeClient({ get: vi.fn().mockResolvedValue([net]) });
    await expect(deleteNetwork(client, 'net-id', 'WrongName')).rejects.toThrow("does not match");
  });
});

describe('updateNetwork', () => {
  it('uses read-before-write', async () => {
    const current = { _id: 'net-id', name: 'OldName', ip_subnet: '10.0.10.0/24' };
    const client = makeClient({
      get: vi.fn().mockResolvedValue([current]),
      put: vi.fn().mockResolvedValue([{ ...current, name: 'NewName' }]),
    });
    const result = await updateNetwork(client, 'net-id', { name: 'NewName' });
    expect(result.name).toBe('NewName');
    expect(client.put).toHaveBeenCalledWith('rest/networkconf/net-id', { ...current, name: 'NewName' });
  });
});
