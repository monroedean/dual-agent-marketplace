# Dual Agent Plugin Marketplace (Claude Code + GitHub Copilot)

A working reference repository and step-by-step **How-To guide** for hosting a **single GitHub plugin marketplace** that works seamlessly with both **Claude Code** and **GitHub Copilot** (Copilot CLI and VS Code agent plugins).

---

## Why This Works

Both Claude Code and GitHub Copilot distribute plugins through Git repositories containing a catalog (`marketplace.json`) and per-plugin manifests (`plugin.json`), and both embrace shared primitives such as **Agent Skills (`SKILL.md`)** and **Model Context Protocol (MCP)** servers.

Where their conventions diverge—manifest file paths, hook JSON schemas, plugin root environment variables, and custom agent locations—each client ignores the other's directories. That lets you keep **one repository**, share the core logic (`skills/` and `scripts/`), and maintain thin, validated config wrappers for each client.

---

## Repository Structure

```text
dual-agent-marketplace/
├── .claude-plugin/
│   └── marketplace.json                        # Claude Code marketplace catalog
├── .github/
│   ├── plugin/
│   │   └── marketplace.json                    # GitHub Copilot marketplace catalog
│   └── workflows/
│       └── validate.yml                        # CI validation & hook smoke tests
├── scripts/
│   └── validate-marketplace.mjs                # Sync & schema validator (zero deps)
└── plugins/
    └── pr-hygiene/                             # Example dual-compatible plugin
        ├── plugin.json                         # Copilot (Agent Plugins 1.0 manifest)
        ├── .claude-plugin/
        │   └── plugin.json                     # Claude Code plugin manifest
        ├── skills/                             # SHARED (works identically in both)
        │   └── pr-review-checklist/
        │       └── SKILL.md
        ├── mcp.json                            # Copilot MCP config (${PLUGIN_ROOT})
        ├── .mcp.json                           # Claude Code MCP config (${CLAUDE_PLUGIN_ROOT})
        ├── agents/                             # Claude Code custom agents (*.md)
        │   └── pr-reviewer.md
        ├── hooks/                              # Claude Code hooks (PascalCase, strict keys)
        │   └── hooks.json
        ├── com.github.copilot/                 # Copilot-specific namespace
        │   ├── agents/
        │   │   └── pr-reviewer.agent.md        # Copilot custom agents (*.agent.md)
        │   └── hooks/
        │       └── hooks.json                  # Copilot hooks (version: 1, camelCase)
        └── scripts/                            # SHARED runtime scripts
            ├── guard-force-push.mjs            # Normalized hook script for both clients
            └── example-mcp-server.mjs          # Placeholder stdio MCP server
```

---

## How Users Install From Your Marketplace

Once you push this repository to GitHub (e.g., `your-org/dual-agent-marketplace`), users can install plugins from either tool:

### Claude Code

```bash
/plugin marketplace add your-org/dual-agent-marketplace
/plugin install pr-hygiene@dual-agent-marketplace
```

### GitHub Copilot CLI

```bash
copilot plugin marketplace add your-org/dual-agent-marketplace
copilot plugin install pr-hygiene@dual-agent-marketplace
```

### VS Code (GitHub Copilot)

Add your GitHub repository as an agent plugin marketplace in VS Code's Copilot plugin settings, then install `pr-hygiene` from the Extensions / Agent Plugins view.

---

## Step-by-Step How-To Guide

### Step 1: Add Both Marketplace Catalogs

Create two catalog files at the repo root that point to the exact same plugin folders:

1. **Claude Code:** `.claude-plugin/marketplace.json`
2. **GitHub Copilot:** `.github/plugin/marketplace.json`

Both require `name`, `owner.name`, and `plugins[]` (each with `name` and `source`). Keeping `name` identical in both catalogs guarantees users can reference `plugin-name@marketplace-name` consistently across tools.

> **Note:** Copilot CLI can fall back to `.claude-plugin/marketplace.json`, but providing `.github/plugin/marketplace.json` explicitly avoids ambiguity across Copilot CLI and VS Code.

---

### Step 2: Add Both Per-Plugin Manifests

Inside each plugin directory (e.g., `plugins/pr-hygiene/`), include:

| Client | File Path | Key Detail |
| :--- | :--- | :--- |
| **GitHub Copilot** (Agent Plugins 1.0) | `plugin.json` | Include `"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"` |
| **Claude Code** | `.claude-plugin/plugin.json` | Keep `name` and `version` identical to `plugin.json` |

---

### Step 3: Put Reusable Workflows in Shared `SKILL.md` Files

Put as much instructional behavior as possible into `skills/<skill-name>/SKILL.md` (see `plugins/pr-hygiene/skills/pr-review-checklist/SKILL.md`).

- Both Claude Code and GitHub Copilot load `SKILL.md` files natively under the open **Agent Skills** standard.
- Prefer skills over tool-specific slash-command formats whenever possible so you only write instructions once.

---

### Step 4: Configure MCP Servers for Both Clients

MCP server binaries/scripts are shared, but the config filename, wrapper key, and root path variable differ:

| Feature | Claude Code (`.mcp.json`) | GitHub Copilot (`mcp.json`) |
| :--- | :--- | :--- |
| **Filename** | `.mcp.json` (dot-prefixed) | `mcp.json` |
| **Top-level shape** | Map of server names directly (`{ "pr-notes": { ... } }`) | Wrapped under `"mcpServers"` + `"$schema"` |
| **Plugin root variable** | `${CLAUDE_PLUGIN_ROOT}` | `${PLUGIN_ROOT}` |

Point both configs at the same server command/script (see `plugins/pr-hygiene/.mcp.json` and `plugins/pr-hygiene/mcp.json`).

---

### Step 5: Define Custom Agents Per Client

Because custom agent filenames and tool frontmatter differ slightly, place them in each client's native folder:

- **Claude Code:** `agents/pr-reviewer.md` (e.g., `tools: Read, Grep, Glob, Bash`)
- **GitHub Copilot:** `com.github.copilot/agents/pr-reviewer.agent.md` (e.g., `tools: ["read", "search", "execute"]`)

Keep the core instructions in a shared `SKILL.md` and have both thin agent definitions reference that skill so prompts don't drift.

---

### Step 6: Share Hook Logic Behind Client-Specific `hooks.json` Files

Claude Code and Copilot hook configs are **not schema-compatible**:

| Feature | Claude Code (`hooks/hooks.json`) | Copilot (`com.github.copilot/hooks/hooks.json`) |
| :--- | :--- | :--- |
| **Top-level keys** | Strict (`hooks` only — no `version` or `$schema`) | Requires `"version": 1` alongside `"hooks"` |
| **Event casing** | PascalCase (`PreToolUse`, `PostToolUse`) | camelCase (`preToolUse`, `postToolUse`) |
| **Matchers** | Intermediate `{ "matcher": "Bash", "hooks": [...] }` | Hook objects directly under the event array |
| **Root variable** | `${CLAUDE_PLUGIN_ROOT}` | `${PLUGIN_ROOT}` |
| **Timeout key** | `"timeout"` (seconds) | `"timeoutSec"` (seconds) |
| **Blocking a tool call** | Exit with code `2` and print reason to `stderr` | Print `{"permissionDecision":"deny","permissionDecisionReason":"..."}` to `stdout` and exit `0` |

**Pattern to avoid duplication:** Keep the actual logic in a **single shared script** (see `plugins/pr-hygiene/scripts/guard-force-push.mjs`) that normalizes the stdin payload shape (`tool_input.command` vs. `toolArgs`) and responds using the calling client's protocol.

---

### Step 7: Automate Sync Validation in CI

Dual manifests drift easily if updated by hand. This repository includes:

- `scripts/validate-marketplace.mjs` — verifies JSON syntax, catalog parity, manifest version parity, `SKILL.md` / agent frontmatter, MCP server parity, and strict hook schemas.
- `.github/workflows/validate.yml` — runs the validator and smoke-tests the shared hook script against both Claude Code and Copilot payloads on every PR.

---

## Local Verification

Run the built-in validator:

```bash
node scripts/validate-marketplace.mjs
```

If you have the Claude Code CLI installed, you can also run its native validator:

```bash
claude plugin validate .
```

Test the shared force-push guard hook against both payload formats:

```bash
# Claude Code payload (exits with code 2 and writes reason to stderr)
echo '{"tool_name":"Bash","tool_input":{"command":"git push --force origin main"}}' \
  | node plugins/pr-hygiene/scripts/guard-force-push.mjs

# GitHub Copilot payload (prints deny JSON to stdout, exits 0)
echo '{"toolName":"bash","toolArgs":"{\"command\":\"git push -f origin main\"}"}' \
  | node plugins/pr-hygiene/scripts/guard-force-push.mjs

# Safe command (exits 0 with no output)
echo '{"tool_name":"Bash","tool_input":{"command":"git push origin feat/docs"}}' \
  | node plugins/pr-hygiene/scripts/guard-force-push.mjs
```

---

## Adapting This Template for Your Team

1. Fork or copy this directory into a new GitHub repository.
2. Replace `dual-agent-marketplace`, `Example Engineering Team`, and `your-org` in `.claude-plugin/marketplace.json` and `.github/plugin/marketplace.json`.
3. Duplicate `plugins/pr-hygiene/` for each plugin you want to publish, or replace it with your own plugin.
4. Run `node scripts/validate-marketplace.mjs` before pushing.
