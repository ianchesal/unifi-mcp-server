# UniFi MCP Server — Design Spec

**Date:** 2026-05-30
**Status:** Approved

## Overview

A TypeScript MCP server that runs in Docker on a homelab and exposes the UniFi UDM Pro's local API to Claude Code sessions. Enables AI-assisted management of firewall rules, network config, clients, traffic rules, port forwarding, and security log analysis.

## Target Environment

- **UDM Pro OS:** UniFi OS 5.1.12
- **Network Application:** 10.4.56
- **API surface:** UniFi OS API at `https://<udm-ip>/proxy/network/api/`
- **Auth:** API key (`X-API-Key` header)
- **Deployment:** Docker container on homelab LAN, no public exposure required

## Architecture

The server is a single Node.js process with three layers:

```
Claude Code
    │  HTTP (Streamable HTTP MCP transport)
    ▼
┌─────────────────────────┐
│   MCP Transport Layer   │
├─────────────────────────┤
│      Tool Modules       │
│  firewall | network     │
│  clients  | traffic     │
│  ports    | monitoring  │
│  security               │
├─────────────────────────┤
│     UniFi HTTP Client   │
└─────────────────────────┘
    │  HTTPS + API Key
    ▼
  UDM Pro (local LAN)
```

1. **MCP transport layer** — accepts Streamable HTTP connections from Claude Code, routes tool calls inward, streams results back via `POST /mcp`
2. **Tool layer** — one TypeScript module per resource domain, each exporting tool definitions and handlers
3. **UniFi client layer** — shared HTTP client handling API key auth, TLS (self-signed cert), and response normalization

## Configuration

All config via environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `UNIFI_HOST` | yes | — | UDM Pro IP or hostname |
| `UNIFI_API_KEY` | yes | — | UniFi OS API key |
| `UNIFI_SITE` | no | `default` | UniFi site name |
| `UNIFI_VERIFY_TLS` | no | `false` | Verify TLS cert (UDM Pro uses self-signed) |
| `MCP_PORT` | no | `3000` | Port the MCP server listens on |

Server refuses to start if `UNIFI_HOST` or `UNIFI_API_KEY` are missing.

## UniFi HTTP Client

- Base URL: `https://<UNIFI_HOST>/proxy/network/api/s/<UNIFI_SITE>/`
- API key sent as `X-API-Key` header on every request
- TLS verification off by default (UDM Pro self-signed cert); opt-in via `UNIFI_VERIFY_TLS=true`
- Response normalization: strips the UniFi `data[]` envelope, returns plain arrays/objects to tool handlers
- UniFi API errors (4xx/5xx) surfaced as descriptive MCP tool errors (not crashes)
- Network errors (unreachable host) surface clearly so Claude can distinguish "server down" from "bad data"

## Tool Inventory

### Firewall (fine-grained CRUD)
- `list_firewall_rules` — list all firewall rules, optionally filtered by ruleset
- `get_firewall_rule` — get a single rule by ID
- `create_firewall_rule` — create a new firewall rule
- `update_firewall_rule` — update an existing rule by ID
- `delete_firewall_rule` — delete a rule by ID
- `list_firewall_groups` — list IP/port groups used in rules
- `create_firewall_group` — create a new group
- `update_firewall_group` — update a group by ID
- `delete_firewall_group` — delete a group by ID

### Network Config (fine-grained CRUD)
- `list_networks` — list all networks/VLANs
- `get_network` — get a single network by ID
- `create_network` — create a new network
- `update_network` — update a network by ID
- `delete_network` — delete a network by ID

### Clients (fine-grained)
- `list_clients` — list active clients, optionally filtered by network or type
- `get_client` — get details for a single client by MAC
- `block_client` — block a client by MAC
- `unblock_client` — unblock a client by MAC
- `set_client_fixed_ip` — assign a fixed IP to a client

### Traffic Rules (fine-grained CRUD)
- `list_traffic_rules` — list all traffic management policies
- `create_traffic_rule` — create a new traffic rule
- `update_traffic_rule` — update a traffic rule by ID
- `delete_traffic_rule` — delete a traffic rule by ID

### Port Forwarding (fine-grained CRUD)
- `list_port_forwards` — list all port forward rules
- `create_port_forward` — create a new port forward
- `update_port_forward` — update a port forward by ID
- `delete_port_forward` — delete a port forward by ID

### Monitoring (higher-level reads)
- `get_site_stats` — bandwidth, connected device counts, uptime summary
- `get_device_health` — health status of UDM Pro and any managed APs/switches

### Security / Log Analysis (higher-level)
- `get_threat_events` — IDS/IPS alerts with optional time range and severity filter
- `get_network_events` — client/DHCP/admin events with filters
- `analyze_threats` — aggregates threat events into a summary: top source IPs, top threat categories, blocked vs alerted counts

## Error Handling

- All UniFi API errors are caught and returned as MCP tool errors with a descriptive message (never raw stack traces)
- Mutation tools (`create_*`, `update_*`, `delete_*`) log the operation and result to stdout for Docker log audit trail
- Missing required env vars cause immediate startup failure with a clear error message

## Project Structure

```
unifi-mcp-server/
├── src/
│   ├── index.ts              # entry point, starts MCP server
│   ├── server.ts             # MCP transport setup (Streamable HTTP)
│   ├── unifi/
│   │   └── client.ts         # shared UniFi HTTP client
│   └── tools/
│       ├── firewall.ts
│       ├── network.ts
│       ├── clients.ts
│       ├── traffic.ts
│       ├── ports.ts
│       ├── monitoring.ts
│       └── security.ts
├── tests/
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

## Docker

- Base image: `node:22-alpine`
- Runs as non-root user
- Config via `.env` file or environment variables
- Healthcheck endpoint: `GET /health` (returns 200 OK)
- `docker-compose.yml` with `restart: unless-stopped` for homelab reliability

## Testing

- **Unit tests:** each tool handler tested with mocked UniFi client responses — validates input schemas, response normalization, error handling
- **Integration tests:** opt-in via `TEST_INTEGRATION=true` env var, hits real UDM Pro — skipped in CI, run manually against homelab
- No MCP protocol end-to-end tests in v1

## Claude Code Setup

Add to Claude Code MCP config:
```json
{
  "mcpServers": {
    "unifi": {
      "type": "http",
      "url": "http://<homelab-ip>:<MCP_PORT>/mcp"
    }
  }
}
```
