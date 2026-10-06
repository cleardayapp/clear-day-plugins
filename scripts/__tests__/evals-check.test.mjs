import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { check } from "../../evals/check.mjs";
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
