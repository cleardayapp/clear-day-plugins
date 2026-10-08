import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { check } from "../../evals/check.mjs";
import { exportSubmission } from "../../evals/export-submission.mjs";
import { editJson } from "./helpers.mjs";

const EVALS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "evals");

/** Copy the real evals data into a temp dir, then mutate it. */
function fixture(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evals-fixture-"));
  fs.cpSync(path.join(EVALS, "tool-lists"), path.join(dir, "tool-lists"), { recursive: true });
  for (const f of ["directors.json", "parents.json"]) fs.copyFileSync(path.join(EVALS, f), path.join(dir, f));
  if (mutate) mutate((rel, fn) => editJson(path.join(dir, rel), fn));
  return dir;
}

const caseOf = (j, id) => j.cases.find((c) => c.id === id);

function expectFail(pattern, mutate) {
  const { errors } = check(fixture(mutate));
  assert.ok(errors.some((e) => pattern.test(e)), `expected ${pattern}, got:\n${errors.join("\n")}`);
}

test("the real eval cases pass", () => assert.deepEqual(check().errors, []));
test("a copy of the eval cases passes", () => assert.deepEqual(check(fixture()).errors, []));

test("fails when a plugin has the wrong number of submission cases", () =>
  expectFail(/exactly 5 positive submission/, (ed) =>
    ed("directors.json", (j) => delete caseOf(j, "dir-prepare-open-house-kit").submission)));

test("fails on a tool that is not in the pinned list", () =>
  expectFail(/not in directors's pinned list/, (ed) =>
    ed("directors.json", (j) => (caseOf(j, "dir-list-my-schools").expect.tool = "list_everything"))));

test("fails when a parents case expects a directors tool", () =>
  expectFail(/other plugin's tool/, (ed) =>
    ed("parents.json", (j) => (caseOf(j, "par-tour-times-direct").expect.tool = "get_school_profile"))));

test("fails on an email outside example.com", () =>
  expectFail(/email outside example\.com/, (ed) =>
    ed("parents.json", (j) => (caseOf(j, "par-request-tour").prompt += " Or write to jordan@gmail.com."))));

test("fails when a destructive tool case is not confirmed", () =>
  expectFail(/needs "confirmed": true/, (ed) =>
    ed("directors.json", (j) => delete caseOf(j, "dir-book-school-tour").confirmed)));

test("fails when a destructive tool prompt has no explicit confirmation", () =>
  expectFail(/explicit confirmation/, (ed) =>
    ed("parents.json", (j) => (caseOf(j, "par-request-tour").prompt = "Book the Tuesday 10:00 tour at Little Oaks (facility 1001)."))));

test("fails on a birth date outside the flagged privacy case", () =>
  expectFail(/birth date/, (ed) =>
    ed("directors.json", (j) => (caseOf(j, "dir-list-my-schools").prompt += " One child was born 01/01/2000."))));

test("passes when only non-submission parents cases use planned tools", () => {
  const { errors } = check(fixture());
  assert.deepEqual(errors, []);
  const parents = JSON.parse(fs.readFileSync(path.join(EVALS, "parents.json"), "utf8"));
  const list = JSON.parse(fs.readFileSync(path.join(EVALS, "tool-lists", "parents.json"), "utf8"));
  const planned = new Set(list.tools.filter((t) => t.status === "planned").map((t) => t.name));
  assert.ok(parents.cases.some((c) => planned.has(c.expect.tool) && !c.submission));
});

test("fails when a parents submission case uses a planned tool", () =>
  expectFail(/parents submission cases must use live tools/, (ed) =>
    ed("parents.json", (j) => (caseOf(j, "par-find-licensed-city").expect.tool = "get_child_care_help_paying"))));

test("fails when a directors submission case uses a planned tool", () =>
  expectFail(/directors submission cases must use live tools/, (ed) =>
    ed("tool-lists/directors.json", (j) => (j.tools.find((t) => t.name === "get_school_website_status").status = "planned"))));

test("the export has no errors for the real submission sets", () => {
  for (const p of ["directors", "parents"]) assert.deepEqual(exportSubmission(p).errors, []);
});

test("the export fails when a submission case uses a planned tool", () => {
  const dir = fixture((ed) => ed("parents.json", (j) => (caseOf(j, "par-find-licensed-city").expect.tool = "get_child_care_help_paying")));
  const { errors } = exportSubmission("parents", dir);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /par-find-licensed-city.*get_child_care_help_paying is planned/);
  const script = path.join(EVALS, "export-submission.mjs");
  const bad = spawnSync(process.execPath, [script, "--plugin", "parents", "--dir", dir], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, "");
  assert.match(bad.stderr, /FAIL par-find-licensed-city/);
  const good = spawnSync(process.execPath, [script, "--plugin", "parents"], { encoding: "utf8" });
  assert.equal(good.status, 0);
  assert.match(good.stdout, /par-find-licensed-city/);
});
