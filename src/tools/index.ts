// src/tools/index.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IUnifiClient } from '../unifi/client.js';
import { registerClientTools } from './clients.js';
import { registerFirewallTools } from './firewall.js';
import { registerMonitoringTools } from './monitoring.js';
import { registerNetworkTools } from './network.js';
import { registerPortTools } from './ports.js';
import { registerSecurityTools } from './security.js';
import { registerTrafficTools } from './traffic.js';

export function registerAllTools(server: McpServer, client: IUnifiClient): void {
  registerFirewallTools(server, client);
  registerNetworkTools(server, client);
  registerClientTools(server, client);
  registerTrafficTools(server, client);
  registerPortTools(server, client);
  registerMonitoringTools(server, client);
  registerSecurityTools(server, client);
}
