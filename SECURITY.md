# Security Policy

## Supported Versions

Only the latest release is supported with security fixes.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report vulnerabilities privately via [GitHub's private vulnerability reporting](https://github.com/ianchesal/unifi-mcp-server/security/advisories/new).

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any suggested remediation, if you have one

I'll acknowledge receipt within 7 days and aim to release a fix within 30 days for confirmed issues.

## Scope

This project runs on a private homelab network and is not intended for public internet exposure. The primary security concern is unauthorized access to the MCP endpoint — protect your `MCP_SECRET` and do not expose port 3000 to the internet.
