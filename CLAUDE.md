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

## Cutting a release

Releases are tag-driven. Pushing a `v*` tag to GitHub triggers `.github/workflows/release.yml`, which:
- Builds and pushes a Docker image to `ghcr.io/ianchesal/unifi-mcp-server` (tagged `latest`, `{major}.{minor}`, and `{version}`)
- Makes the container package public
- Creates a GitHub Release with auto-generated notes

**Steps to release:**

1. Ensure all changes are merged to `main` and CI is green.
2. Decide the new version (follows semver: `MAJOR.MINOR.PATCH`).
3. Update `"version"` in `package.json` to the new version.
4. Commit: `git commit -m "chore: release v{version}" package.json`
5. Tag: `git tag v{version}`
6. Push both: `git push origin main && git push origin v{version}`

The release workflow fires automatically on the tag push. No manual Docker build or GitHub Release creation needed.
