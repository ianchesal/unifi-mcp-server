# UniFi MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript MCP server that exposes the UniFi UDM Pro API to Claude Code via Streamable HTTP transport, running in Docker on a homelab.

**Architecture:** Single Node.js/Express process with three layers — MCP transport (auth + routing), tool modules (one per domain), and a shared UniFi HTTP client. Stateless per-request design: each `POST /mcp` spins up a fresh `McpServer`+transport, registers all tools with the shared `UnifiClient`, serves the request, and tears down.

**Tech Stack:** TypeScript 5, Node.js 22, `@modelcontextprotocol/sdk`, `express`, `zod`, Vitest

---

## File Map

| File | Responsibility |
|---|---|
| `src/config.ts` | Parse and validate env vars; fail fast on missing required vars |
| `src/logger.ts` | LOG_LEVEL-gated console logger |
| `src/unifi/client.ts` | UniFi HTTP client: API key auth, TLS, timeout, meta.rc validation |
| `src/server.ts` | Express app: auth middleware, POST /mcp, GET /health, GET /ready |
| `src/tools/firewall.ts` | Firewall rules + groups handler functions + MCP registration |
| `src/tools/network.ts` | Network/VLAN handler functions + MCP registration |
| `src/tools/clients.ts` | Client management handler functions + MCP registration |
| `src/tools/traffic.ts` | Traffic rules handler functions + MCP registration (v2 API) |
| `src/tools/ports.ts` | Port forwarding handler functions + MCP registration |
| `src/tools/monitoring.ts` | Site stats + device health handler functions + MCP registration |
| `src/tools/security.ts` | Threat events + network events + analyze_threats handler functions + MCP registration |
| `src/tools/index.ts` | `registerAllTools(server, client)` — wires all tool modules |
| `src/index.ts` | Entry point: load config, create client, start Express |
| `Dockerfile` | `node:22-alpine`, non-root user, healthcheck |
| `docker-compose.yml` | Service definition with env_file and restart policy |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "unifi-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "node --watch --experimental-strip-types src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "express": "^4.21.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.0.0",
    "@types/supertest": "^6.0.0",
    "supertest": "^7.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create `.env.example`**

```
# Required
UNIFI_HOST=192.168.1.1
UNIFI_API_KEY=your-api-key-here
MCP_SECRET=choose-a-strong-secret-here

# Optional
UNIFI_SITE=default
UNIFI_VERIFY_TLS=false
UNIFI_REQUEST_TIMEOUT_MS=10000
MCP_PORT=3000
MCP_HOST=0.0.0.0
LOG_LEVEL=info
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
.env
*.env
```

- [ ] **Step 6: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .env.example .gitignore
git commit -m "feat: project scaffold"
```

---

## Task 2: Config Module

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const orig = process.env;

  beforeEach(() => {
    process.env = { ...orig };
  });

  afterEach(() => {
    process.env = orig;
  });

  it('throws if UNIFI_HOST is missing', () => {
    delete process.env.UNIFI_HOST;
    process.env.UNIFI_API_KEY = 'key';
    process.env.MCP_SECRET = 'secret';
    expect(() => loadConfig()).toThrow('UNIFI_HOST');
  });

  it('throws if UNIFI_API_KEY is missing', () => {
    process.env.UNIFI_HOST = '192.168.1.1';
    delete process.env.UNIFI_API_KEY;
    process.env.MCP_SECRET = 'secret';
    expect(() => loadConfig()).toThrow('UNIFI_API_KEY');
  });

  it('throws if MCP_SECRET is missing', () => {
    process.env.UNIFI_HOST = '192.168.1.1';
    process.env.UNIFI_API_KEY = 'key';
    delete process.env.MCP_SECRET;
    expect(() => loadConfig()).toThrow('MCP_SECRET');
  });

  it('returns config with defaults for optional vars', () => {
    process.env.UNIFI_HOST = '192.168.1.1';
    process.env.UNIFI_API_KEY = 'key';
    process.env.MCP_SECRET = 'secret';
    const config = loadConfig();
    expect(config.unifiSite).toBe('default');
    expect(config.unifiVerifyTls).toBe(false);
    expect(config.unifiRequestTimeoutMs).toBe(10000);
    expect(config.mcpPort).toBe(3000);
    expect(config.mcpHost).toBe('0.0.0.0');
    expect(config.logLevel).toBe('info');
  });

  it('parses optional vars when provided', () => {
    process.env.UNIFI_HOST = '10.0.0.1';
    process.env.UNIFI_API_KEY = 'mykey';
    process.env.MCP_SECRET = 'mysecret';
    process.env.UNIFI_SITE = 'mysite';
    process.env.UNIFI_VERIFY_TLS = 'true';
    process.env.UNIFI_REQUEST_TIMEOUT_MS = '5000';
    process.env.MCP_PORT = '8080';
    process.env.MCP_HOST = '127.0.0.1';
    process.env.LOG_LEVEL = 'debug';
    const config = loadConfig();
    expect(config.unifiHost).toBe('10.0.0.1');
    expect(config.unifiSite).toBe('mysite');
    expect(config.unifiVerifyTls).toBe(true);
    expect(config.unifiRequestTimeoutMs).toBe(5000);
    expect(config.mcpPort).toBe(8080);
    expect(config.mcpHost).toBe('127.0.0.1');
    expect(config.logLevel).toBe('debug');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/config.test.ts
```

Expected: FAIL — `Cannot find module '../src/config.js'`

- [ ] **Step 3: Write `src/config.ts`**

```typescript
export interface Config {
  unifiHost: string;
  unifiApiKey: string;
  mcpSecret: string;
  unifiSite: string;
  unifiVerifyTls: boolean;
  unifiRequestTimeoutMs: number;
  mcpPort: number;
  mcpHost: string;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

export function loadConfig(): Config {
  const required = ['UNIFI_HOST', 'UNIFI_API_KEY', 'MCP_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    unifiHost: process.env.UNIFI_HOST!,
    unifiApiKey: process.env.UNIFI_API_KEY!,
    mcpSecret: process.env.MCP_SECRET!,
    unifiSite: process.env.UNIFI_SITE ?? 'default',
    unifiVerifyTls: process.env.UNIFI_VERIFY_TLS === 'true',
    unifiRequestTimeoutMs: parseInt(process.env.UNIFI_REQUEST_TIMEOUT_MS ?? '10000', 10),
    mcpPort: parseInt(process.env.MCP_PORT ?? '3000', 10),
    mcpHost: process.env.MCP_HOST ?? '0.0.0.0',
    logLevel: (process.env.LOG_LEVEL ?? 'info') as Config['logLevel'],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/config.test.ts
```

Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: config module with env var validation"
```

---

## Task 3: Logger

**Files:**
- Create: `src/logger.ts`
- Create: `tests/logger.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/logger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('createLogger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('info logs at info level', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { createLogger } = await import('../src/logger.js?t=' + Date.now());
    const logger = createLogger('info');
    logger.info('hello');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'), 'hello');
  });

  it('does not log debug at info level', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { createLogger } = await import('../src/logger.js?t=' + Date.now());
    const logger = createLogger('info');
    logger.debug('should not appear');
    expect(spy).not.toHaveBeenCalled();
  });

  it('error always logs', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { createLogger } = await import('../src/logger.js?t=' + Date.now());
    const logger = createLogger('error');
    logger.error('oops');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'), 'oops');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/logger.test.ts
```

Expected: FAIL — `Cannot find module '../src/logger.js'`

- [ ] **Step 3: Write `src/logger.ts`**

```typescript
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;

type LogLevel = keyof typeof LEVELS;

export interface Logger {
  error(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}

export function createLogger(level: LogLevel): Logger {
  const threshold = LEVELS[level];
  return {
    error: (msg, ...args) => threshold >= LEVELS.error && console.error(`[ERROR] ${new Date().toISOString()}`, msg, ...args),
    warn:  (msg, ...args) => threshold >= LEVELS.warn  && console.warn( `[WARN]  ${new Date().toISOString()}`, msg, ...args),
    info:  (msg, ...args) => threshold >= LEVELS.info  && console.log(  `[INFO]  ${new Date().toISOString()}`, msg, ...args),
    debug: (msg, ...args) => threshold >= LEVELS.debug && console.log(  `[DEBUG] ${new Date().toISOString()}`, msg, ...args),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/logger.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/logger.ts tests/logger.test.ts
git commit -m "feat: logger with LOG_LEVEL gating"
```

---

## Task 4: UniFi HTTP Client

**Files:**
- Create: `src/unifi/client.ts`
- Create: `tests/unifi/client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unifi/client.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unifi/client.test.ts
```

Expected: FAIL — `Cannot find module '../../src/unifi/client.js'`

- [ ] **Step 3: Write `src/unifi/client.ts`**

```typescript
export interface UnifiClientConfig {
  host: string;
  apiKey: string;
  site: string;
  verifyTls: boolean;
  timeoutMs: number;
}

export interface IUnifiClient {
  get<T>(path: string): Promise<T[]>;
  getOne<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T[]>;
  put<T>(path: string, body: unknown): Promise<T[]>;
  delete(path: string): Promise<void>;
  cmd(cmdPath: string, body: unknown): Promise<void>;
  v2get<T>(path: string): Promise<T[]>;
  v2getOne<T>(path: string): Promise<T>;
  v2post<T>(path: string, body: unknown): Promise<T>;
  v2put<T>(path: string, body: unknown): Promise<T>;
  v2delete(path: string): Promise<void>;
}

interface UnifiV1Response<T> {
  meta: { rc: string; msg?: string };
  data: T[];
}

export class UnifiClient implements IUnifiClient {
  private v1Base: string;
  private v2Base: string;

  constructor(private config: UnifiClientConfig) {
    if (!config.verifyTls) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
    this.v1Base = `https://${config.host}/proxy/network/api/s/${config.site}`;
    this.v2Base = `https://${config.host}/proxy/network/v2/api/site/${config.site}`;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'X-API-Key': this.config.apiKey,
          'Content-Type': 'application/json',
          ...(options.headers as Record<string, string> ?? {}),
        },
      });
      if (!response.ok) {
        throw new Error(`UniFi API HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json() as Promise<T>;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`UniFi API request timed out after ${this.config.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private checkRc<T>(result: UnifiV1Response<T>): T[] {
    if (result.meta.rc !== 'ok') {
      throw new Error(`UniFi API error: ${result.meta.msg ?? 'unknown error'}`);
    }
    return result.data;
  }

  async get<T>(path: string): Promise<T[]> {
    const result = await this.request<UnifiV1Response<T>>(`${this.v1Base}/${path}`);
    return this.checkRc(result);
  }

  async getOne<T>(path: string): Promise<T> {
    const items = await this.get<T>(path);
    if (items.length === 0) throw new Error(`UniFi API: no result for path '${path}'`);
    return items[0];
  }

  async post<T>(path: string, body: unknown): Promise<T[]> {
    const result = await this.request<UnifiV1Response<T>>(`${this.v1Base}/${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return this.checkRc(result);
  }

  async put<T>(path: string, body: unknown): Promise<T[]> {
    const result = await this.request<UnifiV1Response<T>>(`${this.v1Base}/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return this.checkRc(result);
  }

  async delete(path: string): Promise<void> {
    const result = await this.request<UnifiV1Response<never>>(`${this.v1Base}/${path}`, {
      method: 'DELETE',
    });
    this.checkRc(result);
  }

  async cmd(cmdPath: string, body: unknown): Promise<void> {
    await this.post(`cmd/${cmdPath}`, body);
  }

  async v2get<T>(path: string): Promise<T[]> {
    return this.request<T[]>(`${this.v2Base}/${path}`);
  }

  async v2getOne<T>(path: string): Promise<T> {
    const items = await this.v2get<T>(path);
    if (!Array.isArray(items) || items.length === 0) throw new Error(`UniFi v2 API: no result for path '${path}'`);
    return items[0];
  }

  async v2post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(`${this.v2Base}/${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async v2put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(`${this.v2Base}/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async v2delete(path: string): Promise<void> {
    await this.request<void>(`${this.v2Base}/${path}`, { method: 'DELETE' });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unifi/client.test.ts
```

Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/unifi/client.ts tests/unifi/client.test.ts
git commit -m "feat: UniFi HTTP client with meta.rc validation and timeout"
```

---

## Task 5: MCP Server + Express App

**Files:**
- Create: `src/server.ts`
- Create: `tests/server.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';
import type { IUnifiClient } from '../src/unifi/client.js';
import type { Config } from '../src/config.js';

// npm install --save-dev supertest @types/supertest
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
```

- [ ] **Step 2: Install supertest**

```bash
npm install --save-dev supertest @types/supertest
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/server.test.ts
```

Expected: FAIL — `Cannot find module '../src/server.js'`

- [ ] **Step 4: Write `src/server.ts`**

```typescript
import express, { type Request, type Response, type NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Config } from './config.js';
import type { IUnifiClient } from './unifi/client.js';
import { registerAllTools } from './tools/index.js';

export function createApp(client: IUnifiClient, config: Config) {
  const app = express();
  app.use(express.json());

  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${config.mcpSecret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/ready', async (_req, res) => {
    try {
      await client.get('stat/sysinfo');
      res.json({ status: 'ok' });
    } catch (err) {
      res.status(503).json({
        status: 'unavailable',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/mcp', authMiddleware, async (req, res) => {
    const mcpServer = new McpServer({ name: 'unifi-mcp-server', version: '1.0.0' });
    registerAllTools(mcpServer, client);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      mcpServer.close();
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  return app;
}
```

- [ ] **Step 5: Create a stub `src/tools/index.ts` so `server.ts` compiles**

```typescript
// src/tools/index.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';

export function registerAllTools(_server: McpServer, _client: IUnifiClient): void {
  // tool modules registered here in later tasks
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run tests/server.test.ts
```

Expected: PASS — 5 tests

- [ ] **Step 7: Commit**

```bash
git add src/server.ts src/tools/index.ts tests/server.test.ts
git commit -m "feat: Express app with MCP transport, auth middleware, health/ready endpoints"
```

---

## Task 6: Firewall Tools

**Files:**
- Create: `src/tools/firewall.ts`
- Create: `tests/tools/firewall.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/firewall.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  listFirewallRules, getFirewallRule, createFirewallRule,
  updateFirewallRule, deleteFirewallRule,
  listFirewallGroups, createFirewallGroup, updateFirewallGroup, deleteFirewallGroup,
} from '../../src/tools/firewall.js';
import type { IUnifiClient } from '../../src/unifi/client.js';

function makeClient(overrides: Partial<IUnifiClient> = {}): IUnifiClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    getOne: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue([{}]),
    put: vi.fn().mockResolvedValue([{}]),
    delete: vi.fn().mockResolvedValue(undefined),
    cmd: vi.fn(),
    v2get: vi.fn(), v2getOne: vi.fn(), v2post: vi.fn(), v2put: vi.fn(), v2delete: vi.fn(),
    ...overrides,
  } as unknown as IUnifiClient;
}

describe('listFirewallRules', () => {
  it('returns all rules with total', async () => {
    const rules = [
      { _id: '1', name: 'r1', ruleset: 'WAN_IN' },
      { _id: '2', name: 'r2', ruleset: 'LAN_IN' },
    ];
    const client = makeClient({ get: vi.fn().mockResolvedValue(rules) });
    const result = await listFirewallRules(client, {});
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
  });

  it('filters by ruleset', async () => {
    const rules = [
      { _id: '1', name: 'r1', ruleset: 'WAN_IN' },
      { _id: '2', name: 'r2', ruleset: 'LAN_IN' },
    ];
    const client = makeClient({ get: vi.fn().mockResolvedValue(rules) });
    const result = await listFirewallRules(client, { ruleset: 'WAN_IN' });
    expect(result.total).toBe(1);
    expect(result.data[0]._id).toBe('1');
  });

  it('respects limit', async () => {
    const rules = Array.from({ length: 10 }, (_, i) => ({ _id: String(i), name: `r${i}`, ruleset: 'WAN_IN' }));
    const client = makeClient({ get: vi.fn().mockResolvedValue(rules) });
    const result = await listFirewallRules(client, { limit: 3 });
    expect(result.total).toBe(10);
    expect(result.data).toHaveLength(3);
  });
});

describe('getFirewallRule', () => {
  it('fetches by id', async () => {
    const rule = { _id: 'abc', name: 'r1' };
    const client = makeClient({ get: vi.fn().mockResolvedValue([rule]) });
    const result = await getFirewallRule(client, 'abc');
    expect(result._id).toBe('abc');
    expect(client.get).toHaveBeenCalledWith('rest/firewallrule/abc');
  });
});

describe('createFirewallRule', () => {
  it('posts rule and returns created object', async () => {
    const created = { _id: 'new-id', name: 'my-rule' };
    const client = makeClient({ post: vi.fn().mockResolvedValue([created]) });
    const result = await createFirewallRule(client, { name: 'my-rule', ruleset: 'WAN_IN', action: 'drop' });
    expect(result._id).toBe('new-id');
    expect(client.post).toHaveBeenCalledWith('rest/firewallrule', expect.objectContaining({ name: 'my-rule' }));
  });
});

describe('updateFirewallRule', () => {
  it('reads current, merges, and puts', async () => {
    const current = { _id: 'abc', name: 'old-name', action: 'drop', enabled: true };
    const updated = [{ ...current, name: 'new-name' }];
    const client = makeClient({
      get: vi.fn().mockResolvedValue([current]),
      put: vi.fn().mockResolvedValue(updated),
    });
    const result = await updateFirewallRule(client, 'abc', { name: 'new-name' });
    expect(result.name).toBe('new-name');
    expect(client.put).toHaveBeenCalledWith('rest/firewallrule/abc', { ...current, name: 'new-name' });
  });
});

describe('deleteFirewallRule', () => {
  it('calls delete with correct path', async () => {
    const client = makeClient();
    await deleteFirewallRule(client, 'abc');
    expect(client.delete).toHaveBeenCalledWith('rest/firewallrule/abc');
  });
});

describe('listFirewallGroups', () => {
  it('returns groups with total', async () => {
    const groups = [{ _id: '1', name: 'g1' }, { _id: '2', name: 'g2' }];
    const client = makeClient({ get: vi.fn().mockResolvedValue(groups) });
    const result = await listFirewallGroups(client, {});
    expect(result.total).toBe(2);
  });
});

describe('deleteFirewallGroup', () => {
  it('calls delete with correct path', async () => {
    const client = makeClient();
    await deleteFirewallGroup(client, 'grp-id');
    expect(client.delete).toHaveBeenCalledWith('rest/firewallgroup/grp-id');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/firewall.test.ts
```

Expected: FAIL — `Cannot find module '../../src/tools/firewall.js'`

- [ ] **Step 3: Write `src/tools/firewall.ts`**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { toolResult, toolError } from './util.js';

// --- Handler functions (exported for testing) ---

export async function listFirewallRules(
  client: IUnifiClient,
  params: { ruleset?: string; limit?: number },
) {
  const all = await client.get<Record<string, unknown>>('rest/firewallrule');
  const filtered = params.ruleset ? all.filter((r) => r.ruleset === params.ruleset) : all;
  return { total: filtered.length, data: filtered.slice(0, params.limit ?? 100) };
}

export async function getFirewallRule(client: IUnifiClient, id: string) {
  const items = await client.get<Record<string, unknown>>(`rest/firewallrule/${id}`);
  if (items.length === 0) throw new Error(`Firewall rule not found: ${id}`);
  return items[0];
}

export async function createFirewallRule(client: IUnifiClient, body: Record<string, unknown>) {
  const result = await client.post<Record<string, unknown>>('rest/firewallrule', body);
  return result[0];
}

export async function updateFirewallRule(
  client: IUnifiClient,
  id: string,
  updates: Record<string, unknown>,
) {
  const items = await client.get<Record<string, unknown>>(`rest/firewallrule/${id}`);
  if (items.length === 0) throw new Error(`Firewall rule not found: ${id}`);
  const merged = { ...items[0], ...updates };
  const result = await client.put<Record<string, unknown>>(`rest/firewallrule/${id}`, merged);
  return result[0];
}

export async function deleteFirewallRule(client: IUnifiClient, id: string) {
  await client.delete(`rest/firewallrule/${id}`);
  return { success: true, id };
}

export async function listFirewallGroups(
  client: IUnifiClient,
  params: { limit?: number },
) {
  const all = await client.get<Record<string, unknown>>('rest/firewallgroup');
  return { total: all.length, data: all.slice(0, params.limit ?? 100) };
}

export async function createFirewallGroup(client: IUnifiClient, body: Record<string, unknown>) {
  const result = await client.post<Record<string, unknown>>('rest/firewallgroup', body);
  return result[0];
}

export async function updateFirewallGroup(
  client: IUnifiClient,
  id: string,
  updates: Record<string, unknown>,
) {
  const items = await client.get<Record<string, unknown>>(`rest/firewallgroup/${id}`);
  if (items.length === 0) throw new Error(`Firewall group not found: ${id}`);
  const merged = { ...items[0], ...updates };
  const result = await client.put<Record<string, unknown>>(`rest/firewallgroup/${id}`, merged);
  return result[0];
}

export async function deleteFirewallGroup(client: IUnifiClient, id: string) {
  await client.delete(`rest/firewallgroup/${id}`);
  return { success: true, id };
}

// --- MCP registration ---

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

export function registerFirewallTools(server: McpServer, client: IUnifiClient): void {
  server.tool('list_firewall_rules',
    'List firewall rules. Optionally filter by ruleset (WAN_IN, WAN_OUT, LAN_IN, LAN_OUT, GUEST_IN, GUEST_OUT).',
    { ruleset: z.string().optional(), limit: limitSchema },
    async (p) => { try { return toolResult(await listFirewallRules(client, p)); } catch (e) { return toolError(e); } });

  server.tool('get_firewall_rule',
    'Get a single firewall rule by its ID.',
    { id: z.string() },
    async ({ id }) => { try { return toolResult(await getFirewallRule(client, id)); } catch (e) { return toolError(e); } });

  server.tool('create_firewall_rule',
    'Create a new firewall rule. Required fields: name, ruleset, action (accept|drop|reject). Optional: src_address, dst_address, protocol, src_port, dst_port, enabled.',
    { rule: z.record(z.unknown()) },
    async ({ rule }) => { try { return toolResult(await createFirewallRule(client, rule)); } catch (e) { return toolError(e); } });

  server.tool('update_firewall_rule',
    'Update an existing firewall rule by ID. Only provide fields to change — existing fields are preserved via read-before-write.',
    { id: z.string(), updates: z.record(z.unknown()) },
    async ({ id, updates }) => { try { return toolResult(await updateFirewallRule(client, id, updates)); } catch (e) { return toolError(e); } });

  server.tool('delete_firewall_rule',
    'Delete a firewall rule by ID.',
    { id: z.string() },
    async ({ id }) => { try { return toolResult(await deleteFirewallRule(client, id)); } catch (e) { return toolError(e); } });

  server.tool('list_firewall_groups',
    'List firewall groups (IP sets and port sets used in firewall rules).',
    { limit: limitSchema },
    async (p) => { try { return toolResult(await listFirewallGroups(client, p)); } catch (e) { return toolError(e); } });

  server.tool('create_firewall_group',
    'Create a firewall group. Required: name, group_type (address-group|port-group|ipv6-address-group), group_members (array of IPs/CIDRs or ports).',
    { group: z.record(z.unknown()) },
    async ({ group }) => { try { return toolResult(await createFirewallGroup(client, group)); } catch (e) { return toolError(e); } });

  server.tool('update_firewall_group',
    'Update a firewall group by ID. Only provide fields to change.',
    { id: z.string(), updates: z.record(z.unknown()) },
    async ({ id, updates }) => { try { return toolResult(await updateFirewallGroup(client, id, updates)); } catch (e) { return toolError(e); } });

  server.tool('delete_firewall_group',
    'Delete a firewall group by ID.',
    { id: z.string() },
    async ({ id }) => { try { return toolResult(await deleteFirewallGroup(client, id)); } catch (e) { return toolError(e); } });
}
```

- [ ] **Step 4: Create `src/tools/util.ts` (needed by firewall.ts)**

```typescript
// src/tools/util.ts
import { createLogger } from '../logger.js';

// Module-level logger for tool audit logging. LOG_LEVEL is set before tools are loaded.
export const toolLogger = createLogger(
  (process.env.LOG_LEVEL ?? 'info') as 'error' | 'warn' | 'info' | 'debug',
);

export function toolResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function toolError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true as const,
  };
}
```

Mutation tools use `toolLogger` for audit logging. Example usage in `src/tools/firewall.ts` (apply this pattern to all `create_*`, `update_*`, `delete_*` handlers):

```typescript
// In createFirewallRule:
export async function createFirewallRule(client: IUnifiClient, body: Record<string, unknown>) {
  toolLogger.info(`create_firewall_rule: creating rule "${body.name}"`);
  const result = await client.post<Record<string, unknown>>('rest/firewallrule', body);
  toolLogger.info(`create_firewall_rule: created rule _id=${result[0]?._id}`);
  return result[0];
}

// In deleteFirewallRule:
export async function deleteFirewallRule(client: IUnifiClient, id: string) {
  toolLogger.info(`delete_firewall_rule: deleting ${id}`);
  await client.delete(`rest/firewallrule/${id}`);
  toolLogger.info(`delete_firewall_rule: deleted ${id}`);
  return { success: true, id };
}
```

Apply equivalent `toolLogger.info` calls at the start and end of every `create*`, `update*`, and `delete*` handler across all tool modules (network, clients, traffic, ports).

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/tools/firewall.test.ts
```

Expected: PASS — 8 tests

- [ ] **Step 6: Commit**

```bash
git add src/tools/firewall.ts src/tools/util.ts tests/tools/firewall.test.ts
git commit -m "feat: firewall rules and groups tools"
```

---

## Task 7: Network Tools

**Files:**
- Create: `src/tools/network.ts`
- Create: `tests/tools/network.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/network.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write `src/tools/network.ts`**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { toolResult, toolError } from './util.js';

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

export async function listNetworks(client: IUnifiClient, params: { limit?: number }) {
  const all = await client.get<Record<string, unknown>>('rest/networkconf');
  return { total: all.length, data: all.slice(0, params.limit ?? 100) };
}

export async function getNetwork(client: IUnifiClient, id: string) {
  const items = await client.get<Record<string, unknown>>(`rest/networkconf/${id}`);
  if (items.length === 0) throw new Error(`Network not found: ${id}`);
  return items[0];
}

export async function createNetwork(client: IUnifiClient, body: Record<string, unknown>) {
  const result = await client.post<Record<string, unknown>>('rest/networkconf', body);
  return result[0];
}

export async function updateNetwork(
  client: IUnifiClient,
  id: string,
  updates: Record<string, unknown>,
) {
  const items = await client.get<Record<string, unknown>>(`rest/networkconf/${id}`);
  if (items.length === 0) throw new Error(`Network not found: ${id}`);
  const merged = { ...items[0], ...updates };
  const result = await client.put<Record<string, unknown>>(`rest/networkconf/${id}`, merged);
  return result[0];
}

export async function deleteNetwork(client: IUnifiClient, id: string, confirmName: string) {
  const items = await client.get<Record<string, unknown>>(`rest/networkconf/${id}`);
  if (items.length === 0) throw new Error(`Network not found: ${id}`);
  const network = items[0];
  if (network.name !== confirmName) {
    throw new Error(
      `Confirmation name '${confirmName}' does not match network name '${network.name}'. Pass the exact network name to confirm deletion.`,
    );
  }
  await client.delete(`rest/networkconf/${id}`);
  return { success: true, id, name: confirmName };
}

export function registerNetworkTools(server: McpServer, client: IUnifiClient): void {
  server.tool('list_networks', 'List all networks and VLANs.',
    { limit: limitSchema },
    async (p) => { try { return toolResult(await listNetworks(client, p)); } catch (e) { return toolError(e); } });

  server.tool('get_network', 'Get a network by ID.',
    { id: z.string() },
    async ({ id }) => { try { return toolResult(await getNetwork(client, id)); } catch (e) { return toolError(e); } });

  server.tool('create_network', 'Create a network. Required: name, ip_subnet (CIDR). Optional: vlan_id, dhcpd_enabled, purpose.',
    { network: z.record(z.unknown()) },
    async ({ network }) => { try { return toolResult(await createNetwork(client, network)); } catch (e) { return toolError(e); } });

  server.tool('update_network', 'Update a network by ID. Only provide fields to change.',
    { id: z.string(), updates: z.record(z.unknown()) },
    async ({ id, updates }) => { try { return toolResult(await updateNetwork(client, id, updates)); } catch (e) { return toolError(e); } });

  server.tool('delete_network',
    'Delete a network by ID. DESTRUCTIVE: disconnects all devices on the network. Must pass confirm_name matching the network name exactly.',
    { id: z.string(), confirm_name: z.string().describe('Must exactly match the network name') },
    async ({ id, confirm_name }) => { try { return toolResult(await deleteNetwork(client, id, confirm_name)); } catch (e) { return toolError(e); } });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/network.test.ts
```

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/tools/network.ts tests/tools/network.test.ts
git commit -m "feat: network/VLAN tools with confirm_name guard on delete"
```

---

## Task 8: Client Management Tools

**Files:**
- Create: `src/tools/clients.ts`
- Create: `tests/tools/clients.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/clients.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write `src/tools/clients.ts`**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { toolResult, toolError } from './util.js';

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

export async function listClients(
  client: IUnifiClient,
  params: { include_offline?: boolean; limit?: number },
) {
  const endpoint = params.include_offline ? 'stat/alluser' : 'stat/sta';
  const all = await client.get<Record<string, unknown>>(endpoint);
  return { total: all.length, data: all.slice(0, params.limit ?? 100) };
}

export async function getClient(client: IUnifiClient, mac: string) {
  const all = await client.get<Record<string, unknown>>('stat/sta');
  const found = all.find((c) => c.mac === mac.toLowerCase());
  if (!found) throw new Error(`Client not found: ${mac}`);
  return found;
}

export async function blockClient(client: IUnifiClient, mac: string) {
  await client.cmd('stamgr', { cmd: 'block-sta', mac });
  return { success: true, mac, action: 'blocked' };
}

export async function unblockClient(client: IUnifiClient, mac: string) {
  await client.cmd('stamgr', { cmd: 'unblock-sta', mac });
  return { success: true, mac, action: 'unblocked' };
}

async function findUserByMac(client: IUnifiClient, mac: string) {
  const users = await client.get<Record<string, unknown>>('rest/user');
  const user = users.find((u) => u.mac === mac.toLowerCase());
  if (!user) throw new Error(`Client not found: ${mac}`);
  return user;
}

export async function setClientFixedIp(client: IUnifiClient, mac: string, ip: string) {
  const user = await findUserByMac(client, mac);
  const updated = await client.put<Record<string, unknown>>(
    `rest/user/${user._id}`,
    { ...user, use_fixedip: true, fixed_ip: ip },
  );
  return updated[0];
}

export async function removeClientFixedIp(client: IUnifiClient, mac: string) {
  const user = await findUserByMac(client, mac);
  const updated = await client.put<Record<string, unknown>>(
    `rest/user/${user._id}`,
    { ...user, use_fixedip: false, fixed_ip: '' },
  );
  return updated[0];
}

export function registerClientTools(server: McpServer, client: IUnifiClient): void {
  server.tool('list_clients',
    'List network clients. include_offline=true includes recently seen offline clients.',
    { include_offline: z.boolean().default(false).optional(), limit: limitSchema },
    async (p) => { try { return toolResult(await listClients(client, p)); } catch (e) { return toolError(e); } });

  server.tool('get_client', 'Get details for a connected client by MAC address.',
    { mac: z.string() },
    async ({ mac }) => { try { return toolResult(await getClient(client, mac)); } catch (e) { return toolError(e); } });

  server.tool('block_client', 'Block a client from the network by MAC address.',
    { mac: z.string() },
    async ({ mac }) => { try { return toolResult(await blockClient(client, mac)); } catch (e) { return toolError(e); } });

  server.tool('unblock_client', 'Unblock a previously blocked client by MAC address.',
    { mac: z.string() },
    async ({ mac }) => { try { return toolResult(await unblockClient(client, mac)); } catch (e) { return toolError(e); } });

  server.tool('set_client_fixed_ip', 'Assign a fixed/static IP address to a client by MAC.',
    { mac: z.string(), ip: z.string() },
    async ({ mac, ip }) => { try { return toolResult(await setClientFixedIp(client, mac, ip)); } catch (e) { return toolError(e); } });

  server.tool('remove_client_fixed_ip', 'Remove the fixed IP assignment from a client.',
    { mac: z.string() },
    async ({ mac }) => { try { return toolResult(await removeClientFixedIp(client, mac)); } catch (e) { return toolError(e); } });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/clients.test.ts
```

Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/tools/clients.ts tests/tools/clients.test.ts
git commit -m "feat: client management tools (list, block, unblock, fixed IP)"
```

---

## Task 9: Traffic Rules Tools

**Files:**
- Create: `src/tools/traffic.ts`
- Create: `tests/tools/traffic.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/traffic.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write `src/tools/traffic.ts`**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { toolResult, toolError } from './util.js';

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

export async function listTrafficRules(client: IUnifiClient, params: { limit?: number }) {
  const all = await client.v2get<Record<string, unknown>>('trafficrules');
  return { total: all.length, data: all.slice(0, params.limit ?? 100) };
}

export async function createTrafficRule(client: IUnifiClient, body: Record<string, unknown>) {
  return client.v2post<Record<string, unknown>>('trafficrules', body);
}

export async function updateTrafficRule(
  client: IUnifiClient,
  id: string,
  updates: Record<string, unknown>,
) {
  const all = await client.v2get<Record<string, unknown>>('trafficrules');
  const current = all.find((r) => r.id === id || r._id === id);
  if (!current) throw new Error(`Traffic rule not found: ${id}`);
  const merged = { ...current, ...updates };
  return client.v2put<Record<string, unknown>>(`trafficrules/${id}`, merged);
}

export async function deleteTrafficRule(client: IUnifiClient, id: string) {
  await client.v2delete(`trafficrules/${id}`);
  return { success: true, id };
}

export function registerTrafficTools(server: McpServer, client: IUnifiClient): void {
  server.tool('list_traffic_rules', 'List traffic management rules (newer policy-based rules, separate from classic firewall rules).',
    { limit: limitSchema },
    async (p) => { try { return toolResult(await listTrafficRules(client, p)); } catch (e) { return toolError(e); } });

  server.tool('create_traffic_rule', 'Create a traffic rule. Required: description, action, matching_target. See UniFi docs for full schema.',
    { rule: z.record(z.unknown()) },
    async ({ rule }) => { try { return toolResult(await createTrafficRule(client, rule)); } catch (e) { return toolError(e); } });

  server.tool('update_traffic_rule', 'Update a traffic rule by ID. Only provide fields to change.',
    { id: z.string(), updates: z.record(z.unknown()) },
    async ({ id, updates }) => { try { return toolResult(await updateTrafficRule(client, id, updates)); } catch (e) { return toolError(e); } });

  server.tool('delete_traffic_rule', 'Delete a traffic rule by ID.',
    { id: z.string() },
    async ({ id }) => { try { return toolResult(await deleteTrafficRule(client, id)); } catch (e) { return toolError(e); } });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/traffic.test.ts
```

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/tools/traffic.ts tests/tools/traffic.test.ts
git commit -m "feat: traffic rules tools (v2 API)"
```

---

## Task 10: Port Forwarding Tools

**Files:**
- Create: `src/tools/ports.ts`
- Create: `tests/tools/ports.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/ports.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write `src/tools/ports.ts`**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { toolResult, toolError } from './util.js';

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

export async function listPortForwards(client: IUnifiClient, params: { limit?: number }) {
  const all = await client.get<Record<string, unknown>>('rest/portforward');
  return { total: all.length, data: all.slice(0, params.limit ?? 100) };
}

export async function createPortForward(client: IUnifiClient, body: Record<string, unknown>) {
  const result = await client.post<Record<string, unknown>>('rest/portforward', body);
  return result[0];
}

export async function updatePortForward(
  client: IUnifiClient,
  id: string,
  updates: Record<string, unknown>,
) {
  const items = await client.get<Record<string, unknown>>(`rest/portforward/${id}`);
  if (items.length === 0) throw new Error(`Port forward not found: ${id}`);
  const merged = { ...items[0], ...updates };
  const result = await client.put<Record<string, unknown>>(`rest/portforward/${id}`, merged);
  return result[0];
}

export async function deletePortForward(client: IUnifiClient, id: string) {
  await client.delete(`rest/portforward/${id}`);
  return { success: true, id };
}

export function registerPortTools(server: McpServer, client: IUnifiClient): void {
  server.tool('list_port_forwards', 'List all port forwarding rules.',
    { limit: limitSchema },
    async (p) => { try { return toolResult(await listPortForwards(client, p)); } catch (e) { return toolError(e); } });

  server.tool('create_port_forward',
    'Create a port forward rule. Required: name, dst_port (external port), fwd (destination IP), fwd_port (internal port), proto (tcp/udp/tcp_udp).',
    { rule: z.record(z.unknown()) },
    async ({ rule }) => { try { return toolResult(await createPortForward(client, rule)); } catch (e) { return toolError(e); } });

  server.tool('update_port_forward', 'Update a port forward rule by ID. Only provide fields to change.',
    { id: z.string(), updates: z.record(z.unknown()) },
    async ({ id, updates }) => { try { return toolResult(await updatePortForward(client, id, updates)); } catch (e) { return toolError(e); } });

  server.tool('delete_port_forward', 'Delete a port forward rule by ID.',
    { id: z.string() },
    async ({ id }) => { try { return toolResult(await deletePortForward(client, id)); } catch (e) { return toolError(e); } });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/ports.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/tools/ports.ts tests/tools/ports.test.ts
git commit -m "feat: port forwarding tools"
```

---

## Task 11: Monitoring Tools

**Files:**
- Create: `src/tools/monitoring.ts`
- Create: `tests/tools/monitoring.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/monitoring.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write `src/tools/monitoring.ts`**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { toolResult, toolError } from './util.js';

export async function getSiteStats(client: IUnifiClient) {
  return client.get<Record<string, unknown>>('stat/health');
}

export async function getDeviceHealth(client: IUnifiClient) {
  return client.get<Record<string, unknown>>('stat/device');
}

export function registerMonitoringTools(server: McpServer, client: IUnifiClient): void {
  server.tool('get_site_stats',
    'Get site-wide health stats: WAN/LAN status, connected device counts, bandwidth usage.',
    {},
    async () => { try { return toolResult(await getSiteStats(client)); } catch (e) { return toolError(e); } });

  server.tool('get_device_health',
    'Get health status of all UniFi devices (UDM Pro, APs, switches): uptime, state, firmware version.',
    {},
    async () => { try { return toolResult(await getDeviceHealth(client)); } catch (e) { return toolError(e); } });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/monitoring.test.ts
```

Expected: PASS — 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/tools/monitoring.ts tests/tools/monitoring.test.ts
git commit -m "feat: monitoring tools (site stats, device health)"
```

---

## Task 12: Security / Threat Analysis Tools

**Files:**
- Create: `src/tools/security.ts`
- Create: `tests/tools/security.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/security.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write `src/tools/security.ts`**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { toolResult, toolError } from './util.js';

const limitSchema = z.number().int().min(1).max(500).default(100).optional();

interface ThreatEvent {
  _id?: string;
  src_ip?: string;
  category?: string;
  action?: string;
  severity?: number;
  timestamp?: number;
  [key: string]: unknown;
}

function topN<T extends Record<string, unknown>>(
  items: T[],
  keyFn: (item: T) => string | undefined,
  n: number,
): Array<{ [k: string]: string | number }> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (key) counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, count]) => ({ key: k, count }));
}

export async function getThreatEvents(
  client: IUnifiClient,
  params: { min_severity?: number; limit?: number },
) {
  const all = await client.get<ThreatEvent>('stat/ips/event');
  const filtered = params.min_severity !== undefined
    ? all.filter((e) => (e.severity ?? 0) >= params.min_severity!)
    : all;
  return { total: filtered.length, data: filtered.slice(0, params.limit ?? 100) };
}

export async function getNetworkEvents(
  client: IUnifiClient,
  params: { key_filter?: string; limit?: number },
) {
  const all = await client.get<Record<string, unknown>>('stat/event');
  const filtered = params.key_filter
    ? all.filter((e) => String(e.key ?? '').includes(params.key_filter!))
    : all;
  return { total: filtered.length, data: filtered.slice(0, params.limit ?? 100) };
}

export async function analyzeThreats(
  client: IUnifiClient,
  params: { min_severity?: number },
) {
  const all = await client.get<ThreatEvent>('stat/ips/event');
  const events = params.min_severity !== undefined
    ? all.filter((e) => (e.severity ?? 0) >= params.min_severity!)
    : all;

  const blocked_count = events.filter((e) => e.action === 'blocked').length;
  const alerted_count = events.filter((e) => e.action === 'alerted').length;
  const timestamps = events.map((e) => e.timestamp).filter(Boolean) as number[];
  const time_range = timestamps.length > 0
    ? { earliest: Math.min(...timestamps), latest: Math.max(...timestamps) }
    : null;

  const top_source_ips = topN(events, (e) => e.src_ip, 10).map(({ key, count }) => ({ ip: key, count }));
  const top_categories = topN(events, (e) => e.category, 10).map(({ key, count }) => ({ category: key, count }));

  return {
    total_events: events.length,
    blocked_count,
    alerted_count,
    time_range,
    top_source_ips,
    top_categories,
    events,
  };
}

export function registerSecurityTools(server: McpServer, client: IUnifiClient): void {
  server.tool('get_threat_events',
    'Get IDS/IPS threat events. Optional: min_severity (1-5), limit. Returns events with src_ip, category, action (blocked|alerted), severity.',
    { min_severity: z.number().int().min(1).max(5).optional(), limit: limitSchema },
    async (p) => { try { return toolResult(await getThreatEvents(client, p)); } catch (e) { return toolError(e); } });

  server.tool('get_network_events',
    'Get network events (client connections, DHCP, admin actions). Optional: key_filter (e.g. "EVT_WC_Connected"), limit.',
    { key_filter: z.string().optional(), limit: limitSchema },
    async (p) => { try { return toolResult(await getNetworkEvents(client, p)); } catch (e) { return toolError(e); } });

  server.tool('analyze_threats',
    'Aggregate IDS/IPS threat events into a summary: top 10 source IPs, top 10 categories, blocked vs alerted counts, time range. Raw events included alongside aggregates.',
    { min_severity: z.number().int().min(1).max(5).optional() },
    async (p) => { try { return toolResult(await analyzeThreats(client, p)); } catch (e) { return toolError(e); } });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/security.test.ts
```

Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/tools/security.ts tests/tools/security.test.ts
git commit -m "feat: security and threat analysis tools"
```

---

## Task 13: Wire All Tools + Entry Point

**Files:**
- Modify: `src/tools/index.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Update `src/tools/index.ts` to register all modules**

```typescript
// src/tools/index.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { registerFirewallTools } from './firewall.js';
import { registerNetworkTools } from './network.js';
import { registerClientTools } from './clients.js';
import { registerTrafficTools } from './traffic.js';
import { registerPortTools } from './ports.js';
import { registerMonitoringTools } from './monitoring.js';
import { registerSecurityTools } from './security.js';

export function registerAllTools(server: McpServer, client: IUnifiClient): void {
  registerFirewallTools(server, client);
  registerNetworkTools(server, client);
  registerClientTools(server, client);
  registerTrafficTools(server, client);
  registerPortTools(server, client);
  registerMonitoringTools(server, client);
  registerSecurityTools(server, client);
}
```

- [ ] **Step 2: Write `src/index.ts`**

```typescript
// src/index.ts
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { UnifiClient } from './unifi/client.js';
import { createApp } from './server.js';

const config = loadConfig();
const logger = createLogger(config.logLevel);

logger.info(`Starting UniFi MCP Server`);
logger.info(`UniFi host: ${config.unifiHost}, site: ${config.unifiSite}`);

const client = new UnifiClient({
  host: config.unifiHost,
  apiKey: config.unifiApiKey,
  site: config.unifiSite,
  verifyTls: config.unifiVerifyTls,
  timeoutMs: config.unifiRequestTimeoutMs,
});

const app = createApp(client, config);

app.listen(config.mcpPort, config.mcpHost, () => {
  logger.info(`MCP server listening on ${config.mcpHost}:${config.mcpPort}`);
  logger.info(`POST http://${config.mcpHost}:${config.mcpPort}/mcp  (requires Authorization: Bearer <MCP_SECRET>)`);
  logger.info(`GET  http://${config.mcpHost}:${config.mcpPort}/health`);
  logger.info(`GET  http://${config.mcpHost}:${config.mcpPort}/ready`);
});
```

- [ ] **Step 3: Run full type check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/tools/index.ts src/index.ts
git commit -m "feat: wire all tools and entry point"
```

---

## Task 14: Dockerfile + docker-compose

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN addgroup -S mcpgroup && adduser -S mcpuser -G mcpgroup
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
USER mcpuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  unifi-mcp:
    build: .
    image: unifi-mcp-server:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

- [ ] **Step 3: Create `.dockerignore`**

```
node_modules
dist
.env
*.env
tests
docs
.git
```

- [ ] **Step 4: Build the Docker image**

```bash
docker build -t unifi-mcp-server:latest .
```

Expected: build succeeds, image created

- [ ] **Step 5: Smoke test the container (requires a .env with real or dummy values)**

Create a `.env` for smoke testing:
```bash
cat > .env.smoke <<EOF
UNIFI_HOST=192.168.1.1
UNIFI_API_KEY=dummy
MCP_SECRET=test123
EOF
```

Run the container and check the health endpoint:
```bash
docker run --rm -d --env-file .env.smoke -p 3001:3000 --name unifi-mcp-smoke unifi-mcp-server:latest
sleep 2
curl -s http://localhost:3001/health
docker stop unifi-mcp-smoke
rm .env.smoke
```

Expected: `{"status":"ok"}` from the health endpoint

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: Dockerfile and docker-compose for homelab deployment"
```

---

## Task 15: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# UniFi MCP Server

MCP server for the UniFi UDM Pro API. Exposes firewall, network, client, traffic, port forwarding, and threat analysis tools to Claude Code via Streamable HTTP transport.

## Setup

### 1. Generate an API key on your UDM Pro

UniFi OS → Settings → Control Plane → API → Create API Key

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your UDM Pro IP, API key, and a strong MCP_SECRET
```

### 3. Run

```bash
docker compose up -d
```

### 4. Add to Claude Code

In your Claude Code MCP config (`~/.claude/mcp_servers.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "unifi": {
      "type": "http",
      "url": "http://<homelab-ip>:3000/mcp",
      "headers": { "Authorization": "Bearer <your-MCP_SECRET>" }
    }
  }
}
```

## Development

```bash
npm install
npm test          # run unit tests
npm run dev       # run with --watch (requires .env)
```

## Integration tests (requires real UDM Pro)

```bash
TEST_INTEGRATION=true npm test
```

Integration tests for mutation tools create objects prefixed with `mcp-test-` and delete them in teardown.

## Tools

| Domain | Tools |
|---|---|
| Firewall | list/get/create/update/delete rules + groups |
| Networks | list/get/create/update/delete networks (delete requires confirm_name) |
| Clients | list/get/block/unblock + fixed IP management |
| Traffic Rules | list/create/update/delete (UniFi v2 API) |
| Port Forwarding | list/create/update/delete |
| Monitoring | site stats, device health |
| Security | get_threat_events, get_network_events, analyze_threats |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and tool reference"
```

---

## Task 16: Integration Test Scaffold

**Files:**
- Create: `tests/integration/firewall.integration.test.ts`

Integration tests are skipped unless `TEST_INTEGRATION=true` and require a real `.env` file.

- [ ] **Step 1: Create `tests/integration/firewall.integration.test.ts`**

```typescript
// tests/integration/firewall.integration.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { UnifiClient } from '../../src/unifi/client.js';
import { createFirewallGroup, deleteFirewallGroup, listFirewallGroups } from '../../src/tools/firewall.js';

const TEST_PREFIX = 'mcp-test-';
const skip = !process.env.TEST_INTEGRATION;

describe.skipIf(skip)('firewall integration', () => {
  const client = new UnifiClient({
    host: process.env.UNIFI_HOST!,
    apiKey: process.env.UNIFI_API_KEY!,
    site: process.env.UNIFI_SITE ?? 'default',
    verifyTls: process.env.UNIFI_VERIFY_TLS === 'true',
    timeoutMs: 10000,
  });

  const createdIds: string[] = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteFirewallGroup(client, id).catch(() => {});
    }
  });

  it('creates and lists a firewall group', async () => {
    const name = `${TEST_PREFIX}group-${Date.now()}`;
    const created = await createFirewallGroup(client, {
      name,
      group_type: 'address-group',
      group_members: ['192.168.99.0/24'],
    });
    expect(created._id).toBeTruthy();
    createdIds.push(created._id as string);

    const list = await listFirewallGroups(client, {});
    const found = list.data.find((g) => g._id === created._id);
    expect(found).toBeTruthy();
  });
});
```

Run with: `TEST_INTEGRATION=true npx vitest run tests/integration/`

All integration tests follow this pattern: create objects with `mcp-test-` prefix, assert, delete in `afterAll`. Never touch objects that don't have the `mcp-test-` prefix.

- [ ] **Step 2: Commit**

```bash
git add tests/integration/firewall.integration.test.ts
git commit -m "test: integration test scaffold with mcp-test- prefix and afterAll cleanup"
```

---

## Final Verification

- [ ] **Run all tests one last time**

```bash
npx vitest run
```

Expected: all tests pass, no skipped tests

- [ ] **Type check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Verify Docker build is clean**

```bash
docker build -t unifi-mcp-server:latest .
```

Expected: successful multi-stage build
