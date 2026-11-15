# Auction Flip Finder

Site for the auction flip model. Static files in `public/`; no build step on Vercel.
All run lists, edits and settings stay in the visitor's browser (localStorage). Nothing about the cars is sent to a server.

## Login

Every page is behind a team login.

- `middleware.js` runs before any file is served and sends visitors without a valid session cookie to `/login.html`.
- `api/login.js` checks the username and password and sets a signed cookie that lasts 30 days. `api/logout.js` clears it.
- Accounts live in the Vercel environment variable `AUTH_USERS`, a JSON object of `username: "salt:hash"` (scrypt). `AUTH_SECRET` signs the cookie.
- To add or change an account, run `node tools/hash-password.js <username> <password>`, merge the printed entry into `AUTH_USERS`, and redeploy. Removing an entry or changing a password signs that person out.
- If either variable is missing, nobody can get in.

## Updating the app page

`python3 build.py <app source html>` regenerates `public/index.html`.

## AI review and shared log

Environment variables on Vercel (Project Settings, Environment Variables):

| Name | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key used by `api/ai.js`. Never sent to the browser. |
| `AI_MODEL` | Optional. Defaults to `claude-opus-5-5`. |
| `SUPABASE_URL`, `SUPABASE_KEY` | The Supabase project URL and its publishable key, used by `api/results.js`. |
| `AFF_DB_SECRET` | Secret the server sends to the database functions. Only its hash is stored in the database. |

The database is set up by `supabase/001_shared_log.sql`. The tables have row-level security on with no policies, so the public API cannot read them. The site reaches them only through the `aff_*` functions, which check the secret.
