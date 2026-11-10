# Changelog

## Phase 4 — Pilot readiness (10 November 2026, built on the mock AI)

Started before Phases 0 to 3 had fully passed, on the owner's instruction. Phase 4 is done only when the owner signs off `docs/pilot-checklist.md`.

### Added
- **Desk mailbox, in and out**, for a Gmail demo mailbox (owner's choice):
  - forwarded client emails become checked requirements
  - stakeholder replies tagged `[REQ-n]` become client answers
  - the desk sends notifications and day 3 and day 7 reminder emails
  - Setup is in `docs/gmail-setup.md`. Until the Google credentials are added, nothing is sent.
- **PDF and Word resume uploads.** File type comes from the content. Hidden Word text is flagged, whether it is hidden, white or too small to read.
- **Evaluation harness** (`npm run eval`). It scores A1 and A2, writes a report, and stops a prompt version that does worse than the last run. Fictional examples are in `eval/examples/`.
- **`HINDI_DEFAULT`** now sets each new user's starting Hindi choice. The Hindi button reports its state to screen readers.
- **Accessibility:**
  - colour contrast checked at 5.6:1 or better in light and dark mode
  - visible keyboard focus and a skip link
  - screen readers hear when work starts
- **Pilot documents:** `docs/pilot-onboarding.md`, `docs/pilot-checklist.md` and `docs/pilot-notes.md`.
- `npm run make-sample-files` writes fictional PDF and Word resumes to `seed/files/`.

### Security decisions
- **The desk emails only its own users.** Code refuses any other address, so it cannot reach a client or a candidate (G2).
- **Inbound email must pass Gmail's DMARC check** and come from a desk user. Anything else is ignored with no reply, so nobody can pose as a recruiter or use the desk to send spam.
- **Notification emails carry a redacted title and a link only.** Details stay in the desk.
- **A failed email never undoes the decision that triggered it.**
- **Subjects cannot add mail headers.**
- **All `/api/` routes skip the demo password and check `CRON_SECRET` instead.**

### Known to be weak
- **The mailbox has not talked to real Gmail.** It is tested with a stand-in mailbox. The first real run needs the owner's Google credentials.
- **The Gmail refresh token lasts 7 days** while the Google app is in Testing.
- **The inbox is checked once a day,** a limit of Vercel's free plan. Use **Check the inbox now** in demos.
- **Senders whose company has no DMARC record are ignored.** Gmail addresses always pass.
- Email attachments are not read. Resumes still go in through **Add a candidate**.
- PDF hidden text, such as white text, is not detected. Only Word files are checked for it.
- The evaluation harness has run only on the mock, with fictional examples. The real golden set and provider are still to come.
- Real login is not built. It needs an email sender approved by IT. Until then, the pilot cannot run, because demo mode is refused on the pilot.
- One test run failed during start-up and could not be repeated in six later runs. Timeouts were raised, but the cause is not confirmed.

## Phase 3 — Feedback loop and metrics (5 November 2026, built on the mock AI)

Started before Phases 0 to 2 had fully passed, on the owner's instruction.

### Added
- One-click client outcomes, shown to the recruiter with the reason (M9).
- In-app reminders at day 3 and day 7, worked out when the page opens (FR-9.2).
- "Wrong" on brief and kit lines, and an admin error log with commit links (M10).
- Agent A5 weekly digest from aggregated counts, with an admin button and a weekly job (M11, FR-11.3).
- Metrics page with the section 4 metrics and three charts (M12).
- Fictional outcomes in `seed/outcomes.ts`, so the digest and metrics have data in a demo.

### Decisions
- "No reply yet" is not a client outcome. It quiets the current reminder until the next stage.
- Outcome logged is measured against forwarded submissions, not all submissions. Section 4 says "all", but a submission the stakeholder rejected never reaches the client, so it could not have an outcome.
- Selected counts as an interview in submit-to-interview.
- Metrics count everything in a deployment. The pilot has its own database, so it needs no date filter.
- Draft-to-submit time is shown as a guide. Self-report at pilot end stays the real measure.
- Added `weekly_digests`, four timestamps on `submissions`, and three fields on `error_flags`.
- `db:seed` now refuses to run when `APP_ENV=pilot`.
- `/api/digest` skips the demo password and checks `CRON_SECRET` instead, because a scheduler cannot type a password. With no secret set, it stays closed.

### Known to be weak
- **Digest observations are mock text.** The counts are real. A real model's observations are untested.
- **The weekly job has never run on a host.** The route is tested, but `vercel.json` needs a deployment. Hobby plan limits may apply.
- Reminders are in-app only, so they appear only if the stakeholder opens the desk. Email comes in Phase 4.
- The error log and metrics are admin-only. Recruiters see only that their flag was sent.
- Metrics have no baselines yet, so "Better than baseline" cannot be judged (see section 4).
- Local demo data made before this fix has seed submissions under Recruiter Two.

## Phase 2 — Screening kit and submission quality (5 November 2026, built on the mock AI)

Started before Phases 0 and 1 had fully passed, on the owner's instruction.

### Added
- Agent A3 screening kit, printable, with code checks for 5 questions and at least 2 on lived experience (M5).
- Deterministic checks for dates, gaps, claimed years, phone code, time zone, must-haves, instruction-like text, hidden text and near-duplicates (FR-6.2).
- `redactCandidateText`: masks the candidate's identity, then applies full redaction, to both resumes and call notes.
- Agent A4 submission drafter with no tools. Code rejects verdict wording such as "best match" (G3, G4).
- Recruiter checkpoint, stakeholder decision, plain-English rejection reasons and Conrep-ready text (M7, M8).
- Synthetic call notes in `seed/call-notes/`.

### Fixed
- Failed forms no longer clear what was typed. A redaction stop used to wipe a pasted email.
- An email address could survive name masking as `[CANDIDATE]@example.com`. Emails are now removed first, and the self-check looks for leftover domains.

### Decisions
- Added a `submission_actions` table for who approved, forwarded or rejected (G5).
- Added `model` and `prompt_version` to `screening_kits` (G6).
- Claimed years are flagged only when overclaimed by more than 1 year. A resume that understates is not flagged.
- Conrep text leaves out rates, and includes the real client name because Conrep is internal.

### Known to be weak
- **Drafts and kits are mock text.** Evidence comes from a simple word match, so "missing" there can disagree with the code flags. Only the deterministic checks are proven.
- **A3 and A4 have not faced a real model.** Prompt-injection resistance in particular needs testing against one. Today's defence is delimiters, no tools, code flags and verdict rejection.
- Deterministic parsing expects common resume layouts. Unusual date or heading styles may produce extra or missing flags.
- The verdict filter can over-block harmless wording, such as "feature ranking pipeline". That draft would fail with an error.
- Hidden-text detection covers plain text only. Real white-on-white text needs the PDF and DOCX parsing in Phase 4.
- The original resume is not stored, so a stakeholder sees only the summary, evidence and flags.

## Phase 1 — Requirement check and brief (5 November 2026, built on the mock AI)

Started before Phase 0's deployed-link check passed, on the owner's instruction.

### Added
- Intake for recruiters, with redaction before anything is saved or sent (M1).
- Admin client registry and prospect terms (FR-1.2).
- Agent A1 requirement check, and the stakeholder SEND, EDIT and SKIP checkpoint (M2, M3).
- Agent A2 recruiter brief, with versions, "What changed", assumption banner and Hindi toggle (M4).
- Code rejects boolean syntax in LinkedIn filters, instead of trusting the prompt (G8).
- Mock outputs for all three seed requirements, so the workflow runs with no AI provider.

### Decisions
- Added a `requirement_actions` table for who did what and when (FR-3.5, G5). Section 10.1 had no home for this.
- Added `model` and `prompt_version` to `briefs`, because G6 must show the model.
- Requirement titles are redacted, because they appear in lists.
- A brief v1 is created on SEND as well as SKIP, so recruiters can start while the client replies. Open questions show as a banner.

### Known to be weak
- **The AI quality checks have not really passed.** Flagging "ontology", and the content of every brief, comes from canned mock answers. These checks need a real model.
- **Speed and one-screen fit are mock results.** Pages fit 1366×768 with mock text, and a real model may write more. The 60-second target is untested.
- **Person names still reach the AI input.** "Dana Whitlock" stays in REQ-A's redacted text. The owner needs to decide on this before a real provider is connected.
- SEND and SKIP save the decision before the brief is written. If the brief fails, the stakeholder sees a retry button.
- Any stakeholder can open any requirement, because `Requirement` has no stakeholder field yet.
- Registry changes do not re-redact requirements already saved.
- Original text is limited by role on the pages, not by the database.
- No Playwright test yet. The flow was checked by hand in the browser and by workflow tests.

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
- There is no lint step and no Playwright test yet.
