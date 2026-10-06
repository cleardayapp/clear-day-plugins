# Clear Day plugins

Two plugins for the AI connector, kept in this repo under `plugins/` and independent of the Next.js site (nothing here is imported by `app/` or shipped from `public/`):

| Folder | Plugin name (permanent) | Connector URL |
| --- | --- | --- |
| `directors/` | `clear-day-for-directors` | `https://mcp.useclearday.com/mcp` |
| `parents/` | `clear-day-for-parents` | `https://mcp.useclearday.com/mcp/find` |

Each plugin carries two manifests over one `skills/` folder:

- Claude: `.claude-plugin/plugin.json` and `.mcp.json` (`type: "http"`).
- OpenAI: root `plugin.json` (interface under `extensions."com.openai"`) and `mcp.json` (`type: "streamable-http"`), with placeholder icons in `assets/`.

Names and slugs are permanent once listed. Do not rename them.

## Layout

```
shared/guardrails.md      canonical guardrail block; every SKILL.md must contain it verbatim
templates/SKILL.template.md
scripts/validate.mjs      structural limits (Node, no dependencies)
scripts/lint-wording.mjs  wording rules (Node, no dependencies)
scripts/__tests__/        node --test fixtures, one passing and one failing sample per rule
directors/  parents/      the plugins
```

## Check

```
pnpm check:plugins
# same as:
node plugins/scripts/validate.mjs && node plugins/scripts/lint-wording.mjs && node --test plugins/scripts/__tests__
```

To try a plugin locally: `claude --plugin-dir plugins/directors` (or `plugins/parents`).

## Writing a skill

Copy `templates/SKILL.template.md` to `<plugin>/skills/<skill-name>/SKILL.md`. The folder name must equal the frontmatter `name` (at most 64 characters), the description stays under 1,024 characters, the file stays under 500 lines, the guardrail block is pasted unchanged, and one line reads `Tools used: a, b, c` (snake_case tool names, or `Tools used: none`). Skills say "the assistant", name app categories rather than products, and use American English.

## Not here

No `commands/`, `agents/`, `bin/` or `user_config`, no zips, and no hosted marketplace. Distribution is directory submission (CV1-78).
