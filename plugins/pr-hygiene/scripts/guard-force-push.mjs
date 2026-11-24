#!/usr/bin/env node
/**
 * Shared PreToolUse / preToolUse hook script for BOTH Claude Code and GitHub Copilot.
 *
 * Blocks destructive `git push --force` / `git push -f` commands targeting main/master.
 * Demonstrates how a single script can normalize payload differences between clients:
 *   - Claude Code sends `{ tool_name, tool_input: { command } }` on stdin and blocks on exit code 2 (stderr shown to model).
 *   - GitHub Copilot sends `{ toolName, toolArgs }` (where toolArgs may be a JSON string or object) and supports JSON deny responses on stdout.
 */

import fs from "node:fs";

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8").trim();
  } catch {
    return "";
  }
}

function extractCommand(payload) {
  if (!payload || typeof payload !== "object") return "";

  // Claude Code shape: { tool_name: "Bash", tool_input: { command: "..." } }
  if (payload.tool_input && typeof payload.tool_input.command === "string") {
    return payload.tool_input.command;
  }

  // GitHub Copilot shape: { toolName: "bash", toolArgs: "{\"command\":\"...\"}" | { command: "..." } }
  if (payload.toolArgs) {
    let args = payload.toolArgs;
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        return args;
      }
    }
    if (args && typeof args.command === "string") {
      return args.command;
    }
  }

  // Fallback for direct invocation / testing
  if (typeof payload.command === "string") {
    return payload.command;
  }

  return "";
}

function isProtectedForcePush(command) {
  if (!command) return false;
  const hasGitPush = /\bgit\s+push\b/i.test(command);
  const hasForce = /(?:^|\s)(--force(?!-with-lease)|-f)(?:\s|$)/i.test(command);
  const targetsProtected = /\b(main|master)\b/i.test(command);
  return hasGitPush && hasForce && targetsProtected;
}

const raw = readStdin();
if (!raw) {
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const command = extractCommand(payload);

if (isProtectedForcePush(command)) {
  const reason =
    "Blocked by pr-hygiene hook: force-pushing directly to main/master is not allowed. Use a feature branch or --force-with-lease on a non-protected branch.";

  const isCopilotShape = "toolName" in payload || "toolArgs" in payload;

  if (isCopilotShape) {
    // GitHub Copilot hooks read structured permissionDecision JSON from stdout
    process.stdout.write(
      JSON.stringify({
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      }) + "\n"
    );
    process.exit(0);
  }

  // Claude Code blocks PreToolUse when exiting with code 2 and forwards stderr as feedback
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

process.exit(0);
