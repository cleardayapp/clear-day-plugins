#!/usr/bin/env node
// Structural validator for the directors and parents plugins. Plain Node, no dependencies.
// Usage: node scripts/validate.mjs [repoRoot]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ROOT,
  PLUGINS,
  isText,
  parseFrontmatter,
  readGuardrails,
  readJson,
  readText,
  skillFiles,
  walk,
  walkDirs,
} from "./lib.mjs";

export const LIMITS = {
  skillNameChars: 64,
  skillDescriptionChars: 1024,
  skillLines: 500, // SKILL.md must be strictly under this
  displayNameChars: 30,
  shortDescriptionChars: 30,
  starterPrompts: 3,
  starterPromptChars: 128,
  iconMinPx: 48,
  fileBytes: 256 * 1024,
  pluginFiles: 512,
  repoBytes: 50 * 1024 * 1024,
  readmeWords: 40,
  capabilities: 20,
  capabilityChars: 120,
};

export const REPOSITORY_URL = "https://github.com/cleardayapp/clear-day-plugins";
export const MARKETPLACE_NAME = "clear-day";
const MARKETPLACE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// Names Claude Code reserves for marketplaces, copied from https://code.claude.com/docs/en/plugins/marketplace-reference#reserved-names. Re-check when that page changes.
const RESERVED_MARKETPLACE_NAMES = new Set([
  "inline", "builtin", "skills-dir", "synced", "claude-plugin-test", "npm", "pip", "uv", "cargo", "github", "gh",
  "claude-code-marketplace", "claude-code-plugins", "claude-plugins-official", "anthropic-marketplace",
  "anthropic-plugins", "agent-skills", "anthropic-agent-skills", "life-sciences", "knowledge-work-plugins",
  "claude-for-legal", "claude-for-financial-services", "financial-services-plugins", "first-party-plugins",
  "claude-tag-plugins", "claude-community", "claude-plugins-community", "healthcare",
  "anthropic-plugin-directory", "claude-plugin-directory",
]);
// Categories OpenAI accepts for interface.category, from https://developers.openai.com/plugins/deploy/submission-errors (error plugin_category_unknown). Re-check when that page changes.
export const OPENAI_CATEGORIES = [
  "Productivity", "Creativity", "Developer Tools", "Business & Operations", "Data & Analytics", "Communication",
  "Education & Research", "Security", "Finance", "Healthcare", "Travel", "Entertainment", "Other",
];
export const PRIVACY_POLICY_URL = "https://useclearday.com/privacy-policy";
const RULES_HEADING = "## Rules that apply every time";
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TOOLS_USED = /^Tools used: (none|[a-z][a-z0-9_]*(, [a-z][a-z0-9_]*)*)$/;

function pngSize(file) {
  const buf = fs.readFileSync(file);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function validateMarketplace(root, err) {
  const file = path.join(root, ".claude-plugin", "marketplace.json");
  const mj = fs.existsSync(file) ? readJson(file) : { error: "missing" };
  if (mj.error) return err("marketplace-json", file, mj.error);
  const m = mj.value;
  if (typeof m.name !== "string" || !MARKETPLACE_NAME_RE.test(m.name) || m.name.includes("..")) {
    err("marketplace-name", file, `name ${JSON.stringify(m.name)} may use only letters, digits, ".", "_" and "-"`);
  } else if (RESERVED_MARKETPLACE_NAMES.has(m.name.toLowerCase()) || /^claudeai-/i.test(m.name)) {
    err("marketplace-name", file, `name ${m.name} is reserved`);
  } else if (m.name !== MARKETPLACE_NAME) {
    err("marketplace-name", file, `name must be ${MARKETPLACE_NAME}, got ${m.name}`);
  }
  if (typeof m.owner?.name !== "string" || !m.owner.name) err("marketplace-owner", file, "owner.name missing");
  if (typeof m.description !== "string" || !m.description) err("marketplace-description", file, "description missing");
  if (!Array.isArray(m.plugins)) return err("marketplace-plugins", file, "plugins must be an array");
  const seen = new Set();
  for (const [slug, spec] of Object.entries(PLUGINS)) {
    const entries = m.plugins.filter((p) => p?.name === spec.name);
    if (entries.length !== 1) {
      err("marketplace-plugins", file, `expected exactly one entry named ${spec.name}, found ${entries.length}`);
      continue;
    }
    const [entry] = entries;
    if (entry.source !== `./${slug}`) err("marketplace-source", file, `${spec.name}: source must be "./${slug}", got ${JSON.stringify(entry.source)}`);
    if (typeof entry.description !== "string" || !entry.description) err("marketplace-description", file, `${spec.name}: entry description missing`);
    const manifest = path.join(root, slug, ".claude-plugin", "plugin.json");
    if (!fs.existsSync(manifest)) err("marketplace-source", file, `${spec.name}: ${slug}/.claude-plugin/plugin.json not found`);
    seen.add(entry);
  }
  for (const p of m.plugins) {
    if (!seen.has(p)) err("marketplace-plugins", file, `unexpected entry ${JSON.stringify(p?.name)}`);
  }
}

export function validate(root = DEFAULT_ROOT) {
  const errors = [];
  const err = (rule, where, msg) => errors.push(`${rule}: ${path.relative(root, where) || "."}: ${msg}`);

  const guardrails = readGuardrails(root);
  if (!guardrails) err("guardrails-source", path.join(root, "shared", "guardrails.md"), "missing or empty");

  const rulesFile = path.join(root, "shared", "director-rules.md");
  const rules = fs.existsSync(rulesFile) ? readText(rulesFile).trim() : null;

  const allFiles = walk(root);
  const repoBytes = allFiles.reduce((n, f) => n + fs.statSync(f).size, 0);
  if (repoBytes > LIMITS.repoBytes) err("repo-size", root, `${repoBytes} bytes exceeds ${LIMITS.repoBytes}`);

  validateMarketplace(root, err);

  for (const [slug, spec] of Object.entries(PLUGINS)) {
    const dir = path.join(root, slug);
    if (!fs.existsSync(dir)) {
      err("plugin-missing", dir, "plugin directory not found");
      continue;
    }
    const files = walk(dir);

    // Size and count limits.
    if (files.length > LIMITS.pluginFiles) err("file-count", dir, `${files.length} files exceeds ${LIMITS.pluginFiles}`);
    for (const f of files) {
      const size = fs.statSync(f).size;
      if (size > LIMITS.fileBytes) err("file-size", f, `${size} bytes exceeds ${LIMITS.fileBytes}`);
    }

    // Directories the plugins must not have.
    for (const d of walkDirs(dir)) {
      if (["bin", "commands", "agents"].includes(path.basename(d))) err("forbidden-dir", d, "directory is not allowed");
    }

    // user_config anywhere (text files only).
    for (const f of files) {
      if (isText(f) && readText(f).includes("${user_config")) err("user-config", f, "`${user_config` is not allowed");
    }

    // LICENSE and README.
    if (!fs.existsSync(path.join(dir, "LICENSE"))) err("license-missing", path.join(dir, "LICENSE"), "missing");
    const readme = path.join(dir, "README.md");
    if (!fs.existsSync(readme)) {
      err("readme-words", readme, "missing");
    } else {
      const words = readText(readme).split(/\s+/).filter(Boolean).length;
      if (words < LIMITS.readmeWords) err("readme-words", readme, `${words} words, need at least ${LIMITS.readmeWords}`);
    }

    // Fields both manifests must carry.
    const checkMetadata = (file, m) => {
      if (typeof m.version !== "string" || !m.version) err("manifest-version", file, "version missing");
      if (typeof m.description !== "string" || !m.description) err("manifest-description", file, "description missing");
      if (m.repository !== REPOSITORY_URL) err("manifest-repository", file, `repository must be ${REPOSITORY_URL}`);
      if (typeof m.license !== "string" || !m.license) err("manifest-license", file, "license missing");
    };

    // Claude manifest.
    const claudeManifest = path.join(dir, ".claude-plugin", "plugin.json");
    const cm = fs.existsSync(claudeManifest) ? readJson(claudeManifest) : { error: "missing" };
    const claudeVersion = cm.value?.version;
    if (cm.error) {
      err("manifest-json", claudeManifest, cm.error);
    } else {
      const m = cm.value;
      if (typeof m.name !== "string" || !KEBAB.test(m.name)) {
        err("manifest-name", claudeManifest, `name ${JSON.stringify(m.name)} is not lowercase-hyphen`);
      } else if (m.name !== spec.name) {
        err("manifest-name", claudeManifest, `name must be ${spec.name}, got ${m.name}`);
      }
      if ("userConfig" in m || "user_config" in m) err("user-config", claudeManifest, "userConfig is not allowed");
      checkMetadata(claudeManifest, m);
      if (m.mcpServers !== undefined) err("mcp-inline", claudeManifest, "declare servers only in .mcp.json");
      for (const key of ["commands", "agents"]) {
        if (key in m) err("forbidden-dir", claudeManifest, `${key} is not allowed`);
      }
    }

    // MCP configs: exactly one server, the right URL.
    for (const [file, type] of [
      [".mcp.json", "http"],
      ["mcp.json", "streamable-http"],
    ]) {
      const p = path.join(dir, file);
      const j = fs.existsSync(p) ? readJson(p) : { error: "missing" };
      if (j.error) {
        err("mcp-json", p, j.error);
        continue;
      }
      const servers = j.value.mcpServers;
      const entries = servers && typeof servers === "object" ? Object.entries(servers) : [];
      if (entries.length !== 1) {
        err("mcp-count", p, `expected exactly one MCP server, found ${entries.length}`);
        continue;
      }
      const [, server] = entries[0];
      if (server.url !== spec.url) err("mcp-url", p, `url must be ${spec.url}, got ${server.url}`);
      if (server.type !== type) err("mcp-type", p, `type must be ${type}, got ${server.type}`);
      if (server.headers || server.env || server.command) err("mcp-config", p, "headers, env and command are not allowed");
    }

    // OpenAI manifest.
    const oaManifest = path.join(dir, "plugin.json");
    const om = fs.existsSync(oaManifest) ? readJson(oaManifest) : { error: "missing" };
    if (om.error) {
      err("openai-manifest", oaManifest, om.error);
    } else {
      const m = om.value;
      if (m.name !== spec.name) err("manifest-name", oaManifest, `name must be ${spec.name}, got ${m.name}`);
      if ("userConfig" in m || "user_config" in m) err("user-config", oaManifest, "userConfig is not allowed");
      checkMetadata(oaManifest, m);
      if (m.version !== claudeVersion) err("manifest-version", oaManifest, `version ${m.version} must match the Claude manifest (${claudeVersion})`);
      const ui = m.extensions?.["com.openai"]?.interface;
      if (!ui) {
        err("openai-interface", oaManifest, 'missing extensions."com.openai".interface');
      } else {
        if (typeof ui.displayName !== "string" || !ui.displayName) {
          err("openai-display-name", oaManifest, "displayName missing");
        } else {
          if (ui.displayName.length > LIMITS.displayNameChars)
            err("openai-display-name", oaManifest, `displayName over ${LIMITS.displayNameChars} chars`);
          if (ui.displayName !== spec.displayName) err("openai-display-name", oaManifest, `displayName must be "${spec.displayName}"`);
        }
        if (typeof ui.shortDescription !== "string" || !ui.shortDescription) {
          err("openai-short-description", oaManifest, "shortDescription missing");
        } else if (ui.shortDescription.length > LIMITS.shortDescriptionChars) {
          err("openai-short-description", oaManifest, `shortDescription over ${LIMITS.shortDescriptionChars} chars`);
        }
        for (const key of ["privacyPolicyURL", "termsOfServiceURL", "supportURL"]) {
          const v = ui[key];
          let ok = false;
          try { ok = typeof v === "string" && /^https:\/\/[^\s/]/.test(v) && !!new URL(v).hostname; } catch { /* not a URL */ }
          if (!ok) err("openai-legal-urls", oaManifest, `${key} must be an https:// URL`);
        }
        const privacyUrl = `${PRIVACY_POLICY_URL}#connector-${slug}`;
        if (ui.privacyPolicyURL !== privacyUrl) err("openai-privacy-anchor", oaManifest, `privacyPolicyURL must be ${privacyUrl}`);
        for (const key of ["longDescription", "category"]) {
          if (typeof ui[key] !== "string" || !ui[key].trim()) err("openai-listing-fields", oaManifest, `${key} missing`);
        }
        if (typeof ui.category === "string" && ui.category.trim() && !OPENAI_CATEGORIES.includes(ui.category))
          err("openai-category", oaManifest, `category ${JSON.stringify(ui.category)} must be one of ${OPENAI_CATEGORIES.join(", ")}`);
        if (ui.capabilities !== undefined) {
          const caps = ui.capabilities;
          const okCaps =
            Array.isArray(caps) && caps.length <= LIMITS.capabilities &&
            caps.every((c) => typeof c === "string" && c.trim() && !c.includes("\n") && c.length <= LIMITS.capabilityChars);
          if (!okCaps)
            err("openai-capabilities", oaManifest, `capabilities must be at most ${LIMITS.capabilities} one-line strings of ${LIMITS.capabilityChars} chars or fewer`);
        }
        if (typeof ui.developerName !== "string" || !ui.developerName) err("openai-developer-name", oaManifest, "developerName missing");
        const prompts = ui.defaultPrompt;
        if (!Array.isArray(prompts) || prompts.length === 0) {
          err("openai-prompts", oaManifest, "defaultPrompt must be a non-empty array");
        } else {
          if (prompts.length > LIMITS.starterPrompts) err("openai-prompts", oaManifest, `more than ${LIMITS.starterPrompts} starter prompts`);
          for (const p of prompts) {
            if (typeof p !== "string" || p.length === 0 || p.length > LIMITS.starterPromptChars)
              err("openai-prompts", oaManifest, `starter prompt must be 1-${LIMITS.starterPromptChars} chars`);
          }
        }
        for (const key of ["logo", "composerIcon"]) {
          const rel = ui[key];
          if (typeof rel !== "string" || !rel.startsWith("./")) {
            err("openai-icon", oaManifest, `${key} must be a ./ path`);
            continue;
          }
          const iconPath = path.resolve(dir, rel);
          if (!iconPath.startsWith(dir + path.sep) || !fs.existsSync(iconPath)) {
            err("openai-icon", oaManifest, `${key} file not found: ${rel}`);
            continue;
          }
          const size = pngSize(iconPath);
          if (!size) err("openai-icon", iconPath, "not a PNG");
          else if (size.width < LIMITS.iconMinPx || size.height < LIMITS.iconMinPx || size.width !== size.height)
            err("openai-icon", iconPath, `${size.width}x${size.height} must be square and at least ${LIMITS.iconMinPx}px`);
        }
      }
    }

    // Skills.
    for (const { folder, file } of skillFiles(dir)) {
      if (!fs.existsSync(file)) {
        err("skill-missing", file, "folder has no SKILL.md");
        continue;
      }
      const text = readText(file);
      const fm = parseFrontmatter(text);
      if (!fm) {
        err("skill-frontmatter", file, "missing frontmatter");
        continue;
      }
      const { name, description } = fm.data;
      if (name !== folder) err("skill-name", file, `name ${JSON.stringify(name)} must equal folder "${folder}"`);
      if (typeof name === "string" && name.length > LIMITS.skillNameChars)
        err("skill-name-length", file, `name over ${LIMITS.skillNameChars} chars`);
      if (!description) err("skill-description", file, "description missing");
      else if (description.length > LIMITS.skillDescriptionChars)
        err("skill-description", file, `description is ${description.length} chars, max ${LIMITS.skillDescriptionChars}`);
      const lines = text.replace(/\n$/, "").split("\n").length;
      if (lines >= LIMITS.skillLines) err("skill-lines", file, `${lines} lines, must be under ${LIMITS.skillLines}`);
      if (guardrails && !text.includes(guardrails)) err("guardrail-missing", file, "shared/guardrails.md block not found verbatim");
      if (text.includes(RULES_HEADING) && (!rules || !text.includes(rules)))
        err("rules-drift", file, "the \"Rules that apply every time\" block must match shared/director-rules.md verbatim");
      const toolLines = text.split("\n").filter((l) => l.startsWith("Tools used:"));
      if (toolLines.length !== 1 || !TOOLS_USED.test(toolLines[0]))
        err("tools-used", file, 'needs exactly one line "Tools used: a, b, c" (snake_case names, or "Tools used: none")');
    }
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_ROOT;
  const errors = validate(root);
  if (errors.length) {
    console.error(errors.join("\n"));
    console.error(`\nvalidate: ${errors.length} problem(s)`);
    process.exit(1);
  }
  console.log("validate: ok");
}
