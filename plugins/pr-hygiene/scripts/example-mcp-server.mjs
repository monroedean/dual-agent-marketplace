#!/usr/bin/env node
/**
 * Minimal placeholder stdio MCP server script.
 *
 * Replace this with your real MCP server (using `@modelcontextprotocol/sdk` or any MCP runtime).
 * Both `.mcp.json` (Claude Code) and `mcp.json` (GitHub Copilot / Agent Plugins 1.0) point here,
 * passing their respective plugin root variables (`${CLAUDE_PLUGIN_ROOT}` vs `${PLUGIN_ROOT}`).
 */

const mode = process.env.PR_HYGIENE_MODE || "unknown";

process.stderr.write(
  `[pr-notes example MCP server] started in "${mode}" mode. Replace this stub with a real MCP server implementation.\n`
);
