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
