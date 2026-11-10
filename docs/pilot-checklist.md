# Pilot checklist (Phase 4 and the real-data gate)

The owner signs this off before any real data enters the desk. Status as of 10 November 2026.

## Phase 4 build items (section 12)

| Item | Status |
|---|---|
| Mailbox integration | Built for Gmail with a demo mailbox. Not yet connected (see `docs/gmail-setup.md`). The pilot mailbox needs IT's choice |
| PDF and DOCX resume parsing | Built, including hidden Word text detection |
| Hindi toggle polish | Built. `HINDI_DEFAULT` sets new users' starting choice |
| Evaluation harness | Built (`npm run eval`). Waiting for the golden set and a real AI provider |
| Accessibility and plain-English pass | Done: contrast checked, keyboard focus, skip link, screen-reader progress messages |
| Pilot onboarding notes | `docs/pilot-onboarding.md` |
| Email reminders (FR-9.2) | Built. They work once the mailbox is connected |

## Owner actions

- [ ] **Choose the AI provider**, with IT approval (D2). The desk runs on a mock until then.
- [ ] **Prepare the golden set** (below).
- [ ] **Run the evaluation** on the real provider and sign off the report.
- [ ] **Capture baselines** (below).
- [ ] **Choose the pilot users**, one recruiter and one stakeholder, and get their managers' agreement.
- [ ] **Decide whether to remove client contact names**, such as the signature name in REQ-A. Today they reach the AI.

## Golden set (section 13)

Prepare 10 to 15 past requirements, anonymised by hand. Save each as one file in `eval/golden/`, for example `eval/golden/G01.json`. Git ignores this folder, so the files never reach GitHub.

```json
{
  "id": "G01",
  "industry": "energy services",
  "text": "Subject: ...\n\nThe email text, with client names, rates and people removed by hand.",
  "what_client_wanted": "One line on what the client actually needed.",
  "expected_ambiguous_terms": ["ontology"]
}
```

Run it:

```bash
npm run eval
```

The report lands in `eval/reports/`, which git also ignores. Re-run it after every prompt change. If the report says **Worse than the last run**, do not ship that prompt.

## Baselines (section 4)

Fill this in before the pilot starts, for the pilot users only.

| Measure | How | Value |
|---|---|---|
| Submit-to-interview ratio | Last 4 to 8 weeks, from Conrep | |
| Minutes per submission | Time 5 submissions done the current way | |
| Briefs or clarifications per requirement today | Ask the recruiter | |

## Real-data gate (`DEPLOYMENT_PLAN.md` section 5)

- [ ] IT approves the AI provider, with written terms on data retention and no training on inputs
- [ ] IT approves Vercel and the database provider as holders of real data, including the storage region
- [ ] IT approves the pilot mailbox
- [ ] Legal or compliance confirms that client contracts allow this use
- [ ] Legal or compliance confirms how candidate data may be handled, kept and deleted
- [ ] A separate pilot environment exists, with `APP_ENV=pilot`, `DEMO_MODE=false` and its own database
- [ ] Real login is in place, since demo mode cannot be used on the pilot
- [ ] Redaction passes the golden set with zero leaks
- [ ] Database backups are on, and a restore has been tested

Owner sign-off: ____________________  Date: __________
