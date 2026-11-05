# Requirement Desk

An internal tool for a US IT contract-staffing team. AI drafts; humans decide. See `REQUIREMENTS.md` for the product and `DEPLOYMENT_PLAN.md` for the rollout.

**Status:** Phase 0 (foundation). Data is synthetic and the AI is a mock.

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

1. Choose **Admin**.
2. Click **Run pipeline test**. A new row appears in the AI call log, showing the redacted input.
3. Click **Switch user** and choose a recruiter or stakeholder to see their inbox.

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
