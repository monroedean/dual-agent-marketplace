#!/usr/bin/env node
/**
 * Minimal zero-dependency stdio MCP server (JSON-RPC 2.0, newline-delimited JSON).
 *
 * Shared by both `.mcp.json` (Claude Code) and `mcp.json` (GitHub Copilot / VS Code),
 * receiving `${CLAUDE_PLUGIN_ROOT}` or `${PLUGIN_ROOT}` respectively.
 *
 * Implements the MCP lifecycle (`initialize`, `notifications/initialized`, `ping`)
 * and exposes a single `pr_hygiene_checklist` tool so all three clients complete
 * the MCP handshake cleanly out of the box.
 */

import readline from "node:readline";

const MODE = process.env.PR_HYGIENE_MODE || "unknown";
const SERVER_INFO = { name: "pr-notes", version: "1.0.0" };

const TOOLS = [
  {
    name: "pr_hygiene_checklist",
    description:
      "Return the standard PR hygiene checklist items and the active host client mode.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function handleRequest(msg) {
  const { id, method, params } = msg;

  // Notifications have no id and expect no response
  if (id === undefined || id === null) {
    return;
  }

  switch (method) {
    case "initialize": {
      const protocolVersion =
        (params && typeof params.protocolVersion === "string"
          ? params.protocolVersion
          : null) || "2024-11-05";
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: {
            tools: {},
          },
          serverInfo: SERVER_INFO,
        },
      });
      return;
    }

    case "ping": {
      send({ jsonrpc: "2.0", id, result: {} });
      return;
    }

    case "tools/list": {
      send({
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      });
      return;
    }

    case "tools/call": {
      const toolName = params?.name;
      if (toolName === "pr_hygiene_checklist") {
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    mode: MODE,
                    checklist: [
                      "Diff is focused and free of debug logs or secrets",
                      "Edge cases and error paths are handled",
                      "Automated tests cover new behavior and failure paths",
                      "No unreviewed force-pushes to main/master",
                    ],
                  },
                  null,
                  2
                ),
              },
            ],
          },
        });
        return;
      }

      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: `Unknown tool: ${toolName}` },
      });
      return;
    }

    default: {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    }
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const msg = JSON.parse(trimmed);
    handleRequest(msg);
  } catch {
    // Ignore malformed lines rather than crashing the stdio transport
  }
});

rl.on("close", () => {
  process.exit(0);
});
