#!/usr/bin/env node
/**
 * Validates that the Claude Code and GitHub Copilot marketplace catalogs,
 * per-plugin manifests, skills, MCP configs, and hook files are valid and in sync.
 *
 * Zero external dependencies — runs with Node 18+.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const errors = [];
const checks = [];

function fail(msg) {
  errors.push(msg);
}

function pass(msg) {
  checks.push(msg);
}

function readJson(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    fail(`Missing required file: ${relPath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (err) {
    fail(`Invalid JSON in ${relPath}: ${err.message}`);
    return null;
  }
}

function checkFrontmatter(relPath, requiredKeys) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    fail(`Missing file: ${relPath}`);
    return;
  }
  const content = fs.readFileSync(fullPath, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    fail(`${relPath} is missing YAML frontmatter (--- ... ---)`);
    return;
  }
  const frontmatter = match[1];
  for (const key of requiredKeys) {
    const keyRegex = new RegExp(`^${key}:\\s*.+`, "m");
    if (!keyRegex.test(frontmatter)) {
      fail(`${relPath} frontmatter is missing required key "${key}"`);
    }
  }
}

// 1. Validate both marketplace catalogs exist and stay in sync
const claudeCatalog = readJson(".claude-plugin/marketplace.json");
const copilotCatalog = readJson(".github/plugin/marketplace.json");

if (claudeCatalog && copilotCatalog) {
  if (!claudeCatalog.name || !copilotCatalog.name) {
    fail("Both marketplace.json files must define a non-empty 'name'.");
  } else if (claudeCatalog.name !== copilotCatalog.name) {
    fail(
      `Marketplace name mismatch: Claude="${claudeCatalog.name}" vs Copilot="${copilotCatalog.name}"`
    );
  } else {
    pass(`Marketplace name in sync: "${claudeCatalog.name}"`);
  }

  if (!claudeCatalog.owner?.name || !copilotCatalog.owner?.name) {
    fail("Both marketplace.json files must define 'owner.name'.");
  } else if (claudeCatalog.owner.name !== copilotCatalog.owner.name) {
    fail(
      `Marketplace owner.name mismatch: Claude="${claudeCatalog.owner.name}" vs Copilot="${copilotCatalog.owner.name}"`
    );
  }

  const claudePlugins = Array.isArray(claudeCatalog.plugins)
    ? claudeCatalog.plugins
    : [];
  const copilotPlugins = Array.isArray(copilotCatalog.plugins)
    ? copilotCatalog.plugins
    : [];

  if (claudePlugins.length === 0 || copilotPlugins.length === 0) {
    fail("Both marketplace catalogs must list at least one plugin.");
  }

  const claudeMap = new Map(claudePlugins.map((p) => [p.name, p]));
  const copilotMap = new Map(copilotPlugins.map((p) => [p.name, p]));

  for (const name of new Set([...claudeMap.keys(), ...copilotMap.keys()])) {
    const c = claudeMap.get(name);
    const g = copilotMap.get(name);
    if (!c) {
      fail(`Plugin "${name}" is in .github/plugin/marketplace.json but missing from .claude-plugin/marketplace.json`);
      continue;
    }
    if (!g) {
      fail(`Plugin "${name}" is in .claude-plugin/marketplace.json but missing from .github/plugin/marketplace.json`);
      continue;
    }
    if (c.version !== g.version) {
      fail(`Plugin "${name}" version mismatch across catalogs: Claude=${c.version} vs Copilot=${g.version}`);
    }
    if (JSON.stringify(c.source) !== JSON.stringify(g.source)) {
      fail(`Plugin "${name}" source mismatch across catalogs.`);
    }

    // 2. Validate local plugin directories
    if (typeof c.source === "string") {
      const pluginDir = path.normalize(c.source);
      const copilotManifestRel = path.join(pluginDir, "plugin.json");
      const claudeManifestRel = path.join(pluginDir, ".claude-plugin", "plugin.json");

      const copilotManifest = readJson(copilotManifestRel);
      const claudeManifest = readJson(claudeManifestRel);

      if (copilotManifest && claudeManifest) {
        if (copilotManifest.name !== name || claudeManifest.name !== name) {
          fail(
            `Plugin "${name}" manifest names must match catalog entry (got Copilot="${copilotManifest.name}", Claude="${claudeManifest.name}").`
          );
        }
        if (copilotManifest.version !== claudeManifest.version) {
          fail(
            `Plugin "${name}" manifest version mismatch: plugin.json=${copilotManifest.version} vs .claude-plugin/plugin.json=${claudeManifest.version}`
          );
        }
        if (c.version && copilotManifest.version !== c.version) {
          fail(
            `Plugin "${name}" catalog version (${c.version}) does not match plugin.json (${copilotManifest.version}).`
          );
        }
        if (!copilotManifest.$schema) {
          fail(`${copilotManifestRel} should declare "$schema" for Agent Plugins 1.0 compliance.`);
        }
        pass(`Plugin "${name}" dual manifests valid and in sync (v${copilotManifest.version})`);
      }

      // 3. Validate shared skills
      const skillsDir = path.join(ROOT, pluginDir, "skills");
      if (fs.existsSync(skillsDir)) {
        const skillDirs = fs
          .readdirSync(skillsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory());
        for (const d of skillDirs) {
          const skillMdRel = path.join(pluginDir, "skills", d.name, "SKILL.md");
          checkFrontmatter(skillMdRel, ["name", "description"]);
          pass(`Shared skill validated: ${skillMdRel}`);
        }
      }

      // 4. Validate MCP configs (if present)
      const claudeMcpRel = path.join(pluginDir, ".mcp.json");
      const copilotMcpRel = path.join(pluginDir, "mcp.json");
      const hasClaudeMcp = fs.existsSync(path.join(ROOT, claudeMcpRel));
      const hasCopilotMcp = fs.existsSync(path.join(ROOT, copilotMcpRel));
      if (hasClaudeMcp !== hasCopilotMcp) {
        fail(
          `Plugin "${name}" defines only one MCP config (.mcp.json=${hasClaudeMcp}, mcp.json=${hasCopilotMcp}). Provide both for dual compatibility.`
        );
      } else if (hasClaudeMcp && hasCopilotMcp) {
        const cMcp = readJson(claudeMcpRel);
        const gMcp = readJson(copilotMcpRel);
        if (gMcp && !gMcp.mcpServers) {
          fail(`${copilotMcpRel} must wrap servers under top-level "mcpServers".`);
        }
        if (cMcp && gMcp?.mcpServers) {
          const cKeys = Object.keys(cMcp).sort().join(",");
          const gKeys = Object.keys(gMcp.mcpServers).sort().join(",");
          if (cKeys !== gKeys) {
            fail(
              `Plugin "${name}" MCP server names differ between .mcp.json (${cKeys}) and mcp.json (${gKeys}).`
            );
          } else {
            pass(`Plugin "${name}" MCP configs valid and in sync (${cKeys})`);
          }
        }
      }

      // 5. Validate Claude hooks strict schema (if present)
      const claudeHooksRel = path.join(pluginDir, "hooks", "hooks.json");
      if (fs.existsSync(path.join(ROOT, claudeHooksRel))) {
        const ch = readJson(claudeHooksRel);
        if (ch) {
          const allowedTopKeys = new Set(["hooks", "description"]);
          for (const k of Object.keys(ch)) {
            if (!allowedTopKeys.has(k)) {
              fail(
                `${claudeHooksRel} contains unsupported top-level key "${k}" (Claude Code strictly validates hooks.json).`
              );
            }
          }
          if (!ch.hooks || typeof ch.hooks !== "object") {
            fail(`${claudeHooksRel} must contain a top-level "hooks" object.`);
          } else {
            pass(`Claude Code hooks valid: ${claudeHooksRel}`);
          }
        }
      }

      // 6. Validate Copilot hooks schema (if present)
      const copilotHooksRel = path.join(
        pluginDir,
        "com.github.copilot",
        "hooks",
        "hooks.json"
      );
      if (fs.existsSync(path.join(ROOT, copilotHooksRel))) {
        const gh = readJson(copilotHooksRel);
        if (gh) {
          if (gh.version !== 1) {
            fail(`${copilotHooksRel} must specify "version": 1.`);
          }
          if (!gh.hooks || typeof gh.hooks !== "object") {
            fail(`${copilotHooksRel} must contain a top-level "hooks" object.`);
          } else {
            pass(`GitHub Copilot hooks valid: ${copilotHooksRel}`);
          }
        }
      }

      // 7. Validate agents frontmatter
      const claudeAgentsDir = path.join(ROOT, pluginDir, "agents");
      if (fs.existsSync(claudeAgentsDir)) {
        for (const f of fs.readdirSync(claudeAgentsDir)) {
          if (f.endsWith(".md")) {
            const rel = path.join(pluginDir, "agents", f);
            checkFrontmatter(rel, ["name", "description"]);
            pass(`Claude Code agent validated: ${rel}`);
          }
        }
      }

      const copilotAgentsDir = path.join(
        ROOT,
        pluginDir,
        "com.github.copilot",
        "agents"
      );
      if (fs.existsSync(copilotAgentsDir)) {
        for (const f of fs.readdirSync(copilotAgentsDir)) {
          if (f.endsWith(".agent.md")) {
            const rel = path.join(pluginDir, "com.github.copilot", "agents", f);
            checkFrontmatter(rel, ["name", "description"]);
            pass(`GitHub Copilot agent validated: ${rel}`);
          }
        }
      }
    }
  }
}

for (const msg of checks) {
  console.log(`✓ ${msg}`);
}

if (errors.length > 0) {
  console.error("\nValidation failed:");
  for (const err of errors) {
    console.error(`✗ ${err}`);
  }
  process.exit(1);
}

console.log(`\nAll ${checks.length} checks passed.`);
