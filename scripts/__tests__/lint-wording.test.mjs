import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { lint } from "../lint-wording.mjs";
import { DEFAULT_ROOT, readGuardrails } from "../lib.mjs";
import { edit, editJson, fixture } from "./helpers.mjs";

const rulesOf = (root) => lint(root).map((e) => e.split(":")[0]);
const skill = (r, p = "directors") => path.join(r, p, "skills", "sample-skill", "SKILL.md");
const ui = (j) => j.extensions["com.openai"].interface;

function expectFail(rule, mutate) {
  const root = fixture(mutate);
  assert.ok(rulesOf(root).includes(rule), `expected ${rule}, got: ${lint(root).join("\n")}`);
}
const addLine = (file, line) => fs.appendFileSync(file, `\n${line}\n`);

test("the real skeleton passes", () => assert.deepEqual(lint(DEFAULT_ROOT), []));
test("a clean fixture passes", () => assert.deepEqual(lint(fixture()), []));

test("the guardrail block passes the lint and names neither plugin", () => {
  const block = readGuardrails(DEFAULT_ROOT);
  assert.ok(!/clear day for|clear-day-for|plugin/i.test(block));
  const root = fixture();
  assert.deepEqual(lint(root), []); // every sample skill embeds the block
});

for (const word of ["Claude", "ChatGPT", "OpenAI", "Anthropic"]) {
  test(`model-name: "${word}" in a skill fails`, () => expectFail("model-name", (r) => addLine(skill(r), `Ask ${word} to help.`)));
}
test("model-name: also fails in a README and a manifest, but plain 'the assistant' passes", () => {
  expectFail("model-name", (r) => addLine(path.join(r, "parents", "README.md"), "Works with ChatGPT."));
  expectFail("model-name", (r) => editJson(path.join(r, "parents", ".claude-plugin", "plugin.json"), (j) => (j.description = "Built for Claude")));
  assert.deepEqual(lint(fixture((r) => addLine(skill(r), "Ask the assistant to help."))), []);
});

for (const bad of ["MCP Tools", "My Plugin"]) {
  test(`display-name: "${bad}" fails in both manifests`, () => {
    expectFail("display-name", (r) => editJson(path.join(r, "directors", ".claude-plugin", "plugin.json"), (j) => (j.displayName = bad)));
    expectFail("display-name", (r) => editJson(path.join(r, "directors", "plugin.json"), (j) => (ui(j).displayName = bad)));
  });
}
for (const bad of ["Start your free trial", "Big discount for you", "20% off today", "Only $5 a month"]) {
  test(`pricing-language: "${bad}" in interface fields fails`, () => {
    expectFail("pricing-language", (r) => editJson(path.join(r, "directors", "plugin.json"), (j) => (ui(j).shortDescription = bad)));
    expectFail("pricing-language", (r) => editJson(path.join(r, "parents", "plugin.json"), (j) => (ui(j).defaultPrompt = [bad])));
  });
}
test("pricing-language: a dollar sign outside interface fields is not flagged", () => {
  assert.deepEqual(lint(fixture((r) => editJson(path.join(r, "directors", "plugin.json"), (j) => (j["$comment"] = "$5")))), []);
});

test("sibling-plugin: each plugin naming the other fails, in both directions", () => {
  expectFail("sibling-plugin", (r) => addLine(path.join(r, "directors", "README.md"), "See Clear Day for Parents."));
  expectFail("sibling-plugin", (r) => addLine(skill(r), "Try the parents plugin."));
  expectFail("sibling-plugin", (r) => addLine(path.join(r, "parents", "README.md"), "See clear-day-for-directors."));
  expectFail("sibling-plugin", (r) => addLine(skill(r, "parents"), "Use https://mcp.useclearday.com/mcp here."));
  expectFail("sibling-plugin", (r) => addLine(skill(r), "Use https://mcp.useclearday.com/mcp/find here."));
});
test("sibling-plugin: a plugin naming its own URL and the word parents is fine", () => {
  assert.deepEqual(lint(fixture((r) => addLine(skill(r, "parents"), "Use https://mcp.useclearday.com/mcp/find for parents."))), []);
  assert.deepEqual(lint(fixture((r) => addLine(skill(r), "Reply to parents about tours."))), []);
});

for (const app of ["Gmail", "Outlook", "Google Calendar", "Canva", "Slack", "Zoom"]) {
  test(`third-party-app: "${app}" fails, category wording passes`, () => {
    expectFail("third-party-app", (r) => addLine(skill(r), `Send it through ${app}.`));
  });
}
test("third-party-app: category wording passes", () => {
  assert.deepEqual(lint(fixture((r) => addLine(skill(r), "Paste it into your email app or calendar."))), []);
});

for (const bad of ["colour", "licence", "cancelled", "organise", "centre", "enrolment"]) {
  test(`british-spelling: "${bad}" fails`, () => expectFail("british-spelling", (r) => addLine(skill(r), `The ${bad} list.`)));
}
test("british-spelling: American spellings pass", () => {
  assert.deepEqual(lint(fixture((r) => addLine(skill(r), "color license canceled organize center enrollment"))), []);
});

test("a guardrail block that names a banned term fails the lint (it is copied into every skill)", () => {
  const root = fixture((r) => {
    edit(path.join(r, "shared", "guardrails.md"), (t) => t + "- Do not mention Claude.\n");
  });
  assert.ok(rulesOf(root).includes("model-name"));
});
