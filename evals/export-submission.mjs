#!/usr/bin/env node
// Prints a plugin's submission test cases (5 positive, 3 negative) as a Markdown table.
// Usage: node evals/export-submission.mjs --plugin directors|parents
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const i = process.argv.indexOf('--plugin');
const plugin = i > 0 ? process.argv[i + 1] : undefined;
if (!['directors', 'parents'].includes(plugin)) {
  console.error('Usage: node evals/export-submission.mjs --plugin directors|parents');
  process.exit(2);
}
const { cases } = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), `${plugin}.json`), 'utf8'));
const list = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tool-lists', `${plugin}.json`), 'utf8'));
const planned = new Set(list.tools.filter((t) => t.status === 'planned').map((t) => t.name));
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const sub = cases.filter((c) => c.submission);
const rows = [...sub.filter((c) => c.kind !== 'negative'), ...sub.filter((c) => c.kind === 'negative')];
console.log('| id | kind | prompt | expectedTool | expectedBehavior |');
console.log('| --- | --- | --- | --- | --- |');
rows.forEach((c) => {
  const kind = c.kind === 'negative' ? 'negative' : 'positive';
  console.log(`| ${c.id} | ${kind} | ${cell(c.prompt)} | ${c.expect.tool ? `\`${c.expect.tool}\`` : 'none'} | ${cell(c.expectedBehavior)} |`);
});
const pending = rows.filter((c) => planned.has(c.expect.tool)).length;
if (pending) console.error(`\nWarning: ${pending} of these cases use planned tools that are not live yet.`);
