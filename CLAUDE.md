# Contributor and agent notes

Public repo for the `clear-day-for-directors` (`directors/`) and `clear-day-for-parents` (`parents/`) plugins. Read `README.md`, `templates/SKILL.template.md` and `shared/guardrails.md` before changing anything.

## Check

`npm run check` must pass before every commit. It runs the validator, the wording lint and the node tests. Node 20+, no dependencies.

## Conventions

- Plugin names and folder names are permanent. Never rename them.
- Skills: folder name equals `name`, description under 1,024 characters, body under 500 lines, guardrail block verbatim from `shared/guardrails.md`, exactly one `Tools used:` line.
- American English. Say "the assistant". Refer to other apps by category, never brand. No pricing or promotional wording.
- Never invent tool names or input fields. Use only the tool names a skill's task gives you and describe inputs generically.
- Public repo: never commit secrets, internal hostnames, staging URLs, test-account emails, issue-tracker links or internal ticket chatter.
- Add a passing and a failing fixture test in `scripts/__tests__` for every new validator or lint rule.

## Commits and pull requests

No AI attribution anywhere: no `Co-Authored-By`, session links or "generated with" lines in commits, PR bodies or comments. Do not merge your own pull request.
