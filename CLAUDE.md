# UniFi MCP Server

MCP server exposing UniFi UDM Pro management tools over Streamable HTTP transport. Built with TypeScript, Fastify, and the MCP SDK.

## Commands

```bash
npm test                    # unit tests (vitest)
TEST_INTEGRATION=true npm test  # unit + integration tests (requires real UDM Pro via .env)
npm run dev                 # watch mode (requires .env)
docker compose up -d        # production run
```

## Architecture

- `src/server.ts` — Fastify server + MCP endpoint, Bearer auth via `MCP_SECRET`
- `src/unifi/client.ts` — UniFi API client (v1: `/proxy/network/api/s/{site}/`, v2: `/proxy/network/v2/api/site/{site}/`)
- `src/tools/` — one file per domain, each exports a `register*Tools(server, client)` function
- `src/tools/index.ts` — wires all tool registrations together
- `src/config.ts` — env var parsing and validation

## Tools by domain

| File | Tools |
|---|---|
| `firewall.ts` | list/get/create/update/delete rules + groups |
| `network.ts` | list/get/create/update/delete networks |
| `clients.ts` | list/get/block/unblock + fixed IP management |
| `traffic.ts` | list/create/update/delete traffic rules (v2 API) |
| `ports.ts` | list/create/update/delete port forwards |
| `monitoring.ts` | get_site_stats, get_device_health |
| `security.ts` | get_network_events |

## Known API limitations

**IPS/IDS events are not available.** The UniFi Network Local API (v10.x) does not expose IPS/IDS threat events. The `stat/ips/event` endpoint was removed in firmware 10.x and no replacement has been documented. `get_threat_events` and `analyze_threats` were removed from this server because they cannot work.

## Integration tests

Integration tests use a real UDM Pro. Mutation tests create objects prefixed `mcp-test-` and delete them in `afterAll`. They never touch production objects.
