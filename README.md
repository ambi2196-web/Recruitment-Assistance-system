# Requirement Desk

An internal tool for a US IT contract-staffing team. AI drafts; humans decide. See `REQUIREMENTS.md` for the product and `DEPLOYMENT_PLAN.md` for the rollout.

**Status:** Phase 1 (requirement check and brief). Data is synthetic. The AI is a mock with canned answers, so it shows the workflow, not real AI quality.

## Run it on your computer

You need Node.js 24 or newer. No database account or API key is required.

Install the packages:

```bash
npm install
```

Create your settings file:

```bash
cp .env.example .env
```

Create the local database and load the synthetic data:

```bash
npm run db:setup
```

Start the app, then open http://localhost:3000:

```bash
npm run dev
```

Stop the app before running `db:setup` again, because the local database allows one program at a time.

## Try it

1. Choose **Recruiter One**. Paste an email from `seed/requirements/` into the form and send it to the desk. You will see the redacted text.
2. Click **Switch user** and choose **Stakeholder One**. Open the requirement and click **SEND** to get copy-ready text.
3. Paste a client answer, such as "We need a technical ontologist to make our data machine-readable."
4. Switch to **Recruiter One** and open the requirement. You will see brief v2 with "What changed".
5. Switch to **Admin** to see every AI call and its redacted input. **Client registry** is linked from there.

## Check it

Run all tests:

```bash
npm test
```

Check the code for type errors:

```bash
npm run typecheck
```

## Deploy the demo

Set these in the Vercel project:

| Setting | Value |
|---|---|
| `DATABASE_URL` | The Neon or Supabase postgres:// URL |
| `APP_ENV` | `demo` |
| `DEMO_MODE` | `true` |
| `DEMO_ACCESS_PASSWORD` | A password to share with demo viewers. The username is `demo` |
| `MONTHLY_BUDGET_USD` | `25` |
| `LLM_PROVIDER` / `LLM_MODEL` | `mock` / `mock-1` |

The app will not serve pages until these are safe. Then run `npm run db:setup` once from your computer, with `DATABASE_URL` in `.env` pointing at the same database.

**Emergency stop:** set `MONTHLY_BUDGET_USD=0` and redeploy. All AI calls stop, and saved work stays readable.

## Where things are

| Path | What it is |
|---|---|
| `lib/redaction.ts` | Removes client names, rates and contact details before any AI call |
| `lib/llm.ts` | The only route to a model, with budget cap and audit log |
| `lib/config.ts`, `proxy.ts` | Demo safety checks |
| `lib/db/schema.ts` | Database tables |
| `prompts/` | Versioned AI instructions |
| `seed/` | Fictional clients, requirements and resumes |
