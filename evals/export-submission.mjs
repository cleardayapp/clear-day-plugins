#!/usr/bin/env node
// Prints a plugin's submission test cases (5 positive, 3 negative) in the shape OpenAI documents for
// `extensions."com.openai".review.test_cases` (https://developers.openai.com/apps-sdk/deploy/submission):
// positive cases carry description, prompt, tools_triggered and expected_behavior; negative cases carry
// description and prompt. Add `--format table` for a Markdown table instead.
// Fails (exit 1, nothing printed) when a submission case expects a planned tool.
// Usage: node evals/export-submission.mjs --plugin directors|parents [--format json|table] [--dir <evals folder>]
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
  const isNegative = (c) => c.kind === 'negative';
  const testCases = {
    positive: rows.filter((c) => !isNegative(c)).map((c) => ({
      description: c.description,
      prompt: c.prompt,
      tools_triggered: c.expect.tool,
      expected_behavior: c.expectedBehavior,
    })),
    negative: rows.filter(isNegative).map((c) => ({ description: c.description, prompt: c.prompt })),
  };
  const json = JSON.stringify({ extensions: { 'com.openai': { review: { test_cases: testCases } } } }, null, 2);
  const lines = ['| id | kind | prompt | expectedTool | expectedBehavior |', '| --- | --- | --- | --- | --- |'];
  for (const c of rows) {
    lines.push(`| ${c.id} | ${isNegative(c) ? 'negative' : 'positive'} | ${cell(c.prompt)} | ${c.expect.tool ? `\`${c.expect.tool}\`` : 'none'} | ${cell(c.expectedBehavior)} |`);
  }
  return { json, table: lines.join('\n'), errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    const v = i > 0 ? process.argv[i + 1] : undefined;
    return v?.startsWith('--') ? undefined : v;
  };
  const plugin = arg('--plugin');
  const format = arg('--format') ?? 'json';
  if (!['directors', 'parents'].includes(plugin) || !['json', 'table'].includes(format)) {
    console.error('Usage: node evals/export-submission.mjs --plugin directors|parents [--format json|table] [--dir <evals folder>]');
    process.exit(2);
  }
  if (process.argv.includes('--dir') && !arg('--dir')) {
    console.error('--dir needs a folder');
    process.exit(2);
  }
  const { json, table, errors } = exportSubmission(plugin, arg('--dir') ?? here);
  if (errors.length) {
    console.error(errors.map((m) => `FAIL ${m}`).join('\n'));
    process.exit(1);
  }
  console.log(format === 'table' ? table : json);
}
