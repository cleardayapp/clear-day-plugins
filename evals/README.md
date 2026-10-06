# Submission test cases

Test cases for the OpenAI app and Anthropic connector submissions, one file per plugin. OpenAI asks for at least 5 positive and 3 negative cases per app (prompt, expected tool, expected behavior). Anthropic's review exercises every tool, so each file also holds at least one positive case per tool.

| File | Purpose |
| --- | --- |
| `directors.json`, `parents.json` | Cases. `submission: true` marks the 5 positive + 3 negative cases submitted. |
| `tool-lists/*.json` | Pinned tool names with `plans` and `signedIn`. Update when the connector's tools change. |
| `check.mjs` | Validates shape, counts, tool names, and privacy rules. |
| `export-submission.mjs` | Prints the submission cases as a Markdown table. |

Tools in `tool-lists/*.json` carry `status`: `live` or `planned`. Planned tools are not built yet but are expected to ship before submission, so they have cases too. `check.mjs` prints how many cases depend on them. Directors submission cases must use live tools; the parents set reflects the finished product. When a planned tool ships, flip its `status` to `live`.

The export columns are `id`, `kind`, `prompt`, `expectedTool`, `expectedBehavior`. OpenAI's submission guidelines were not reachable when this was written, so re-check the columns against the live submission form before submitting.

Case fields: `id`, `prompt`, `kind` (`direct`, `indirect`, `negative`), `expect` (`{tool}` or `{none: true}`), `signedIn`, `plan` (directors), `expectedBehavior`, `notes`, optional `mustNotCall` (tools a negative case must not call). Use fictional names and `@example.com` emails only. The one case per plugin that volunteers child details sets `fictionalChild: true`.

## Run the check

```
node evals/check.mjs
node evals/export-submission.mjs --plugin directors
node evals/export-submission.mjs --plugin parents
```

Node 20 or newer, no dependencies. The check exits non-zero on any problem.

## Record a manual pass

1. Directors: sign in to a FREE-plan demo school. Parents: use the connector anonymously.
2. In Claude, add the connector, start a new chat, and paste each case's `prompt`.
3. Repeat in ChatGPT with the app enabled.
4. For each case, note whether the expected tool was called (or no tool for `{none: true}`), whether the behavior matched `expectedBehavior`, and the date. Keep results outside this repo.
5. Destructive tools (`propose_school_website_change`, `book_school_tour`, `create_school_calendar_event`, `update_enrollment_lead_stage`, `request_child_care_tour`, the ones flagged `destructive` in `tool-lists/*.json`) act for real. Use the demo school and `@example.com` addresses.
