#!/usr/bin/env node
// Validates the test cases and pinned tool lists. Node >= 20, no dependencies.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PLUGINS = ['directors', 'parents'];
const KINDS = ['direct', 'indirect', 'negative'];
const PLANS = ['FREE', 'RUN', 'GROW'];
const CASE_KEYS = new Set(['id', 'prompt', 'kind', 'description', 'expect', 'signedIn', 'plan', 'expectedBehavior', 'notes', 'submission', 'fictionalChild', 'mustNotCall', 'confirmed']);
const TOOL_KEYS = new Set(['name', 'plans', 'signedIn', 'destructive', 'status']);

const EXPLICIT_CONFIRMATION = /\b(yes|i confirm|go ahead)\b/i;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
const BIRTH_DATE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/(\d{2}|\d{4})\b|\b(born|birthday|birth date|date of birth|dob)\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2},? \d{4}\b/i;
const CHILD_NAME = [
  /\b([Mm]y|[Oo]ur|[Hh]is|[Hh]er)\s+(son|daughter|child|toddler|kid|baby|infant|preschooler|student)\s*,?\s+(named\s+|called\s+)?[A-Z][a-z]+/,
  /\b(child|son|daughter|student|toddler|kid|baby)\s+(named|called)\s+[A-Z][a-z]+/,
  /\b[Tt]oddler\s+[A-Z][a-z]+\s+[A-Z][a-z]+/,
  /\b[A-Z][a-z]+\s+[A-Z][a-z]+'s\s+([Aa]llerg|[Aa]ttendance|[Mm]edical|[Rr]ecord|[Bb]irth)/,
];

const isStr = (v) => typeof v === 'string' && v.trim() !== '';

export function check(dir = here) {
const errors = [];
const err = (m) => errors.push(m);
const read = (rel) => JSON.parse(readFileSync(join(dir, rel), 'utf8'));
const lists = {};
for (const p of PLUGINS) {
  const l = read(`tool-lists/${p}.json`);
  const where = `tool-lists/${p}.json`;
  if (l.plugin !== p) err(`${where}: plugin must be "${p}"`);
  const names = new Set();
  if (!Array.isArray(l.tools) || !l.tools.length) err(`${where}: tools must be a non-empty array`);
  for (const t of l.tools || []) {
    for (const k of Object.keys(t)) if (!TOOL_KEYS.has(k)) err(`${where}: ${t.name}: unknown key "${k}"`);
    if (!/^[a-z][a-z0-9_]*$/.test(t.name || '')) err(`${where}: bad tool name ${JSON.stringify(t.name)}`);
    if (names.has(t.name)) err(`${where}: duplicate tool ${t.name}`);
    names.add(t.name);
    if (!Array.isArray(t.plans) || !t.plans.length || !t.plans.every((x) => PLANS.includes(x))) err(`${where}: ${t.name}: plans must be a non-empty subset of ${PLANS}`);
    if (!['live', 'planned'].includes(t.status)) err(`${where}: ${t.name}: status must be "live" or "planned"`);
    if (typeof t.signedIn !== 'boolean') err(`${where}: ${t.name}: signedIn must be boolean`);
  }
  lists[p] = new Map((l.tools || []).map((t) => [t.name, t]));
}

const summary = [];
const seenIds = new Set();
for (const p of PLUGINS) {
  const file = `${p}.json`;
  const data = read(file);
  const tools = lists[p];
  const other = lists[PLUGINS.find((x) => x !== p)];
  if (data.plugin !== p) err(`${file}: plugin must be "${p}"`);
  const cases = Array.isArray(data.cases) ? data.cases : [];
  if (!cases.length) err(`${file}: cases must be a non-empty array`);
  const covered = new Set();
  let planned = 0, pos = 0, neg = 0, trueNeg = 0, subPos = 0, subNeg = 0;

  for (const c of cases) {
    const at = `${file}: ${c.id || '(no id)'}`;
    for (const k of Object.keys(c)) if (!CASE_KEYS.has(k)) err(`${at}: unknown key "${k}"`);
    for (const k of ['id', 'prompt', 'expectedBehavior']) if (!isStr(c[k])) err(`${at}: ${k} must be a non-empty string`);
    if (typeof c.notes !== 'string') err(`${at}: notes must be a string`);
    if (isStr(c.id)) {
      if (seenIds.has(c.id)) err(`${at}: duplicate id`);
      seenIds.add(c.id);
    }
    if (!KINDS.includes(c.kind)) err(`${at}: kind must be one of ${KINDS}`);
    if (typeof c.signedIn !== 'boolean') err(`${at}: signedIn must be boolean`);
    if (c.plan !== undefined && !PLANS.includes(c.plan)) err(`${at}: plan must be one of ${PLANS}`);
    if (p === 'directors' && c.plan === undefined) err(`${at}: directors cases need a plan`);
    if (c.submission !== undefined && c.submission !== true) err(`${at}: submission, when present, must be true`);

    const e = c.expect;
    const hasTool = e && isStr(e.tool), hasNone = e && e.none === true;
    const extraKeys = e ? Object.keys(e).filter((k) => k !== 'chain') : [];
    if (!e || typeof e !== 'object' || hasTool === hasNone || extraKeys.length !== 1 || (e.chain !== undefined && !hasTool)) {
      err(`${at}: expect must be exactly {tool: name} (optionally with chain) or {none: true}`);
    }
    if (hasTool && e.chain !== undefined) {
      const chain = e.chain;
      if (!Array.isArray(chain) || chain.length < 2) err(`${at}: expect.chain must list at least 2 tools in call order`);
      else {
        for (const t of chain) if (!tools.has(t)) err(`${at}: expect.chain tool "${t}" is not in ${p}'s pinned list`);
        if (chain[chain.length - 1] !== e.tool) err(`${at}: expect.chain must end with expect.tool (${e.tool})`);
      }
    }
    const tool = hasTool ? tools.get(e.tool) : undefined;
    if (hasTool && !tool) {
      err(`${at}: expect.tool "${e.tool}" is not in ${p}'s pinned list${other.has(e.tool) ? ` (it is the other plugin's tool)` : ''}`);
    }
    const positive = c.kind === 'direct' || c.kind === 'indirect';
    positive ? pos++ : c.kind === 'negative' && neg++;
    if (c.kind === 'negative' && hasNone) trueNeg++;
    if (positive && !hasTool) err(`${at}: ${c.kind} cases must expect a tool`);
    if (tool?.destructive) {
      if (c.confirmed !== true) err(`${at}: ${e.tool} is destructive, so the case needs "confirmed": true`);
      if (!EXPLICIT_CONFIRMATION.test(c.prompt || '')) err(`${at}: prompt must contain an explicit confirmation (for example "Yes, I confirm")`);
    } else if (c.confirmed !== undefined) err(`${at}: confirmed is only for cases expecting a destructive tool`);
    if (tool?.status === 'planned') planned++;
    if (tool?.status === 'planned' && c.submission) err(`${at}: ${p} submission cases must use live tools (${e.tool} is planned)`);
    if (tool) {
      if (positive) covered.add(e.tool);
      if (tool.signedIn && c.signedIn !== true) err(`${at}: ${e.tool} needs sign-in but signedIn is not true`);
      if (c.plan && !tool.plans.includes(c.plan)) err(`${at}: ${e.tool} is not available on ${c.plan}`);
    }
    if (c.mustNotCall !== undefined) {
      if (c.kind !== 'negative') err(`${at}: mustNotCall is only for negative cases`);
      if (!Array.isArray(c.mustNotCall) || !c.mustNotCall.length) err(`${at}: mustNotCall must be a non-empty array`);
      for (const t of c.mustNotCall || []) if (!tools.has(t)) err(`${at}: mustNotCall "${t}" is not in ${p}'s pinned list`);
      if (hasTool && (c.mustNotCall || []).includes(e.tool)) err(`${at}: expect.tool is also in mustNotCall`);
    }
    if (p === 'parents' && c.signedIn === true) err(`${at}: parents cases run anonymously (signedIn false)`);

    if (c.submission) {
      if (!isStr(c.description)) err(`${at}: submission cases need a description`);
      positive ? subPos++ : subNeg++;
      if (positive && p === 'directors' && c.plan !== 'FREE') err(`${at}: submission cases must run on a FREE demo school`);
      if (!positive && !hasNone) err(`${at}: submission negatives must expect {none: true}`);
      if (c.fictionalChild) err(`${at}: submission cases must not contain child details`);
    }
    if (c.fictionalChild && c.kind !== 'negative') err(`${at}: fictionalChild is only for negative cases`);

    const text = [c.prompt, c.expectedBehavior, c.notes].filter((s) => typeof s === 'string').join('\n');
    for (const m of text.match(EMAIL) || []) {
      if (!/@example\.com$/i.test(m)) err(`${at}: email outside example.com: ${m}`);
    }
    if (!c.fictionalChild) {
      if (BIRTH_DATE.test(text)) err(`${at}: looks like a birth date (set fictionalChild only for the privacy case)`);
      for (const re of CHILD_NAME) if (re.test(text)) { err(`${at}: looks like a child's name (set fictionalChild only for the privacy case)`); break; }
    }
  }

  if (pos < 5) err(`${file}: need at least 5 positive cases (have ${pos})`);
  if (trueNeg < 3) err(`${file}: need at least 3 true negative cases that expect no tool (have ${trueNeg} of ${neg} negatives)`);
  if (subPos !== 5) err(`${file}: need exactly 5 positive submission cases (have ${subPos})`);
  if (subNeg !== 3) err(`${file}: need exactly 3 negative submission cases (have ${subNeg})`);
  for (const name of tools.keys()) if (!covered.has(name)) err(`${file}: no positive case for tool ${name}`);
  summary.push(`${p}: ${cases.length} cases (${pos} positive, ${neg} negative); submission ${subPos}+${subNeg}; ${covered.size}/${tools.size} tools covered; ${planned} case(s) depend on planned tools`);
}

return { errors, summary };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { errors, summary } = check();
  if (errors.length) {
    console.error(errors.map((m) => `FAIL ${m}`).join('\n'));
    console.error(`\n${errors.length} problem(s)`);
    process.exit(1);
  }
  console.log(summary.join('\n'));
  console.log('evals OK');
}
