# Connecting the desk mailbox (Gmail)

The desk can use one Gmail account as its shared inbox ("email in, email out", section 6). Without it, the desk works as a web app.

**Use the demo mailbox for synthetic data only.** Real client or candidate email needs IT approval first (decision D2, `DEPLOYMENT_PLAN.md` section 5).

## What it does

**Email in.** The desk checks its inbox once a day. An admin can also check it at any time from **Admin, Desk mailbox**.

| Who sends | What they send | What the desk does |
|---|---|---|
| A recruiter | A client email, forwarded | Redacts it, runs the requirement check, and emails stakeholders a link |
| A stakeholder | A reply to a check email, keeping `[REQ-n]` in the subject | Adds it as the client's answer and emails the recruiter that brief v2 is ready |
| Anyone else | Anything | Ignores it, and sends no reply |

The desk also ignores an email if Gmail cannot prove it came from the sender's domain (a DMARC check), so nobody can pretend to be a recruiter. Gmail addresses always have this proof. A company address has it only if the company has set up DMARC.

**Email out.** The desk emails only addresses in its own team list. Each email holds a redacted title and a link, with no details. The desk sends:
- stakeholders a note when a requirement check is ready, or a submission is waiting for them
- recruiters a note when a brief is ready, or a submission gets a decision or an outcome
- stakeholders day 3 and day 7 reminders to log the client's reply

It can never email a client or a candidate (G2).

## Setup (about 20 minutes)

Do this signed in to Google as the demo desk mailbox. Never paste these values into chat or into any file in the repository. Together they give full access to the mailbox.

1. Open [Google Cloud Console](https://console.cloud.google.com) and create a project, for example "Requirement Desk demo".
2. Go to **APIs and services, Library**. Search for **Gmail API** and enable it.
3. Set up the **OAuth consent screen**. Choose **External**, give the app a name, and use the desk mailbox as the support email. Add the desk mailbox as a **test user**.
4. Under **Clients** (or **Credentials**), create an **OAuth client ID** of type **Web application**. Add this as an authorised redirect URI: `https://developers.google.com/oauthplayground`. Copy the client ID and client secret.
5. Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground). Click the settings icon, tick **Use your own OAuth credentials**, and paste the client ID and secret.
6. In step 1 of the Playground, enter these two scopes, then click **Authorize APIs** and sign in as the desk mailbox:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
7. In step 2, click **Exchange authorization code for tokens**, then copy the **refresh token**.
8. In Vercel, add these settings, then redeploy:

| Setting | Value |
|---|---|
| `DESK_MAILBOX` | The desk mailbox's address |
| `GMAIL_CLIENT_ID` | From step 4 |
| `GMAIL_CLIENT_SECRET` | From step 4 |
| `GMAIL_REFRESH_TOKEN` | From step 7 |
| `APP_BASE_URL` | Your Vercel link, with no slash at the end |
| `CRON_SECRET` | A long random value, if not already set |

9. In the desk, go to **Admin, Desk mailbox**. Change each demo user's email to a real address you control, so you can send from it and receive notifications.
10. Test it. From the address you gave **Recruiter One**, forward the text of `seed/requirements/REQ-A.txt` to the desk mailbox. Click **Check the inbox now**. A new requirement should appear, and the stakeholder address should get an email.

## Things to know

- **Refresh tokens last 7 days while the Google app is in "Testing".** When the desk stops reading email, repeat steps 5 to 8. Making it permanent needs Google's review of the app, or a Google Workspace account. Ask IT before the pilot.
- **The inbox is checked once a day** on Vercel's free plan (13:00 UTC). Use **Check the inbox now** during demos.
- **Only emails from the last 7 days are read.** Each email is handled once.
- **Attachments are not read yet.** Resumes still go in through **Add a candidate**.
- **The pilot needs IT's choice of mailbox,** which may be Microsoft 365 rather than Gmail (section 11.2). The code keeps Gmail behind one small interface (`lib/mail/types.ts`), so it can be swapped.
