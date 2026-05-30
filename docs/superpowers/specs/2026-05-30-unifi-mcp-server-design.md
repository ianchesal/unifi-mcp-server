# UniFi MCP Server — Design Spec

**Date:** 2026-05-30
**Status:** Approved (rev 2 — post spec review)

## Overview

A TypeScript MCP server that runs in Docker on a homelab and exposes the UniFi UDM Pro's local API to Claude Code sessions. Enables AI-assisted management of firewall rules, network config, clients, traffic rules, port forwarding, and security log analysis.

## Target Environment

- **UDM Pro OS:** UniFi OS 5.1.12
- **Network Application:** 10.4.56 (spec pinned to this version)
- **API surface:** UniFi OS API at `https://<udm-ip>/proxy/network/api/` and `/proxy/network/v2/api/` (see API Base URLs below)
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
│  POST /mcp              │
│  GET  /health           │
│  GET  /ready            │
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

1. **MCP transport layer** — accepts Streamable HTTP connections from Claude Code, routes tool calls inward, streams results back via `POST /mcp`; validates `MCP_SECRET` bearer token on all requests
2. **Tool layer** — one TypeScript module per resource domain, each exporting tool definitions and handlers
3. **UniFi client layer** — shared HTTP client handling API key auth, TLS (self-signed cert), `meta.rc` validation, and response normalization

## Configuration

All config via environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `UNIFI_HOST` | yes | — | UDM Pro IP or hostname |
| `UNIFI_API_KEY` | yes | — | UniFi OS API key |
| `MCP_SECRET` | yes | — | Bearer token required on all MCP requests |
| `UNIFI_SITE` | no | `default` | UniFi site name |
| `UNIFI_VERIFY_TLS` | no | `false` | Verify TLS cert (UDM Pro uses self-signed) |
| `UNIFI_REQUEST_TIMEOUT_MS` | no | `10000` | Timeout for UniFi API requests in ms |
| `MCP_PORT` | no | `3000` | Port the MCP server listens on |
| `MCP_HOST` | no | `0.0.0.0` | Interface the MCP server binds to |
| `LOG_LEVEL` | no | `info` | Log verbosity: `error` \| `warn` \| `info` \| `debug` |

Server refuses to start if `UNIFI_HOST`, `UNIFI_API_KEY`, or `MCP_SECRET` are missing.

Claude Code config must include the secret:
```json
{
  "mcpServers": {
    "unifi": {
      "type": "http",
      "url": "http://<homelab-ip>:<MCP_PORT>/mcp",
      "headers": { "Authorization": "Bearer <MCP_SECRET>" }
    }
  }
}
```

## API Base URLs

Network Application 10.x split endpoints across two base paths. The client must use the correct one per resource type:

| Base URL | Used for |
|---|---|
| `/proxy/network/api/s/<site>/` | Firewall rules, firewall groups, networks, clients, port forwarding, stats |
| `/proxy/network/v2/api/site/<site>/` | Traffic rules |

If a tool call hits a 404, the client surfaces a clear error rather than silently returning empty results. This spec is pinned to Network 10.4.56; API incompatibilities after firmware updates will surface as tool errors and require a spec revision.

## UniFi HTTP Client

- API key sent as `X-API-Key` header on every request
- TLS verification off by default (UDM Pro self-signed cert); opt-in via `UNIFI_VERIFY_TLS=true`
- All requests use `AbortController` with `UNIFI_REQUEST_TIMEOUT_MS` timeout
- **Response validation:** check `meta.rc === "ok"` before extracting `data[]`; when `rc !== "ok"`, map `meta.msg` to a descriptive MCP tool error
- Response normalization: strips the `data[]` envelope, returns plain arrays/objects to tool handlers
- HTTP 4xx/5xx errors surfaced as descriptive MCP tool errors (not crashes)
- Network errors (unreachable host, timeout) surface clearly so Claude can distinguish "server down" from "bad data"

## Tool Inventory

All `list_*` tools accept:
- `limit` (integer, default: 100, max: 500) — caps the number of results returned
- Response always includes a `total` count so Claude can tell if results were truncated

All `update_*` tool handlers follow a read-before-write pattern: fetch the current object, merge provided fields, PUT the merged result. The UniFi API uses full-object PUT semantics; partial updates will zero out unspecified fields.

### Firewall (fine-grained CRUD)
- `list_firewall_rules` — list all firewall rules, optionally filtered by ruleset; supports `limit`
- `get_firewall_rule` — get a single rule by ID
- `create_firewall_rule` — create a new firewall rule
- `update_firewall_rule` — update an existing rule by ID (read-before-write)
- `delete_firewall_rule` — delete a rule by ID
- `list_firewall_groups` — list IP/port groups used in rules; supports `limit`
- `create_firewall_group` — create a new group
- `update_firewall_group` — update a group by ID (read-before-write)
- `delete_firewall_group` — delete a group by ID

### Network Config (fine-grained CRUD)
- `list_networks` — list all networks/VLANs; supports `limit`
- `get_network` — get a single network by ID
- `create_network` — create a new network
- `update_network` — update a network by ID (read-before-write)
- `delete_network` — delete a network by ID; requires `confirm_name` param matching the network's name exactly — this prevents accidental deletion and ensures intent is unambiguous, since deleting a network disconnects all devices on it

### Clients (fine-grained)
- `list_clients` — list clients; supports `limit`, `include_offline: boolean` (default: `false`; when true, queries the stat endpoint to include recently-seen offline clients)
- `get_client` — get details for a single client by MAC
- `block_client` — block a client by MAC
- `unblock_client` — unblock a client by MAC
- `set_client_fixed_ip` — assign a fixed IP to a client
- `remove_client_fixed_ip` — clear the fixed IP assignment for a client

### Traffic Rules (fine-grained CRUD)
Uses `/proxy/network/v2/api/` base URL.
- `list_traffic_rules` — list all traffic management policies; supports `limit`
- `create_traffic_rule` — create a new traffic rule
- `update_traffic_rule` — update a traffic rule by ID (read-before-write)
- `delete_traffic_rule` — delete a traffic rule by ID

### Port Forwarding (fine-grained CRUD)
- `list_port_forwards` — list all port forward rules; supports `limit`
- `create_port_forward` — create a new port forward
- `update_port_forward` — update a port forward by ID (read-before-write)
- `delete_port_forward` — delete a port forward by ID

### Monitoring (higher-level reads)
- `get_site_stats` — bandwidth, connected device counts, uptime summary
- `get_device_health` — health status of UDM Pro and any managed APs/switches

### Security / Log Analysis (higher-level)
- `get_threat_events` — IDS/IPS alerts with optional time range and severity filter; supports `limit`
- `get_network_events` — client/DHCP/admin events with filters; supports `limit`
- `analyze_threats` — aggregates threat events and returns a structured summary. Specifically: top 10 source IPs by event count, top 10 threat categories by event count, total blocked vs. alerted counts, and time range of events analyzed. Raw event data is not dropped — the full event list is included alongside the aggregates so Claude can do additional reasoning. Accepts the same time range and severity filters as `get_threat_events`.

### Out of Scope for v1
- **WiFi / SSID management** — creating/editing wireless networks, passwords, band steering, per-SSID VLAN assignments
- **VPN management** — site-to-site VPN, client VPN config

Both are natural v2 additions once the core tool surface is stable.

## MCP Server Authentication

All requests to `POST /mcp` must include `Authorization: Bearer <MCP_SECRET>`. Requests without a valid secret return HTTP 401. This protects mutation tools from any other process on the LAN reaching the server.

## Error Handling

- All UniFi API errors (HTTP or `meta.rc`) are caught and returned as MCP tool errors with a descriptive message (never raw stack traces)
- Mutation tools (`create_*`, `update_*`, `delete_*`) log the operation and result to stdout at `info` level for Docker log audit trail
- Read tool request/response details logged at `debug` level
- Missing required env vars cause immediate startup failure with a clear error message
- Timeout errors identify themselves as such so Claude can distinguish a slow UDM from a missing one

## Health & Readiness Endpoints

- `GET /health` — liveness check; returns 200 if the HTTP server is alive. Does **not** probe the UniFi API (avoids health flaps during UDM reboots).
- `GET /ready` — readiness check; makes a lightweight probe to the UniFi API (e.g., `GET /api/s/default/stat/sysinfo`); returns 200 if reachable, 503 if not. Optional; intended for manual use to verify connectivity.

## Project Structure

```
unifi-mcp-server/
├── src/
│   ├── index.ts              # entry point, starts MCP server
│   ├── server.ts             # MCP transport setup (Streamable HTTP) + auth middleware
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
- Healthcheck uses `GET /health`
- `docker-compose.yml` with `restart: unless-stopped` for homelab reliability

## Testing

- **Framework:** Vitest (fast, native TypeScript, no separate ts-jest config needed)
- **Unit tests:** each tool handler tested with mocked UniFi client responses — validates input schemas, response normalization, `meta.rc` error handling, timeout handling
- **Integration tests:** opt-in via `TEST_INTEGRATION=true` env var, hits real UDM Pro — skipped in CI, run manually against homelab. Mutation tests (create/update/delete) create objects with a `mcp-test-` name prefix, assert on them, then delete in teardown. Tests never operate on existing production objects.
- No MCP protocol end-to-end tests in v1

## Key Dependencies

- `@modelcontextprotocol/sdk` — official MCP TypeScript SDK (Streamable HTTP transport)
- native `fetch` (Node 22 built-in) — UniFi HTTP client
- `zod` — tool input schema validation
- `vitest` — test framework
