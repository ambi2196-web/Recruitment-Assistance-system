# Changelog

## Phase 0 — Foundation (5 November 2026)

### Added
- Next.js app with stakeholder, recruiter and admin views, and a demo role switcher.
- Database schema for all section 10.1 entities, first migration, and fictional seed data.
- `lib/redaction.ts` with a fail-closed self-check, tested against requirements, resumes and call notes.
- `lib/llm.ts`: the only route to a model, with audit log, budget cap and one retry on invalid output.
- A dummy agent (`a0_dummy`) and an admin button to run it.
- Demo protection: a password on deployed demos, and a refusal to run with `DEMO_MODE=true` when `APP_ENV=pilot`.
- Automatic checks on GitHub (`.github/workflows/ci.yml`): tests, build, type check, secret scan.

### Decisions
- Stack: Next.js, as recommended in section 11.1.
- PGlite (embedded Postgres) for local work, so no database account is needed.
- The AI provider is a mock until the owner chooses one (D2). No outside AI call has been made.
- Added `DEMO_ACCESS_PASSWORD` to section 11.4.

### Known to be weak
- **Redaction uses patterns, so it cannot catch everything.** Bare numbers with no money word nearby pass through, such as "seventy five" or "he said 65". Unusual spellings of names can also pass. Treat it as a strong filter, and spot-check it during the pilot.
- **Redaction hides too much on purpose.** Phrases like "bill 3 items" lose their number.
- **Person names are not masked yet.** Requirement signatures keep the sender's name (for example "Dana Whitlock"). FR-1.3 does not cover this, and FR-6.3 masking arrives in Phase 2 for candidates. Raise with the owner before Phase 1.
- The Vercel, Neon and GitHub setup is not done, because it needs the owner's accounts.
- The GitHub checks have not run yet, as nothing has been pushed.
- FR-1.6 access limits are not enforced in depth yet. The inboxes show only redacted text, and nothing displays original text.
- There is no lint step and no Playwright test yet. The Playwright demo path arrives with Phase 1's flow.
