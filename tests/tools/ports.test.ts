// tests/tools/ports.test.ts
import { describe, it, expect, vi } from 'vitest';
import { listPortForwards, createPortForward, updatePortForward, deletePortForward } from '../../src/tools/ports.js';
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

describe('listPortForwards', () => {
  it('queries rest/portforward', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ _id: '1', name: 'ssh' }]) });
    const result = await listPortForwards(client, {});
    expect(client.get).toHaveBeenCalledWith('rest/portforward');
    expect(result.total).toBe(1);
  });
});

describe('updatePortForward', () => {
  it('read-before-write', async () => {
    const current = { _id: 'pf-id', name: 'ssh', dst_port: '22' };
    const client = makeClient({
      get: vi.fn().mockResolvedValue([current]),
      put: vi.fn().mockResolvedValue([{ ...current, dst_port: '2222' }]),
    });
    const result = await updatePortForward(client, 'pf-id', { dst_port: '2222' });
    expect(result.dst_port).toBe('2222');
    expect(client.put).toHaveBeenCalledWith('rest/portforward/pf-id', { ...current, dst_port: '2222' });
  });
});

describe('deletePortForward', () => {
  it('calls delete with correct path', async () => {
    const client = makeClient();
    await deletePortForward(client, 'pf-id');
    expect(client.delete).toHaveBeenCalledWith('rest/portforward/pf-id');
  });
});
