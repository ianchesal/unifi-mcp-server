import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnifiClient } from '../../src/unifi/client.js';

const baseConfig = {
  host: '192.168.1.1',
  apiKey: 'test-key',
  site: 'default',
  verifyTls: false,
  timeoutMs: 5000,
};

function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: () => null },
    json: async () => response,
  });
}

describe('UnifiClient', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('get() strips data envelope and returns array', async () => {
    global.fetch = mockFetch({ meta: { rc: 'ok' }, data: [{ _id: '1', name: 'rule1' }] });
    const client = new UnifiClient(baseConfig);
    const result = await client.get('rest/firewallrule');
    expect(result).toEqual([{ _id: '1', name: 'rule1' }]);
  });

  it('get() throws when meta.rc is not ok', async () => {
    global.fetch = mockFetch({ meta: { rc: 'error', msg: 'not found' }, data: [] });
    const client = new UnifiClient(baseConfig);
    await expect(client.get('rest/firewallrule')).rejects.toThrow('not found');
  });

  it('get() sends X-API-Key header', async () => {
    const fetchMock = mockFetch({ meta: { rc: 'ok' }, data: [] });
    global.fetch = fetchMock;
    const client = new UnifiClient(baseConfig);
    await client.get('rest/firewallrule');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('test-key');
  });

  it('get() throws on HTTP error', async () => {
    global.fetch = mockFetch({ error: 'unauthorized' }, 401);
    const client = new UnifiClient(baseConfig);
    await expect(client.get('rest/firewallrule')).rejects.toThrow('401');
  });

  it('get() throws timeout error on AbortError', async () => {
    global.fetch = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const client = new UnifiClient(baseConfig);
    await expect(client.get('rest/firewallrule')).rejects.toThrow('timed out');
  });

  it('post() sends body and returns first data item', async () => {
    const fetchMock = mockFetch({ meta: { rc: 'ok' }, data: [{ _id: 'new-id' }] });
    global.fetch = fetchMock;
    const client = new UnifiClient(baseConfig);
    const result = await client.post('rest/firewallrule', { name: 'new-rule' });
    expect(result).toEqual([{ _id: 'new-id' }]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'new-rule' });
  });

  it('delete() sends DELETE request', async () => {
    const fetchMock = mockFetch({ meta: { rc: 'ok' }, data: [] });
    global.fetch = fetchMock;
    const client = new UnifiClient(baseConfig);
    await client.delete('rest/firewallrule/abc');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
  });

  it('v2get() returns array from v2 API', async () => {
    global.fetch = mockFetch([{ id: '1', description: 'rule' }]);
    const client = new UnifiClient(baseConfig);
    const result = await client.v2get('trafficrules');
    expect(result).toEqual([{ id: '1', description: 'rule' }]);
  });

  it('uses correct v1 base URL', async () => {
    const fetchMock = mockFetch({ meta: { rc: 'ok' }, data: [] });
    global.fetch = fetchMock;
    const client = new UnifiClient(baseConfig);
    await client.get('rest/firewallrule');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://192.168.1.1/proxy/network/api/s/default/rest/firewallrule');
  });

  it('uses correct v2 base URL', async () => {
    const fetchMock = mockFetch([]);
    global.fetch = fetchMock;
    const client = new UnifiClient(baseConfig);
    await client.v2get('trafficrules');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://192.168.1.1/proxy/network/v2/api/site/default/trafficrules');
  });

  it('v2delete() does not throw on 204 No Content', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: 'No Content',
      headers: { get: () => null },
      json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
    });
    const client = new UnifiClient(baseConfig);
    await expect(client.v2delete('trafficrules/r1')).resolves.toBeUndefined();
  });
});
