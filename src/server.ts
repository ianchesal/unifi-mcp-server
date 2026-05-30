import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Config } from './config.js';
import { registerAllTools } from './tools/index.js';
import type { IUnifiClient } from './unifi/client.js';

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

  app.post('/mcp', authMiddleware, async (req, res, next) => {
    const mcpServer = new McpServer({ name: 'unifi-mcp-server', version: '1.0.0' });
    registerAllTools(mcpServer, client);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      mcpServer.close();
    });
    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      next(err);
    }
  });

  return app;
}
