import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { validate, LIMITS } from "../validate.mjs";
import { DEFAULT_ROOT } from "../lib.mjs";
import { edit, editJson, fixture, sampleSkill } from "./helpers.mjs";

const rulesOf = (root) => validate(root).map((e) => e.split(":")[0]);
const D = (root, ...p) => path.join(root, "directors", ...p);
const skill = (root, plugin = "directors") => path.join(root, plugin, "skills", "sample-skill", "SKILL.md");

function expectFail(rule, mutate) {
  const root = fixture(mutate);
  assert.ok(rulesOf(root).includes(rule), `expected ${rule}, got: ${validate(root).join("\n")}`);
}

test("the real skeleton passes", () => assert.deepEqual(validate(DEFAULT_ROOT), []));
test("a fixture with one sample skill per plugin passes", () => assert.deepEqual(validate(fixture()), []));
test("the skill template passes the skill rules once placed in a skill folder", () => {
  const root = fixture((r) => {
    fs.copyFileSync(path.join(r, "templates", "SKILL.template.md"), skill(r));
    edit(skill(r), (t) => t.replace("name: skill-folder-name", "name: sample-skill"));
  });
  assert.deepEqual(validate(root), []);
});

test("skill-name: mismatch fails, match passes", () => {
  expectFail("skill-name", (r) => edit(skill(r), (t) => t.replace("name: sample-skill", "name: other")));
});
test("skill-name-length: 64 chars passes, 65 fails", () => {
  const make = (n) => (r) => {
    const name = "a".repeat(n);
    const dir = D(r, "skills", name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "SKILL.md"), sampleSkill(r, { name }));
  };
  assert.deepEqual(validate(fixture(make(64))), []);
  expectFail("skill-name-length", make(65));
});
test("skill-description: 1024 chars passes, 1025 fails", () => {
  const make = (n) => (r) => edit(skill(r), (t) => t.replace("A sample skill used by the fixtures.", "x".repeat(n)));
  assert.deepEqual(validate(fixture(make(LIMITS.skillDescriptionChars))), []);
  expectFail("skill-description", make(LIMITS.skillDescriptionChars + 1));
});
test("skill-description: block scalar descriptions are measured", () => {
  expectFail("skill-description", (r) =>
    edit(skill(r), (t) => t.replace("description: A sample skill used by the fixtures.", `description: >\n  ${"y".repeat(1100)}`)));
});
test("skill-lines: 499 lines passes, 500 fails", () => {
  const make = (lines) => (r) => {
    const total = fs.readFileSync(skill(r), "utf8").split("\n").length - 1;
    edit(skill(r), (t) => t + "filler\n".repeat(lines - total));
  };
  assert.deepEqual(validate(fixture(make(499))), []);
  expectFail("skill-lines", make(500));
});
test("guardrail-missing: edited block fails", () => {
  expectFail("guardrail-missing", (r) => edit(skill(r), (t) => t.replace("Make no legal", "Make some legal")));
});
test("guardrail-missing: a changed canonical block fails every skill", () => {
  expectFail("guardrail-missing", (r) => edit(path.join(r, "shared", "guardrails.md"), (t) => t + "- One more rule.\n"));
});
test("guardrails-source: missing canonical file fails", () => {
  expectFail("guardrails-source", (r) => fs.rmSync(path.join(r, "shared", "guardrails.md")));
});
test("tools-used: valid forms pass, missing or malformed fails", () => {
  assert.deepEqual(validate(fixture((r) => edit(skill(r), (t) => t.replace(/Tools used:.*/, "Tools used: none")))), []);
  expectFail("tools-used", (r) => edit(skill(r), (t) => t.replace(/Tools used:.*\n/, "")));
  expectFail("tools-used", (r) => edit(skill(r), (t) => t.replace(/Tools used:.*/, "Tools used: `find_things`")));
  expectFail("tools-used", (r) => edit(skill(r), (t) => t.replace(/Tools used:.*/, "Tools used: a\nTools used: b")));
});
test("skill-missing: folder without SKILL.md fails", () => {
  expectFail("skill-missing", (r) => fs.mkdirSync(D(r, "skills", "empty-one")));
});

for (const dir of ["bin", "commands", "agents"]) {
  test(`forbidden-dir: ${dir}/ fails`, () => {
    expectFail("forbidden-dir", (r) => {
      fs.mkdirSync(D(r, dir));
      fs.writeFileSync(D(r, dir, "x.md"), "x");
    });
  });
}

test("user-config: ${user_config in any file fails", () => {
  expectFail("user-config", (r) => fs.appendFileSync(D(r, "README.md"), "\n${user_config.key}\n"));
  expectFail("user-config", (r) => editJson(D(r, ".claude-plugin", "plugin.json"), (j) => (j.userConfig = {})));
});

test("manifest-name: uppercase, underscore and wrong permanent name fail", () => {
  for (const bad of ["Clear-Day-For-Directors", "clear_day_for_directors", "clear-day-directors"]) {
    expectFail("manifest-name", (r) => editJson(D(r, ".claude-plugin", "plugin.json"), (j) => (j.name = bad)));
  }
  expectFail("manifest-name", (r) => editJson(D(r, "plugin.json"), (j) => (j.name = "nope")));
});
test("manifest-json: missing or invalid Claude manifest fails", () => {
  expectFail("manifest-json", (r) => fs.writeFileSync(D(r, ".claude-plugin", "plugin.json"), "{"));
  expectFail("manifest-json", (r) => fs.rmSync(D(r, ".claude-plugin", "plugin.json")));
});

test("mcp-count: two servers or none fail", () => {
  expectFail("mcp-count", (r) =>
    editJson(D(r, ".mcp.json"), (j) => (j.mcpServers.second = { type: "http", url: "https://mcp.useclearday.com/mcp" })));
  expectFail("mcp-count", (r) => editJson(D(r, "mcp.json"), (j) => (j.mcpServers = {})));
});
test("mcp-url: wrong URL fails in either config, and the plugins are not interchangeable", () => {
  expectFail("mcp-url", (r) => editJson(D(r, ".mcp.json"), (j) => (j.mcpServers["clear-day"].url = "https://example.com/mcp")));
  expectFail("mcp-url", (r) => editJson(D(r, "mcp.json"), (j) => (j.mcpServers["clear-day"].url = "https://mcp.useclearday.com/mcp/find")));
  expectFail("mcp-url", (r) =>
    editJson(path.join(r, "parents", ".mcp.json"), (j) => (j.mcpServers["clear-day"].url = "https://mcp.useclearday.com/mcp")));
});
test("mcp-type: wrong transport type fails", () => {
  expectFail("mcp-type", (r) => editJson(D(r, "mcp.json"), (j) => (j.mcpServers["clear-day"].type = "http")));
});
test("mcp-inline: servers declared inline in the Claude manifest fail", () => {
  expectFail("mcp-inline", (r) => editJson(D(r, ".claude-plugin", "plugin.json"), (j) => (j.mcpServers = {})));
});

const ui = (j) => j.extensions["com.openai"].interface;
test("openai-display-name: 30 chars is the limit and the name is pinned", () => {
  expectFail("openai-display-name", (r) => editJson(D(r, "plugin.json"), (j) => (ui(j).displayName = "x".repeat(31))));
  expectFail("openai-display-name", (r) => editJson(D(r, "plugin.json"), (j) => (ui(j).displayName = "Something Else")));
});
test("openai-short-description: 30 chars passes, 31 fails", () => {
  assert.deepEqual(validate(fixture((r) => editJson(D(r, "plugin.json"), (j) => (ui(j).shortDescription = "x".repeat(30))))), []);
  expectFail("openai-short-description", (r) => editJson(D(r, "plugin.json"), (j) => (ui(j).shortDescription = "x".repeat(31))));
});
test("openai-prompts: 3 prompts of 128 chars pass; 4 prompts or 129 chars fail", () => {
  const three = (r) => editJson(D(r, "plugin.json"), (j) => (ui(j).defaultPrompt = ["a".repeat(128), "b", "c"]));
  assert.deepEqual(validate(fixture(three)), []);
  expectFail("openai-prompts", (r) => editJson(D(r, "plugin.json"), (j) => (ui(j).defaultPrompt = ["a", "b", "c", "d"])));
  expectFail("openai-prompts", (r) => editJson(D(r, "plugin.json"), (j) => (ui(j).defaultPrompt = ["a".repeat(129)])));
});
test("openai-developer-name: missing fails", () => {
  expectFail("openai-developer-name", (r) => editJson(D(r, "plugin.json"), (j) => delete ui(j).developerName));
});
test("openai-interface: missing interface fails", () => {
  expectFail("openai-interface", (r) => editJson(D(r, "plugin.json"), (j) => delete j.extensions));
});
test("openai-icon: missing file, non-PNG and undersized icons fail", () => {
  expectFail("openai-icon", (r) => fs.rmSync(D(r, "assets", "logo.png")));
  expectFail("openai-icon", (r) => fs.writeFileSync(D(r, "assets", "logo.png"), "not a png"));
  expectFail("openai-icon", (r) => fs.copyFileSync(D(r, "assets", "composer-icon.png"), D(r, "assets", "logo.png")) || shrink(D(r, "assets", "logo.png")));
  expectFail("openai-icon", (r) => editJson(D(r, "plugin.json"), (j) => (ui(j).logo = "../parents/assets/logo.png")));
});
function shrink(file) {
  // Rewrite the IHDR width/height to 16x16 (CRC is not checked by the validator).
  const buf = fs.readFileSync(file);
  buf.writeUInt32BE(16, 16);
  buf.writeUInt32BE(16, 20);
  fs.writeFileSync(file, buf);
}

test("file-size: a plugin file over 256 KiB fails, exactly 256 KiB passes", () => {
  assert.deepEqual(validate(fixture((r) => fs.writeFileSync(D(r, "skills", "big.txt"), "x".repeat(LIMITS.fileBytes)))), []);
  expectFail("file-size", (r) => fs.writeFileSync(D(r, "skills", "big.txt"), "x".repeat(LIMITS.fileBytes + 1)));
});
test("file-count: 512 files pass, 513 fail", () => {
  const make = (extra) => (r) => {
    const have = fs.readdirSync(D(r), { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;
    fs.mkdirSync(D(r, "assets", "many"));
    for (let i = 0; i < LIMITS.pluginFiles - have + extra; i++) fs.writeFileSync(D(r, "assets", "many", `f${i}.txt`), "");
  };
  assert.deepEqual(validate(fixture(make(0))), []);
  expectFail("file-count", make(1));
});
test("repo-size: over 50 MiB fails", () => {
  expectFail("repo-size", (r) => {
    const f = path.join(r, "shared", "big.bin");
    fs.writeFileSync(f, "");
    fs.truncateSync(f, LIMITS.repoBytes + 1); // sparse file
  });
});
test("readme-words: 40 words pass, 39 fail, missing fails", () => {
  const words = (n) => (r) => fs.writeFileSync(D(r, "README.md"), Array(n).fill("word").join(" "));
  assert.deepEqual(validate(fixture(words(40))), []);
  expectFail("readme-words", words(39));
  expectFail("readme-words", (r) => fs.rmSync(D(r, "README.md")));
});
test("license-missing: missing LICENSE fails", () => {
  expectFail("license-missing", (r) => fs.rmSync(D(r, "LICENSE")));
});
test("plugin-missing: a missing plugin directory fails", () => {
  expectFail("plugin-missing", (r) => fs.rmSync(path.join(r, "parents"), { recursive: true }));
});

const MJ = (root) => path.join(root, ".claude-plugin", "marketplace.json");

test("marketplace: the real file passes and has the two plugin entries", () => {
  assert.deepEqual(validate(DEFAULT_ROOT), []);
  const m = JSON.parse(fs.readFileSync(MJ(DEFAULT_ROOT), "utf8"));
  assert.equal(m.name, "clear-day");
  assert.deepEqual(m.plugins.map((p) => [p.name, p.source]), [
    ["clear-day-for-directors", "./directors"],
    ["clear-day-for-parents", "./parents"],
  ]);
});
test("marketplace-json: missing or invalid file fails", () => {
  expectFail("marketplace-json", (r) => fs.rmSync(MJ(r)));
  expectFail("marketplace-json", (r) => fs.writeFileSync(MJ(r), "{"));
});
test("marketplace-name: reserved and malformed names fail", () => {
  for (const name of ["claude-plugins-official", "inline", "github", "claudeai-x", "has space", ""]) {
    expectFail("marketplace-name", (r) => editJson(MJ(r), (j) => (j.name = name)));
  }
});
test("marketplace-plugins: a missing, duplicate or extra entry fails", () => {
  expectFail("marketplace-plugins", (r) => editJson(MJ(r), (j) => j.plugins.pop()));
  expectFail("marketplace-plugins", (r) => editJson(MJ(r), (j) => j.plugins.push({ ...j.plugins[0] })));
  expectFail("marketplace-plugins", (r) => editJson(MJ(r), (j) => j.plugins.push({ name: "other", source: "./other" })));
});
test("marketplace-plugins: an entry name that differs from the plugin.json name fails", () => {
  expectFail("marketplace-plugins", (r) => editJson(MJ(r), (j) => (j.plugins[0].name = "clear-day-directors")));
});
test("marketplace-source: a wrong or missing source fails", () => {
  expectFail("marketplace-source", (r) => editJson(MJ(r), (j) => (j.plugins[0].source = "./plugins/directors")));
  expectFail("marketplace-source", (r) => editJson(MJ(r), (j) => (j.plugins[1].source = "./nope")));
});
test("marketplace-owner: missing owner name fails", () => {
  expectFail("marketplace-owner", (r) => editJson(MJ(r), (j) => delete j.owner));
});
test("manifest metadata: repository, license and matching versions are required", () => {
  expectFail("manifest-repository", (r) => editJson(D(r, ".claude-plugin", "plugin.json"), (j) => (j.repository = "https://example.com/x")));
  expectFail("manifest-repository", (r) => editJson(D(r, "plugin.json"), (j) => delete j.repository));
  expectFail("manifest-license", (r) => editJson(D(r, ".claude-plugin", "plugin.json"), (j) => delete j.license));
  expectFail("manifest-version", (r) => editJson(D(r, "plugin.json"), (j) => (j.version = "9.9.9")));
});

test("openai-legal-urls: both https URLs pass, missing or non-https fails", () => {
  const oa = (r, plugin = "directors") => path.join(r, plugin, "plugin.json");
  for (const plugin of ["directors", "parents"]) {
    for (const key of ["privacyPolicyURL", "termsOfServiceURL"]) {
      expectFail("openai-legal-urls", (r) => editJson(oa(r, plugin), (j) => delete j.extensions["com.openai"].interface[key]));
      expectFail("openai-legal-urls", (r) =>
        editJson(oa(r, plugin), (j) => (j.extensions["com.openai"].interface[key] = "http://useclearday.com/terms")));
    }
  }
  assert.deepEqual(validate(fixture()), []);
});
