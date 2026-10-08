# Test cases

Test cases for each plugin: prompts, the tool the assistant is expected to call (or none), and the expected behavior. Each file holds at least 5 positive and 3 negative cases, plus at least one positive case per tool so every tool is exercised.

| File | Purpose |
| --- | --- |
| `directors.json`, `parents.json` | Cases. `submission: true` marks the 5 positive + 3 negative cases exported as the submission set. |
| `tool-lists/*.json` | Pinned tool names with `plans` and `signedIn`. Update when the connector's tools change. |
| `check.mjs` | Validates shape, counts, tool names, and privacy rules. |
| `export-submission.mjs` | Prints the submission cases as a Markdown table; exits 1 if one expects a planned tool. |

Tools in `tool-lists/*.json` carry `status`: `live` or `planned`. Planned tools are not available yet but have cases so the set is ready when they are. `check.mjs` prints how many cases depend on them. Submission cases (either plugin) must use live tools: `check.mjs` and `export-submission.mjs` both fail otherwise. Flip a tool's `status` to `live` when it ships.

The export columns are `id`, `kind`, `prompt`, `expectedTool`, `expectedBehavior`. If a submission form asks for different fields, adjust `export-submission.mjs`.

Case fields: `id`, `prompt`, `kind` (`direct`, `indirect`, `negative`), `expect` (`{tool}` or `{none: true}`), `signedIn`, `plan` (directors), `expectedBehavior`, `notes`, optional `mustNotCall` (tools a negative case must not call). Cases that expect a destructive tool set `confirmed: true` and the prompt contains an explicit confirmation (for example "Yes, I confirm"). Use fictional names and `@example.com` emails only. The one case per plugin that volunteers child details sets `fictionalChild: true`.

## Run the check

```
node evals/check.mjs   # also runs as part of `npm run check`
node evals/export-submission.mjs --plugin directors
node evals/export-submission.mjs --plugin parents
```

Node 20 or newer, no dependencies. The check exits non-zero on any problem.

## Record a manual pass

1. Directors: sign in to a FREE-plan demo school for every case with `plan: "FREE"` (this covers all submission cases). Cases marked `RUN` or `GROW` need a demo school on that plan (or higher) to reach their tool; run them separately. Parents: use the connector anonymously. Tour cases need the seeded "(Demo)" provider in ZIP 23219 (Richmond, VA), found by a ZIP search rather than a city search.
2. In Claude, add the connector, start a new chat, and paste each case's `prompt`.
3. Repeat in ChatGPT with the app enabled.
4. For each case, note whether the expected tool was called (or no tool for `{none: true}`), whether the behavior matched `expectedBehavior`, and the date. Keep results outside this repo.
5. Destructive tools (`propose_school_website_change`, `book_school_tour`, `create_school_calendar_event`, `update_enrollment_lead_stage`, `request_child_care_tour`, the ones flagged `destructive` in `tool-lists/*.json`) act for real. Use the demo school and `@example.com` addresses.
