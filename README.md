# UniFi MCP Server

MCP server for the UniFi UDM Pro API. Exposes firewall, network, client, traffic, port forwarding, and monitoring tools to Claude Code via Streamable HTTP transport.

## Why this exists

This is the first of three companion projects for running an LLM against a
UDM Pro:

- **`unifi-mcp-server`** (this project) — exposes the UniFi Network API
  (firewall rules, networks, clients, traffic rules, port forwarding,
  monitoring) as MCP tools.
- [`unifi-siem-sink`](https://github.com/ianchesal/unifi-siem-sink) —
  listens for UniFi's SIEM/syslog export and stores IPS/IDS and
  Security-category events (the one thing the Network API doesn't expose)
  in SQLite, queryable over MCP.
- [`unifi-siem-lens`](https://github.com/ianchesal/unifi-siem-lens) — sits
  on top of `unifi-siem-sink`'s event store, running scheduled,
  code-driven heuristics (new signature/source-IP detection,
  internal-source flagging, repeat-offender tracking, statistical anomaly
  detection) against the event history and rendering trends and findings
  on a dashboard, with a one-click handoff to a Claude Code session for
  deeper analysis.

Run all three and an LLM gets full visibility into the network (via this
project), full visibility into the security event stream (via
`unifi-siem-sink`), and a standing analyst that's already triaged the noise
before you ever open a chat (via `unifi-siem-lens`).

## Quick Start (Official Docker Image)

No repo clone needed — pull the published image directly from the GitHub Container Registry.

### 1. Generate an API key on your UDM Pro

UniFi OS → Settings → Control Plane → API → Create API Key

### 2. Create a `.env` file

```bash
UNIFI_HOST=<your-udm-pro-ip>
UNIFI_API_KEY=<your-api-key>
MCP_SECRET=<choose-a-strong-secret>
```

### 3. Run the container

```bash
docker run -d \
  --name unifi-mcp \
  --env-file .env \
  -p 3000:3000 \
  ghcr.io/ianchesal/unifi-mcp-server:latest
```

### 4. Add to Claude Code

In your Claude Code MCP config (project `.mcp.json` or via `/mcp add` in Claude Code):

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

## Tools

| Domain | Tools |
|---|---|
| Firewall | list/get/create/update/delete rules + groups |
| Networks | list/get/create/update/delete networks (delete requires confirm_name) |
| Clients | list/get/block/unblock + fixed IP management |
| Traffic Rules | list/create/update/delete (UniFi v2 API) |
| Port Forwarding | list/create/update/delete |
| Monitoring | site stats, device health |
| Security | get_network_events |

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `UNIFI_HOST` | yes | — | UDM Pro IP or hostname |
| `UNIFI_API_KEY` | yes | — | UniFi OS API key |
| `MCP_SECRET` | yes | — | Bearer token for MCP endpoint auth |
| `UNIFI_SITE` | no | `default` | UniFi site name |
| `UNIFI_VERIFY_TLS` | no | `false` | Verify TLS cert (UDM Pro uses self-signed) |
| `UNIFI_REQUEST_TIMEOUT_MS` | no | `10000` | Timeout for UniFi API requests (ms) |
| `MCP_PORT` | no | `3000` | Port the server listens on |
| `MCP_HOST` | no | `0.0.0.0` | Interface the server binds to |
| `LOG_LEVEL` | no | `info` | `error` \| `warn` \| `info` \| `debug` |

---

## Development (Running from a Repo Clone)

### Setup

```bash
git clone https://github.com/ianchesal/unifi-mcp-server
cd unifi-mcp-server
cp .env.example .env
# Edit .env with your UDM Pro IP, API key, and a strong MCP_SECRET
```

### Run with Docker Compose

```bash
docker compose up -d
```

### Run locally

```bash
npm install
npm test          # run unit tests
npm run dev       # run with --watch (requires .env)
```

### Integration tests (requires real UDM Pro)

```bash
TEST_INTEGRATION=true npm test
```

Integration tests for mutation tools create objects prefixed with `mcp-test-` and delete them in teardown. Tests never operate on existing production objects.
