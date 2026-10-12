// tests/tools/clients.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  listClients, getClient, blockClient, unblockClient, setClientFixedIp, removeClientFixedIp,
} from '../../src/tools/clients.js';
import type { IUnifiClient } from '../../src/unifi/client.js';

function makeClient(overrides: Partial<IUnifiClient> = {}): IUnifiClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue([]),
    put: vi.fn().mockResolvedValue([{}]),
    delete: vi.fn().mockResolvedValue(undefined),
    cmd: vi.fn().mockResolvedValue(undefined),
    getOne: vi.fn(),
    v2get: vi.fn(), v2getOne: vi.fn(), v2post: vi.fn(), v2put: vi.fn(), v2delete: vi.fn(),
    ...overrides,
  } as unknown as IUnifiClient;
}

describe('listClients', () => {
  it('queries active clients by default', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ mac: 'aa:bb:cc:dd:ee:ff' }]) });
    const result = await listClients(client, {});
    expect(client.get).toHaveBeenCalledWith('stat/sta');
    expect(result.total).toBe(1);
  });

  it('queries alluser endpoint when include_offline is true', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([]) });
    await listClients(client, { include_offline: true });
    expect(client.get).toHaveBeenCalledWith('stat/alluser');
  });

  const raw = { mac: 'aa:bb:cc:dd:ee:ff', name: 'Laptop', ip: '192.168.1.5', rx_bytes: 1, anomalies: 0 };

  it('returns a compact summary by default', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([raw]) });
    const result = await listClients(client, {});
    expect(result.data[0]).toEqual({ mac: 'aa:bb:cc:dd:ee:ff', name: 'Laptop', ip: '192.168.1.5' });
  });

  it('keeps last_ip in the summary for offline clients, which have no ip', async () => {
    const offline = { mac: 'aa:bb:cc:dd:ee:01', hostname: 'printer', last_ip: '192.168.1.175', rx_bytes: 1 };
    const client = makeClient({ get: vi.fn().mockResolvedValue([offline]) });
    const result = await listClients(client, { include_offline: true });
    expect(result.data[0]).toEqual({ mac: 'aa:bb:cc:dd:ee:01', hostname: 'printer', last_ip: '192.168.1.175' });
  });

  it('returns only requested fields', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([raw]) });
    const result = await listClients(client, { fields: ['mac', 'rx_bytes', 'missing'] });
    expect(result.data[0]).toEqual({ mac: 'aa:bb:cc:dd:ee:ff', rx_bytes: 1 });
  });

  it('returns full objects when verbose', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([raw]) });
    const result = await listClients(client, { verbose: true });
    expect(result.data[0]).toEqual(raw);
  });
});

describe('blockClient', () => {
  it('calls stamgr cmd with block-sta', async () => {
    const client = makeClient();
    await blockClient(client, 'aa:bb:cc:dd:ee:ff');
    expect(client.cmd).toHaveBeenCalledWith('stamgr', { cmd: 'block-sta', mac: 'aa:bb:cc:dd:ee:ff' });
  });
});

describe('unblockClient', () => {
  it('calls stamgr cmd with unblock-sta', async () => {
    const client = makeClient();
    await unblockClient(client, 'aa:bb:cc:dd:ee:ff');
    expect(client.cmd).toHaveBeenCalledWith('stamgr', { cmd: 'unblock-sta', mac: 'aa:bb:cc:dd:ee:ff' });
  });
});

describe('setClientFixedIp', () => {
  it('finds user by mac and puts fixed IP', async () => {
    const user = { _id: 'user-id', mac: 'aa:bb:cc:dd:ee:ff', name: 'MyDevice' };
    const client = makeClient({ get: vi.fn().mockResolvedValue([user]) });
    await setClientFixedIp(client, 'aa:bb:cc:dd:ee:ff', '192.168.1.50');
    expect(client.put).toHaveBeenCalledWith('rest/user/user-id', {
      ...user, use_fixedip: true, fixed_ip: '192.168.1.50',
    });
  });

  it('throws if mac not found', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([]) });
    await expect(setClientFixedIp(client, 'aa:bb:cc:dd:ee:ff', '192.168.1.50')).rejects.toThrow('not found');
  });
});

describe('removeClientFixedIp', () => {
  it('clears use_fixedip and fixed_ip', async () => {
    const user = { _id: 'user-id', mac: 'aa:bb:cc:dd:ee:ff', use_fixedip: true, fixed_ip: '192.168.1.50' };
    const client = makeClient({ get: vi.fn().mockResolvedValue([user]) });
    await removeClientFixedIp(client, 'aa:bb:cc:dd:ee:ff');
    expect(client.put).toHaveBeenCalledWith('rest/user/user-id', {
      ...user, use_fixedip: false, fixed_ip: '',
    });
  });
});
