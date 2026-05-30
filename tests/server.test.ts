// tests/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';
import type { IUnifiClient } from '../src/unifi/client.js';
import type { Config } from '../src/config.js';

const config: Config = {
  unifiHost: '192.168.1.1',
  unifiApiKey: 'key',
  mcpSecret: 'test-secret',
  unifiSite: 'default',
  unifiVerifyTls: false,
  unifiRequestTimeoutMs: 5000,
  mcpPort: 3000,
  mcpHost: '0.0.0.0',
  logLevel: 'error',
};

function makeClient(overrides: Partial<IUnifiClient> = {}): IUnifiClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    getOne: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue([]),
    put: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    cmd: vi.fn().mockResolvedValue(undefined),
    v2get: vi.fn().mockResolvedValue([]),
    v2getOne: vi.fn().mockResolvedValue({}),
    v2post: vi.fn().mockResolvedValue({}),
    v2put: vi.fn().mockResolvedValue({}),
    v2delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('GET /health', () => {
  it('returns 200 without auth', async () => {
    const app = createApp(makeClient(), config);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /ready', () => {
  it('returns 200 when UniFi reachable', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ version: '10.4.56' }]) });
    const app = createApp(client, config);
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
  });

  it('returns 503 when UniFi unreachable', async () => {
    const client = makeClient({ get: vi.fn().mockRejectedValue(new Error('timed out')) });
    const app = createApp(client, config);
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('timed out');
  });
});

describe('POST /mcp auth', () => {
  it('returns 401 with no Authorization header', async () => {
    const app = createApp(makeClient(), config);
    const res = await request(app).post('/mcp').send({});
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong secret', async () => {
    const app = createApp(makeClient(), config);
    const res = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer wrong-secret')
      .send({});
    expect(res.status).toBe(401);
  });

  it('passes through with correct secret (MCP handles the rest)', async () => {
    const app = createApp(makeClient(), config);
    const res = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-secret')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } }, id: 1 });
    expect(res.status).not.toBe(401);
  });
});
