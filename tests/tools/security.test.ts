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
  const threat = {
    id: 'e1',
    timestamp: 1791790997966,
    category: 'SECURITY',
    subcategory: 'SECURITY_INTRUSION_PREVENTION',
    key: 'THREAT_BLOCKED_V3',
    event: 'THREAT_BLOCKED',
    severity: 'HIGH',
    title_raw: 'Threat Detected and Blocked',
    message_raw: 'A network intrusion attempt from {SRC_IP} to {DST_IP} has been detected and blocked.',
    parameters: { SRC_IP: { id: '45.133.173.43', name: '45.133.173.43' }, DST_IP: { id: '192.168.1.26' } },
  };
  const roam = { id: 'e2', timestamp: 1791790000000, key: 'CLIENT_ROAMED_2', message_raw: '{CLIENT} roamed', parameters: {} };

  it('posts to the v2 system-log with a time window', async () => {
    const v2post = vi.fn().mockResolvedValue({ data: [threat], total_element_count: 1 });
    const client = makeClient({ v2post });
    const result = await getNetworkEvents(client, { within: 2, limit: 10 });
    const [path, body] = v2post.mock.calls[0];
    expect(path).toBe('system-log/all');
    expect(body.pageSize).toBe(10);
    expect(body.timestampTo - body.timestampFrom).toBe(2 * 3_600_000);
    expect(body.categories).toBeUndefined();
    expect(result.total).toBe(1);
  });

  it('passes category and severity filters to the API', async () => {
    const v2post = vi.fn().mockResolvedValue({ data: [], total_element_count: 0 });
    await getNetworkEvents(makeClient({ v2post }), { category: ['SECURITY'], severity: ['HIGH'] });
    expect(v2post.mock.calls[0][1]).toMatchObject({ categories: ['SECURITY'], severities: ['HIGH'] });
  });

  it('returns compact events with rendered messages by default', async () => {
    const v2post = vi.fn().mockResolvedValue({ data: [threat], total_element_count: 1 });
    const result = await getNetworkEvents(makeClient({ v2post }), {});
    expect(result.data[0]).toEqual({
      id: 'e1',
      time: new Date(1791790997966).toISOString(),
      category: 'SECURITY',
      subcategory: 'SECURITY_INTRUSION_PREVENTION',
      key: 'THREAT_BLOCKED_V3',
      severity: 'HIGH',
      title: 'Threat Detected and Blocked',
      message: 'A network intrusion attempt from 45.133.173.43 to 192.168.1.26 has been detected and blocked.',
    });
  });

  it('leaves unknown template placeholders intact', async () => {
    const v2post = vi.fn().mockResolvedValue({ data: [roam], total_element_count: 1 });
    const result = await getNetworkEvents(makeClient({ v2post }), {});
    expect((result.data[0] as { message: string }).message).toBe('{CLIENT} roamed');
  });

  it('returns raw events when verbose', async () => {
    const v2post = vi.fn().mockResolvedValue({ data: [threat], total_element_count: 1 });
    const result = await getNetworkEvents(makeClient({ v2post }), { verbose: true });
    expect(result.data[0]).toBe(threat);
  });

  it('filters by key substring case-insensitively over a wider scan', async () => {
    const v2post = vi.fn().mockResolvedValue({ data: [threat, roam], total_element_count: 2 });
    const result = await getNetworkEvents(makeClient({ v2post }), { key_filter: 'threat', limit: 5 });
    expect(v2post.mock.calls[0][1].pageSize).toBeGreaterThan(5);
    expect(result.total).toBe(1);
    expect((result.data[0] as { id: string }).id).toBe('e1');
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
