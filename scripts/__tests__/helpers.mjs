import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_ROOT, readGuardrails } from "../lib.mjs";

const COPY = [".claude-plugin", "shared", "templates", "directors", "parents"];

export function sampleSkill(root, { name = "sample-skill", body = "" } = {}) {
  return `---
name: ${name}
description: A sample skill used by the fixtures.
---

# Sample

Tools used: find_things, get_thing
${body}
${readGuardrails(root)}
`;
}

/** Copy the real plugin tree into a temp dir, add one sample skill per plugin, then mutate. */
export function fixture(mutate) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plugins-fixture-"));
  for (const d of COPY) fs.cpSync(path.join(DEFAULT_ROOT, d), path.join(root, d), { recursive: true });
  for (const p of ["directors", "parents"]) {
    const dir = path.join(root, p, "skills", "sample-skill");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), sampleSkill(root));
  }
  if (mutate) mutate(root, (rel) => path.join(root, rel));
  return root;
}

export function editJson(file, fn) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  fn(j);
  fs.writeFileSync(file, JSON.stringify(j, null, 2));
}

export function edit(file, fn) {
  fs.writeFileSync(file, fn(fs.readFileSync(file, "utf8")));
}
