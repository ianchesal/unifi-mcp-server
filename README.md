# UniFi MCP Server

MCP server for the UniFi UDM Pro API. Exposes firewall, network, client, traffic, port forwarding, and monitoring tools to Claude Code via Streamable HTTP transport.

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

Integration tests for mutation tools create objects prefixed with `mcp-test-` and delete them in teardown. Tests never operate on existing production objects.

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
