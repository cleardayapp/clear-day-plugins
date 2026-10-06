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
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const sub = cases.filter((c) => c.submission);
const rows = [...sub.filter((c) => c.kind !== 'negative'), ...sub.filter((c) => c.kind === 'negative')];
console.log('| # | Kind | Prompt | Expected tool | Expected behavior |');
console.log('| --- | --- | --- | --- | --- |');
rows.forEach((c, n) => {
  const kind = c.kind === 'negative' ? 'negative' : 'positive';
  console.log(`| ${n + 1} | ${kind} | ${cell(c.prompt)} | ${c.expect.tool ? `\`${c.expect.tool}\`` : 'none'} | ${cell(c.expectedBehavior)} |`);
});
