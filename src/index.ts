// src/index.ts
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createApp } from './server.js';
import { UnifiClient } from './unifi/client.js';

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
  logger.info(
    `POST http://${config.mcpHost}:${config.mcpPort}/mcp  (requires Authorization: Bearer <MCP_SECRET>)`
  );
  logger.info(`GET  http://${config.mcpHost}:${config.mcpPort}/health`);
  logger.info(`GET  http://${config.mcpHost}:${config.mcpPort}/ready`);
});
