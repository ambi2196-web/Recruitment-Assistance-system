# Requirement Desk — Phase-wise Deployment Plan (v0.1)

Owner: Ashu | Based on: `REQUIREMENTS.md` v0.2 | Date: 5 November 2026

`REQUIREMENTS.md` section 12 says **what to build**. This plan says **how each build reaches people safely**: where it runs, who can use it, what data it may hold, and what must pass before moving on.

Deployment phases (DP) use the same numbers as build phases. DP5 and DP6 are new.

---

## 1. Plan at a glance

| Phase | Goal | Who uses it | Data | Timing* |
|---|---|---|---|---|
| **DP0** Foundation | Private app online, safe release process | Owner | Synthetic | Week 1 |
| **DP1** First demo | Requirement check and brief work online | Owner, invited viewers | Synthetic | Week 2 |
| **DP2** Submission flow | Full recruiter and stakeholder checkpoints | Owner + 1–2 testers | Synthetic | Weeks 3–4 |
| **DP3** Full demo | Complete loop with metrics | Demo audience, IT reviewer | Synthetic | Weeks 4–5 |
| **DP4** Pilot readiness | Separate pilot environment, approvals, evaluation | Owner + IT | Synthetic | Weeks 5–7 |
| **Real-data gate** | Owner and IT sign off (section 5) | — | — | Before DP5 |
| **DP5** Controlled pilot | Test with real work, in two waves | 1 recruiter + 1 stakeholder, then 2 of each at most | Real, if approved | Weeks 7–11 |
| **DP6** Decision | Expand, fix, or stop | Owner + leadership | Pilot results | Week 12 |

*Timing adds up the build targets in section 12. It assumes no waiting between phases. IT approval is the most likely cause of delay.

**The most important dates are not build dates.** Send the IT request during DP1, not DP4. Start capturing baselines before DP5.

---

## 2. Environments

| Environment | Purpose | Database | `DEMO_MODE` | Real data? |
|---|---|---|---|---|
| **Local** | Development and tests | Local or Neon dev branch | true | Never |
| **Preview** | Automatic test copy of each change | Temporary Neon branch | true | Never |
| **Demo** | Stable link for demos | Demo database | true | Never |
| **Pilot** | Real use | Separate database, created in DP4 | **false** | Only after the gate |

Rules:
- Demo and Pilot never share a database, an API key, or a Vercel project. This stops the role switcher from ever reaching real data.
- The Pilot app must refuse to start if `DEMO_MODE=true`.
- Every non-local environment sits behind a login or password. See gap 4 in section 7.

---

## 3. Release process (from DP0 onward)

1. Work happens on a branch. No direct changes to `main`.
2. Every change runs these automatic checks:
   - unit tests, including the 30+ redaction cases
   - schema validation tests
   - secret scan, so that no keys reach git
   - no boolean syntax in LinkedIn filter fields (G8)
   - no score, rank or fit fields in the data model, UI or exports (G4)
3. A Preview link is created. The owner checks it.
4. Merging to `main` updates Demo.
5. Pilot updates only by a deliberate step, after the Playwright demo path passes on Demo.
6. A prompt or model change also needs `npm run eval`. It must not score worse than the current version (section 13).

**If something goes wrong**

| Problem | Response |
|---|---|
| Bad release | Use Vercel's instant rollback to the last good version |
| Bad database change | Back up before each migration. Only make additive changes during the pilot |
| AI misbehaves or spends too fast | Set `MONTHLY_BUDGET_USD=0` and redeploy. All model calls stop; saved work stays readable. Test this in DP0 |
| Possible data leak | Stop model calls at once, then follow section 6 |

---

## 4. Phases in detail

### DP0 — Foundation (Build Phase 0)

**Deploy**
- Create the git repository and a **private** GitHub repo. The project folder is not a git repo yet.
- Add `.gitignore` early. It must exclude `.env`, local data folders, and `Claude Setup.exe`.
- Set up the Vercel project, Neon database, Preview environments and automatic checks.
- Add `.env.example`. Store real keys only in Vercel settings.
- Put the Demo link behind access protection.
- Choose the stack (Next.js recommended; the owner is not a developer and Vercel keeps hosting simple). Record it in `CLAUDE.md`.

**Exit gate**
- [ ] Seed data loads on Demo
- [ ] Redaction tests pass in the automatic checks
- [ ] A dummy agent call appears in `AiCall`
- [ ] The budget cap blocks a call when reached
- [ ] The Demo link refuses a visitor with no access
- [ ] A rollback has been tried once

### DP1 — First demo (Build Phase 1)

**Deploy**
- Release M1 to M4 to Demo with a low budget cap.
- Confirm that long model calls finish on Vercel. FR-2.4 allows up to 60 seconds, so check the hosting time limit early.
- **Send the IT request** (see section 5). Use this demo to show IT what the tool does.

**Exit gate**
- [ ] REQ-A works end to end on the Demo link, not only locally
- [ ] REQ-B shows zero client names or rates in stored model inputs
- [ ] Every brief fits 1366×768 and has no boolean syntax
- [ ] Each output shows "Draft — check before use", the model and the time (G6)
- [ ] Cost per requirement is recorded, to set later budget caps

### DP2 — Submission flow (Build Phase 2)

**Deploy**
- Release M5 to M8 to Demo.
- Invite 1–2 friendly testers to use fictional data and give feedback.
- **Resolve gap 1 first** (section 7): call notes and resumes must be redacted before this phase ships.

**Exit gate**
- [ ] R1–R4 produce the expected flags on Demo
- [ ] Submit stays disabled until every flag is marked
- [ ] R3's hidden instruction is flagged and not followed
- [ ] Forward and reject both work, and the recruiter sees the reason
- [ ] Time one submission against the current process. It must not be slower (section 4 constraint)

### DP3 — Full demo (Build Phase 3)

**Deploy**
- Release M9 to M13 to Demo.
- Add weekly digest scheduling (see gap 3).
- Warm up the database before live demos. Free databases can sleep and make the first page slow.
- Rehearse the 5-minute script (section 14) twice on the Demo link. Keep a recording as a backup.

**Exit gate**
- [ ] A full cycle appears correctly in metrics
- [ ] The digest generates from seed outcomes, with no candidate-level data
- [ ] The Playwright demo path passes on Demo
- [ ] Owner confirms: proceed to pilot preparation, or stop at demo

### DP4 — Pilot readiness (Build Phase 4)

**Deploy**
- Create the separate Pilot environment on paid plans under a **company-owned** account (see section 8).
- Turn on database backups, and confirm a restore works.
- Turn on real login and limit it to approved company email addresses. Confirm FR-1.6 access limits.
- Add mailbox integration if IT approves it. Limit the app's access to the one shared desk mailbox. Only allow sending to internal addresses (G2).
- Add PDF/DOCX parsing. Treat parsed text as untrusted (G3).
- Run the evaluation on the 10–15 golden requirements. The owner must prepare these **by the start of DP4**.
- Capture baselines (see gap 5). Write the pilot guide and a one-page "what to do if the desk is down" note: go back to the current process.

**Mailbox fallback:** if IT has not approved a mailbox, run the pilot with paste-in. Do not delay the pilot for it.

**Exit gate**
- [ ] Owner signs off the evaluation results
- [ ] A security test on Pilot passes: wrong role cannot open original text
- [ ] Backup restore has been tested
- [ ] Baselines are recorded
- [ ] Pilot checklist is complete

### Real-data gate

See section 5. All items must pass. If not, use the fallback there.

### DP5 — Controlled pilot (real work)

Pilot users must include **one recruiter and one stakeholder**, because the workflow crosses both roles.

| Wave | Length | Users | Scope | Move on when |
|---|---|---|---|---|
| **Wave 1** | 2 weeks | 1 recruiter + 1 stakeholder | 3–5 live requirements. Owner checks every redaction result daily | No guardrail incidents; users are still choosing to use it |
| **Wave 2** | 2+ weeks | Up to 2 of each role | All their suitable requirements | — |

**Weekly routine (owner, about 1 hour)**
- Review the error log, redaction blocks and AI costs
- Spot-check 5 `AiCall` inputs for leaks
- Check section 4 metrics
- Add findings to `docs/pilot-notes.md` after each user session

**Pause the pilot if:**
- any client name, rate or candidate identifier reached a model
- anything left the desk without a human action
- a score or rank appeared anywhere
- submissions become slower for two weeks in a row
- users stop using the tool or go around it

### DP6 — Decision

Compare results with baselines and choose one:

| Decision | When |
|---|---|
| **Expand** to more users | No incidents, brief errors under 2 per 10 by week 4, outcomes logged over 50%, submissions not slower |
| **Fix and re-pilot** | Value is visible but one or two targets were missed |
| **Stop** | Users do not adopt it, or guardrails cannot be kept |

Treat submit-to-interview as a direction only. A few users over four weeks is too small a sample to prove a change.

Also decide what happens to real pilot data: keep it, or delete it according to IT's rules. Expanding would need real SSO and possibly a Conrep review; both are out of prototype scope.

---

## 5. Real-data gate

No real client or candidate data enters the desk until every item is ticked.

- [ ] IT approves the AI provider, including written terms on data retention and no training on inputs (D2)
- [ ] IT approves Vercel and the database provider as holders of real data, including the storage region
- [ ] Legal or compliance confirms that client contracts allow this use
- [ ] Legal or compliance confirms how candidate personal data may be handled, including retention and deletion
- [ ] All section 7 gaps are closed
- [ ] Redaction passes the golden set and all seed data with zero leaks
- [ ] `DEMO_MODE=false` is confirmed on Pilot
- [ ] Owner has recorded the sign-off with name and date

**Fallback if approval is late:** run a shadow pilot. Users work on hand-anonymised past requirements on Demo-style synthetic rules, and compare briefs with what they would have done. This tests usefulness and brief quality. It cannot measure interview outcomes.

---

## 6. If data leaks

1. Set the budget to 0 and redeploy to stop all model calls.
2. Save the `AiCall` record. Do not delete evidence.
3. Tell the owner and IT the same day. IT decides any contact with the provider or client.
4. Add the missed pattern as a new redaction test.
5. Resume only after the owner and IT agree.

---

## 7. Gaps in the requirements to close

These came up while planning against v0.1. The fixes are now written into `REQUIREMENTS.md` v0.2, but each one still has to be built or done by its "Close by" phase.

| # | Gap | Why it matters | Fix | Close by |
|---|---|---|---|---|
| 1 | **Call notes and resumes are not run through the redaction module.** FR-6.3 masks only name, email and phone | Call notes are likely to mention pay rates and client names. This would break G1 | Apply full redaction and the fail-closed check to every A4 input. Add tests | DP2 |
| 2 | **`AiCall` has no redacted-input field.** FR-13.1 omits it, yet G9 requires it | The Phase 1 gate says "verified from `AiCall` records", which is impossible without it | Add the field to `AiCall` | DP0 |
| 3 | **Some deployment needs are undefined.** There are no settings for login secrets or the magic-link email sender, and no scheduler for the weekly digest | These would block login and the digest | Add the variables. Work out reminders when a page opens; run the digest with a weekly scheduled job or an admin button | DP0 / DP3 |
| 4 | **`DEMO_MODE` on a public link gives anyone any role** | A stranger could spend the AI budget or browse the app | Use Vercel access protection or a shared password | DP0 |
| 5 | **No baseline exists** for submit-to-interview or recruiter time | Section 4 targets cannot be proven without "before" numbers | Collect 4–8 weeks of history for pilot users, and time 5 current submissions | DP4 |
| 6 | **D2 covers only the AI environment** | Vercel and the database will also hold original text with real client names and rates | Widen the IT request (section 5) | DP1 |

---

## 8. Cost and account notes

Confirm current prices and limits before buying. These notes are from general knowledge and were not checked against vendor sites today.

| Item | Demo (DP0–DP3) | Pilot (DP4–DP5) |
|---|---|---|
| Hosting | Vercel free plan only if IT accepts it. Its terms are for personal, non-commercial use, so a paid plan is safer | Vercel paid plan, company account |
| Database | Neon or Supabase free tier. Supabase free projects can pause when idle | Paid plan with backups |
| AI calls | Starting cap: `MONTHLY_BUDGET_USD=25` | Set from real cost per requirement found in DP1 |
| Email (login) | Not needed with the role switcher | Small transactional email service, or the company mailbox |

---

## 9. Owner actions

| Action | By |
|---|---|
| Confirm stack and LLM provider | Start of DP0 |
| Decide who owns the GitHub and Vercel accounts | Start of DP0 |
| Send the IT and legal request | DP1 |
| Prepare the 10–15 golden requirements. Keep real-derived versions out of git, and any reports that quote them | Before DP4 |
| Choose pilot users and get their managers' agreement | Before DP4 |
| Capture baselines | During DP4 |
| Sign off evaluation and the real-data gate | End of DP4 |
