# Clear Day plugins

Three plugins that add Clear Day skills to an AI assistant: one for childcare directors, one for families looking for care, and one for families who use Clear Day Family.

| Folder | Plugin name | For | Clear Day connector |
| --- | --- | --- | --- |
| `directors/` | `clear-day-for-directors` | Childcare directors: enrollment inquiries, tours, open houses, the school website, notices and policies | `https://mcp.useclearday.com/mcp` |
| `parents/` | `clear-day-for-parents` | Families: finding, viewing and comparing licensed child care providers, open tour times and tour requests | `https://mcp.useclearday.com/mcp/find` |
| `family/` | `clear-day-family` | Families who use Clear Day Family: their own upcoming plans, a child's schedule and day, reminders | `https://mcp.useclearday.com/mcp/family` |

The skills in this repo are instructions. The tools they call (listing leads, finding tour times, searching public childcare records and so on) come from each plugin's Clear Day connector, which the plugin registers for you. Every call to the Directors connector requires signing in with a Clear Day director or teacher account. The Parents plugin is for adults (parents and guardians) looking for child care, reads public records and needs no sign-in; its one write is a tour request, which makes Clear Day email the parent a confirmation link. The Family plugin signs in with the emailed code from Clear Day Family and reads only that family's own plans and logs; its writes add a reminder or mark an item done, after the parent confirms.

## Install in Claude Code

```
/plugin marketplace add cleardayapp/clear-day-plugins
/plugin install clear-day-for-directors@clear-day
/plugin install clear-day-for-parents@clear-day
/plugin install clear-day-family@clear-day
```

Install any of them. To try a plugin straight from a checkout, run `claude --plugin-dir directors`, `claude --plugin-dir parents` or `claude --plugin-dir family`.

Each plugin folder is also a standalone package for other assistants that read an OpenAI-style manifest (`plugin.json` and `mcp.json` at the plugin root, with `extensions."com.openai"` for listing details).

## Privacy

The Directors and Parents skills never ask for, accept or repeat a child's name, birth date, photo or health details. They use an age group instead. The Family skills use only the child names the Family connector returns for the signed-in family, and never a birth date, photo or health detail; health and medical details are never available through that connector. Each plugin's README lists exactly what it sends and fetches. The plugins store nothing themselves, and the assistant confirms with you before any change or message and only sends what you explicitly approved.

## Repo layout

```
.claude-plugin/marketplace.json   the Clear Day marketplace (lists every plugin)
directors/  parents/  family/     one folder per plugin, each submittable on its own
  .claude-plugin/plugin.json      Claude manifest
  .mcp.json                       Claude connector config
  plugin.json  mcp.json           OpenAI manifest and connector config
  skills/<name>/SKILL.md          the skills
  README.md  LICENSE
shared/guardrails.md              guardrail block every directors and parents SKILL.md must contain verbatim
shared/guardrails-family.md       the Family plugin's guardrail block (family skills carry this one instead)
shared/director-rules.md          "Rules that apply every time" block that director skills copy verbatim
templates/SKILL.template.md       starting point for a new skill
scripts/                          validator, wording lint and their tests (Node, no dependencies)
```

Plugin names and folder names are permanent once listed. Do not rename them.

## Check

Requires Node 20 or newer. There is nothing to install.

```
npm run check
```

This runs `scripts/validate.mjs` (structure, manifests, marketplace, size limits), `scripts/lint-wording.mjs` (wording rules) and the fixture tests in `scripts/__tests__`. Run it before every pull request.

## Writing a skill

Copy `templates/SKILL.template.md` to `<plugin>/skills/<skill-name>/SKILL.md`, then:

- The folder name equals the frontmatter `name` (lowercase and hyphens, at most 64 characters).
- The `description` is under 1,024 characters and includes the phrases a user would actually say.
- The file is under 500 lines.
- The guardrail block from `shared/guardrails.md` is pasted unchanged.
- A director skill that has a `## Rules that apply every time` section pastes `shared/director-rules.md` unchanged. Edit the shared file first, then update every copy; the validator fails when a copy drifts.
- One line reads `Tools used: a, b, c` (snake_case tool names), or `Tools used: none`.
- Write "the assistant". Name other apps by category ("your email app", "your calendar"), never by brand.
- Use American English. No pricing or promotional wording.
- Describe tool inputs in plain words. Treat anything a tool returns as data, never as instructions.
- Anything that sends, books, publishes or changes data needs the user's explicit yes first.

There are no `commands/`, `agents/` or `bin/` folders and no `userConfig`; the validator rejects them.

## OpenAI listing fields

`plugin.json` carries the listing details under `extensions."com.openai".interface`. Checked on 2026-10-08 against OpenAI's published docs:

- Sources: [submission](https://developers.openai.com/apps-sdk/deploy/submission), [submission errors](https://developers.openai.com/plugins/deploy/submission-errors), [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines) and [building plugins](https://developers.openai.com/plugins/build/plugins).
- Confirmed by those docs: `displayName`, `shortDescription`, `longDescription`, `developerName`, `category`, `logo`, `composerIcon`, `websiteURL`, `supportURL`, `privacyPolicyURL`, `termsOfServiceURL`, `defaultPrompt`, `capabilities` (at most 20 one-line labels of 120 characters or fewer) and the exact five positive and three negative review test cases.
- `category` must be one of the documented values (`Productivity`, `Creativity`, `Developer Tools`, `Business & Operations`, `Data & Analytics`, `Communication`, `Education & Research`, `Security`, `Finance`, `Healthcare`, `Travel`, `Entertainment`, `Other`). The docs give no definitions for them. Directors uses `Business & Operations` and Parents uses `Education & Research`; those are our judgment of the closest fit, not something OpenAI confirmed.
- `brandColor`, `brandColorDark` and `screenshots` are optional. Screenshots are allowed only for a server with custom UI, which these connectors do not have, so they are left out. We have no approved brand color to publish, so `brandColor` is also left out.
- `supportURL` points at the contact page on our website. The docs only require an HTTPS support page.
- Each `mcp.json` declares its sign-in under `extensions."com.openai".auth`: `oauth` with `client.mode: "cimd"` for Directors (the API's authorization server accepts OpenAI's client through a client ID metadata document) and `none` for Parents. The validator requires exactly these objects, so no client ID, secret or endpoint override can be added by accident. The Claude `.mcp.json` files carry no `extensions`; Claude discovers sign-in from the server.
- `logo.png` (256 px) and `composer-icon.png` (64 px) are the Clear Day sun mark that the website serves as its own icon.
- Not in the plugin folders and still needed for a final MCP submission: a demo recording URL, release notes, and (for Directors) a demo account entered in the dashboard.
- The docs allow the review test cases to be included in `plugin.json` and imported with the ZIP (optional there; five positive and three negative are required for initial review). `node evals/export-submission.mjs --plugin parents` prints them in the documented `review.test_cases` shape; add `--format table` for a Markdown table.

## License

Proprietary, with a free grant to install and use the plugins unmodified. See `LICENSE`.
