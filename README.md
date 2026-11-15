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
