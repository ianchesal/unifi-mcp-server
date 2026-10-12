import { createServer } from 'node:net';
import { describe, it, expect } from 'vitest';
import { UnifiClient } from '../../src/unifi/client.js';

async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// No fetch mocks here: this exercises the real fetch + undici Agent pairing.
// Node's global fetch bundles its own undici; handing it an Agent from a
// different undici major fails before connecting (UND_ERR_INVALID_ARG).
describe('UnifiClient real dispatcher', () => {
  it('reaches the network layer with verifyTls=false and surfaces the cause', async () => {
    const client = new UnifiClient({
      host: `127.0.0.1:${await closedPort()}`,
      apiKey: 'test-key',
      site: 'default',
      verifyTls: false,
      timeoutMs: 5000,
    });
    await expect(client.get('stat/health')).rejects.toThrow(/ECONNREFUSED/);
  });
});
