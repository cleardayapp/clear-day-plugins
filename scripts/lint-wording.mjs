#!/usr/bin/env node
// Wording lint for skills, manifests and READMEs. Plain Node, no dependencies.
// Usage: node scripts/lint-wording.mjs [repoRoot]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_ROOT, PLUGINS, readJson, readText, walk } from "./lib.mjs";

// Model-readable text must say "the assistant", not name a model or its maker.
const MODEL_NAMES = [/\bClaude\b/, /\bChatGPT\b/, /\bOpenAI\b/, /\bAnthropic\b/];

// Third-party apps are referred to by category ("your email app"), never by name.
const THIRD_PARTY_APPS =
  /\b(Gmail|Outlook|Google Calendar|Google Docs|Google Sheets|Google Drive|Canva|Slack|Zoom|Microsoft Teams|Dropbox|Notion|Mailchimp|Constant Contact|WhatsApp|Facebook|Instagram|Brightwheel|Procare)\b/i;

// American English only (repo rule): British spellings fail.
const BRITISH =
  /\b(colour\w*|licence\w*|cancelled|cancelling|organis\w+|centres?|behaviour\w*|favourite\w*|programmes?|enrolments?|catalogue\w*|neighbour\w*|analyse\w*|recognis\w+|prioritis\w+)\b/i;

const PRICING = /free trial|discount|\d\s*% off|% off|\$/i;
const TOOL_PLAN_DISPLAY = /\b(MCP|plugin)\b/i;

export function lint(root = DEFAULT_ROOT) {
  const errors = [];
  const err = (rule, file, msg) => errors.push(`${rule}: ${path.relative(root, file)}: ${msg}`);

  const targets = [];
  for (const dir of [path.join(root, "shared"), path.join(root, "templates")]) {
    targets.push(...walk(dir).filter((f) => f.endsWith(".md")));
  }
  for (const slug of Object.keys(PLUGINS)) {
    const dir = path.join(root, slug);
    for (const f of walk(dir)) {
      const rel = path.relative(dir, f);
      const isSkill = rel.startsWith("skills" + path.sep) && f.endsWith(".md");
      const isManifest = ["plugin.json", "mcp.json", ".mcp.json", path.join(".claude-plugin", "plugin.json")].includes(rel);
      const isReadme = rel === "README.md";
      if (isSkill || isManifest || isReadme) targets.push(f);
    }
  }

  for (const file of targets) {
    const text = readText(file);
    for (const re of MODEL_NAMES) {
      const m = re.exec(text);
      if (m) err("model-name", file, `"${m[0]}" in model-readable text; say "the assistant"`);
    }
    const app = THIRD_PARTY_APPS.exec(text);
    if (app) err("third-party-app", file, `"${app[0]}": name a category instead (for example "your email app")`);
    const brit = BRITISH.exec(text);
    if (brit) err("british-spelling", file, `"${brit[0]}": use American English`);

    // A plugin must not name its sibling.
    const rel = path.relative(root, file).split(path.sep);
    const other = rel[0] === "directors" ? PLUGINS.parents : rel[0] === "parents" ? PLUGINS.directors : null;
    if (other) {
      const slug = rel[0] === "directors" ? "parents" : "directors";
      const re = new RegExp(`${other.name}|${other.displayName}|${slug} plugin|${other.url}(?![\\w/])`, "i");
      const m = re.exec(text);
      if (m) err("sibling-plugin", file, `names the ${slug} plugin ("${m[0]}")`);
    }
  }

  // Display names and interface fields in manifests.
  for (const slug of Object.keys(PLUGINS)) {
    const dir = path.join(root, slug);
    const claude = path.join(dir, ".claude-plugin", "plugin.json");
    const oa = path.join(dir, "plugin.json");
    const cj = fs.existsSync(claude) ? readJson(claude).value : null;
    const oj = fs.existsSync(oa) ? readJson(oa).value : null;
    if (cj?.displayName && TOOL_PLAN_DISPLAY.test(cj.displayName))
      err("display-name", claude, `displayName "${cj.displayName}" must not contain "MCP" or "Plugin"`);
    const ui = oj?.extensions?.["com.openai"]?.interface;
    if (ui) {
      if (typeof ui.displayName === "string" && TOOL_PLAN_DISPLAY.test(ui.displayName))
        err("display-name", oa, `displayName "${ui.displayName}" must not contain "MCP" or "Plugin"`);
      const fields = [ui.displayName, ui.shortDescription, ui.longDescription, ...(Array.isArray(ui.defaultPrompt) ? ui.defaultPrompt : [])];
      for (const v of fields) {
        if (typeof v === "string" && PRICING.test(v)) err("pricing-language", oa, `pricing or promo language in interface text: "${v}"`);
      }
    }
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_ROOT;
  const errors = lint(root);
  if (errors.length) {
    console.error(errors.join("\n"));
    console.error(`\nlint-wording: ${errors.length} problem(s)`);
    process.exit(1);
  }
  console.log("lint-wording: ok");
}
