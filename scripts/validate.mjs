#!/usr/bin/env node
// Structural validator for the directors and parents plugins. Plain Node, no dependencies.
// Usage: node plugins/scripts/validate.mjs [pluginsRoot]
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
};

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TOOLS_USED = /^Tools used: (none|[a-z][a-z0-9_]*(, [a-z][a-z0-9_]*)*)$/;

function pngSize(file) {
  const buf = fs.readFileSync(file);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function validate(root = DEFAULT_ROOT) {
  const errors = [];
  const err = (rule, where, msg) => errors.push(`${rule}: ${path.relative(root, where) || "."}: ${msg}`);

  const guardrails = readGuardrails(root);
  if (!guardrails) err("guardrails-source", path.join(root, "shared", "guardrails.md"), "missing or empty");

  const allFiles = walk(root);
  const repoBytes = allFiles.reduce((n, f) => n + fs.statSync(f).size, 0);
  if (repoBytes > LIMITS.repoBytes) err("repo-size", root, `${repoBytes} bytes exceeds ${LIMITS.repoBytes}`);

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

    // Claude manifest.
    const claudeManifest = path.join(dir, ".claude-plugin", "plugin.json");
    const cm = fs.existsSync(claudeManifest) ? readJson(claudeManifest) : { error: "missing" };
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
