#!/usr/bin/env node
// Prints a plugin's submission test cases (5 positive, 3 negative) as a Markdown table.
// Fails (exit 1, nothing printed) when a submission case expects a planned tool.
// Usage: node evals/export-submission.mjs --plugin directors|parents [--dir <evals folder>]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

export function exportSubmission(plugin, dir = here) {
  const { cases } = JSON.parse(readFileSync(join(dir, `${plugin}.json`), 'utf8'));
  const list = JSON.parse(readFileSync(join(dir, 'tool-lists', `${plugin}.json`), 'utf8'));
  const planned = new Set(list.tools.filter((t) => t.status === 'planned').map((t) => t.name));
  const sub = cases.filter((c) => c.submission);
  const rows = [...sub.filter((c) => c.kind !== 'negative'), ...sub.filter((c) => c.kind === 'negative')];
  const errors = rows
    .filter((c) => planned.has(c.expect.tool))
    .map((c) => `${c.id}: submission cases must use live tools (${c.expect.tool} is planned)`);
  const lines = ['| id | kind | prompt | expectedTool | expectedBehavior |', '| --- | --- | --- | --- | --- |'];
  for (const c of rows) {
    const kind = c.kind === 'negative' ? 'negative' : 'positive';
    lines.push(`| ${c.id} | ${kind} | ${cell(c.prompt)} | ${c.expect.tool ? `\`${c.expect.tool}\`` : 'none'} | ${cell(c.expectedBehavior)} |`);
  }
  return { table: lines.join('\n'), errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--plugin');
  const plugin = i > 0 ? process.argv[i + 1] : undefined;
  if (!['directors', 'parents'].includes(plugin)) {
    console.error('Usage: node evals/export-submission.mjs --plugin directors|parents');
    process.exit(2);
  }
  const d = process.argv.indexOf('--dir');
  if (d > 0 && !process.argv[d + 1]) {
    console.error('--dir needs a folder');
    process.exit(2);
  }
  const { table, errors } = exportSubmission(plugin, d > 0 ? process.argv[d + 1] : here);
  if (errors.length) {
    console.error(errors.map((m) => `FAIL ${m}`).join('\n'));
    process.exit(1);
  }
  console.log(table);
}
