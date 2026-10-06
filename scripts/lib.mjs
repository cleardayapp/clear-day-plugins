// Shared helpers for validate.mjs and lint-wording.mjs. Plain Node, no dependencies.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PLUGINS = {
  directors: {
    name: "clear-day-for-directors",
    displayName: "Clear Day for Directors",
    url: "https://mcp.useclearday.com/mcp",
  },
  parents: {
    name: "clear-day-for-parents",
    displayName: "Clear Day for Parents",
    url: "https://mcp.useclearday.com/mcp/find",
  },
};

export function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

export function walkDirs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (entry.isDirectory()) {
      const full = path.join(dir, entry.name);
      out.push(full, ...walkDirs(full));
    }
  }
  return out;
}

const TEXT_EXT = new Set([".md", ".json", ".txt", ".mjs", ".js", ".yml", ".yaml"]);
export function isText(file) {
  const base = path.basename(file);
  return TEXT_EXT.has(path.extname(file)) || base === "LICENSE" || base === ".gitignore" || base === ".gitkeep";
}

export function readText(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

export function readJson(file) {
  try {
    return { value: JSON.parse(readText(file)) };
  } catch (err) {
    return { error: err.message };
  }
}

export function readGuardrails(root) {
  const file = path.join(root, "shared", "guardrails.md");
  if (!fs.existsSync(file)) return null;
  return readText(file).trim();
}

/** Minimal frontmatter parser: `key: value`, quoted values, and `>` / `|` block scalars. */
export function parseFrontmatter(text) {
  const lines = text.split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end === -1) return null;
  const data = {};
  for (let i = 1; i < end; i++) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, key, raw] = m;
    if (/^[>|][+-]?$/.test(raw.trim())) {
      const parts = [];
      while (i + 1 < end && (/^\s+/.test(lines[i + 1]) || lines[i + 1] === "")) parts.push(lines[++i].trim());
      data[key] = parts.join(raw.trim().startsWith(">") ? " " : "\n").trim();
    } else {
      let v = raw.trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      data[key] = v;
    }
  }
  return { data, bodyStart: end + 1 };
}

export function skillFiles(pluginDir) {
  const skillsDir = path.join(pluginDir, "skills");
  if (!fs.existsSync(skillsDir)) return [];
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ folder: e.name, file: path.join(skillsDir, e.name, "SKILL.md") }));
}
