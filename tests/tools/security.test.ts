// tests/tools/security.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getThreatEvents, getNetworkEvents, analyzeThreats } from '../../src/tools/security.js';
import type { IUnifiClient } from '../../src/unifi/client.js';

function makeClient(overrides: Partial<IUnifiClient> = {}): IUnifiClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    getOne: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), cmd: vi.fn(),
    v2get: vi.fn(), v2getOne: vi.fn(), v2post: vi.fn(), v2put: vi.fn(), v2delete: vi.fn(),
    ...overrides,
  } as unknown as IUnifiClient;
}

const sampleThreatEvents = [
  { _id: '1', src_ip: '1.2.3.4', category: 'malware', action: 'blocked', timestamp: 1000000 },
  { _id: '2', src_ip: '1.2.3.4', category: 'malware', action: 'blocked', timestamp: 1000001 },
  { _id: '3', src_ip: '5.6.7.8', category: 'exploit', action: 'alerted', timestamp: 1000002 },
  { _id: '4', src_ip: '9.10.11.12', category: 'malware', action: 'blocked', timestamp: 1000003 },
];

describe('getThreatEvents', () => {
  it('fetches IPS events', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue(sampleThreatEvents) });
    const result = await getThreatEvents(client, {});
    expect(client.get).toHaveBeenCalledWith('stat/ips/event');
    expect(result.total).toBe(4);
  });

  it('filters by severity when provided', async () => {
    const events = [
      { ...sampleThreatEvents[0], severity: 3 },
      { ...sampleThreatEvents[1], severity: 1 },
    ];
    const client = makeClient({ get: vi.fn().mockResolvedValue(events) });
    const result = await getThreatEvents(client, { min_severity: 2 });
    expect(result.total).toBe(1);
  });
});

describe('getNetworkEvents', () => {
  it('fetches network events', async () => {
    const events = [{ _id: 'e1', key: 'EVT_WC_Connected', msg: 'device joined' }];
    const client = makeClient({ get: vi.fn().mockResolvedValue(events) });
    const result = await getNetworkEvents(client, {});
    expect(client.get).toHaveBeenCalledWith('stat/event');
    expect(result.total).toBe(1);
  });
});

describe('analyzeThreats', () => {
  it('returns top IPs, categories, blocked/alerted counts, and raw events', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue(sampleThreatEvents) });
    const result = await analyzeThreats(client, {});

    expect(result.blocked_count).toBe(3);
    expect(result.alerted_count).toBe(1);
    expect(result.top_source_ips[0].ip).toBe('1.2.3.4');
    expect(result.top_source_ips[0].count).toBe(2);
    expect(result.top_categories[0].category).toBe('malware');
    expect(result.top_categories[0].count).toBe(3);
    expect(result.events).toHaveLength(4);
  });
});
