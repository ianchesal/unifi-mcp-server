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
