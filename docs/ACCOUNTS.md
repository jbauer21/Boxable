# Boxable accounts and saved drawers

## Local implementation

The React app supports Google and verified email/password accounts, private named drawers and photos, and autosave. Supabase Auth stores email and password hashes; `profiles` stores the editable display name. The frontend contains only a publishable key. No administrative credential is needed by the running application.

Use Node.js 24 (`.nvmrc`). From the project root, `npm run dev` uses a compatible Node runtime already bundled on this Mac when the default Node is too old. The Python backend remains on port 8000. Do not expose the local development server publicly.

Copy `frontend/.env.example` to `frontend/.env.local` and fill `VITE_SUPABASE_PUBLISHABLE_KEY` from the project's API Keys page. Keep the URL set to `https://dlnyuqnwmojzleejussf.supabase.co`. Restart the frontend after changing environment settings. Without configuration, accounts are disabled and guest planning/export remains usable.

## Supabase setup

1. Apply `supabase/migrations/202609140001_accounts.sql` once to project **dlnyuqnwmojzleejussf** using the SQL Editor, or `SUPABASE_DB_PASSWORD='…' sh scripts/apply-accounts-migration.sh`. It creates profiles, drawers, revision handling, a private 10 MB photo bucket, and ownership policies in one transaction. It does not replace existing application data. Review existing tables/policies before applying; object-name collisions cause rollback rather than silently replacing them.
2. Authentication → Providers: keep **Confirm email** enabled and anonymous sign-ins disabled. Keep Email enabled. Set minimum password length to **15**, leave composition restrictions unset, keep secure email change enabled, and enable secure password change. The 15-character minimum and secure password change were saved and verified in the hosted dashboard during implementation.
3. Authentication → URL Configuration: use `http://localhost:5173/` as the local Site URL and explicitly allow `http://localhost:5173/`, `http://127.0.0.1:5173/`, and, if using the review server, `http://localhost:5174/` and `http://127.0.0.1:5174/`. Do not use wildcard redirects. Keep existing production URLs if the project already has them.
4. Configure custom SMTP with a verified sender domain. Supabase's default email service is restricted and is not general-user delivery. Enter SMTP credentials directly in Supabase, never in frontend environment files or chat. Use the templates in `supabase/templates/`; they preserve Supabase's one-time confirmation URL. Leave email verification on even if SMTP is not yet available.
5. Set up a Google Cloud OAuth web application for Boxable. Authorized JavaScript origins are the local origins above, without the trailing slash. The **Google authorized redirect URI** is `https://dlnyuqnwmojzleejussf.supabase.co/auth/v1/callback` (not the frontend URL). Request only `openid`, email and profile scopes. Enter the Google client ID and secret in Supabase's Google provider settings and enable it. Add test users while Google's consent application is in testing. Users must complete any consent or credential-entry steps themselves.
6. Preserve Supabase rate limits. Leaked-password protection is available only on eligible paid plans; no upgrade was purchased. Never implement browser-side account linking by email: Supabase handles verified identities.

## Save behavior and recovery

- A versioned JSON document preserves dimensions, marker coordinates, items, positions, rotations, all container heights, usable height, and the active editor step. Files and blob URLs are not serialized into it.
- Each save checks the last known revision. Database triggers increment revisions. A stale save stops and offers reload or save-as-new; it never silently overwrites a newer drawer.
- Photos are immutable private objects under `user-id/drawer-id/random-id.ext`. Replacing a photo uploads a new object, commits its reference, then removes the old object. Known failed cleanups retry for that owner. If a network error makes commit status uncertain, retain the new photo rather than risk deleting a referenced file; administrators can review abandoned objects later.
- Autosave waits one second. Edits during an in-flight save are saved afterward. Failures preserve a local draft; retry when online or use Retry save. Browser close prompts protect unsaved work.
- IndexedDB stores one recovery draft per account plus a separate guest draft. Guest work is imported only after an intentional sign-in and removed after successful cloud saving. Explicit sign-out clears the current account's local recovery draft. Session tokens are managed by the Supabase SDK; passwords are never stored in draft data.
- PKCE confirmation/recovery links should be opened in the same browser that requested them. Expired, reused, or mismatched-browser links require a new request. Name and email validation do not grant permissions: the database requires a verified authenticated subject.
- JSON export and 3MF generation remain separate from cloud saving. To delete the open drawer, first finish saving it, then delete it in My drawers.

## Validation

From `frontend` with Node 24: `npm test` and `npm run build`. Tests cover full plan round trips, guest/account draft separation, photos, debounced/serialized/retried saves, registration, Google redirect scopes, confirmation, password recovery, and actual PostgreSQL RLS/revision behavior through PGlite. PGlite uses a minimal Auth/Storage schema fixture; hosted Supabase integration still requires verification after migration and provider setup.

From `backend`: `.venv/bin/python -m pytest -q`.

Before marking hosted accounts ready, verify with two real test accounts: confirmation delivery, sign-in/out, password recovery, Google cancellation and overlapping verified identities, reopening a photo and manually arranged drawer, cross-account REST/storage denial, two-tab save conflicts, and mobile/keyboard interactions. Do not use service-role credentials for these isolation checks.

## Deployment status

Frontend `.env.local` is configured for project **dlnyuqnwmojzleejussf** with the publishable key (gitignored). Hosted Auth already enforces the 15-character password minimum, email confirmation, and disabled anonymous sign-ins.

Still required before account storage is operational:

1. **Apply the migration** once: paste `supabase/migrations/202609140001_accounts.sql` into the SQL Editor, or run `SUPABASE_DB_PASSWORD='…' sh scripts/apply-accounts-migration.sh`. Until this succeeds, `/rest/v1/drawers` and the `drawer-photos` bucket do not exist.
2. **Custom SMTP** with a verified sender (required for reliable confirmation/recovery mail). Leave verification enabled even while SMTP is unfinished. Current project responses show email send rate limiting, so mailer settings exist, but delivery must still be verified with a real inbox.
3. **Google OAuth** provider credentials in Supabase (currently disabled on the project). Create the Google Cloud web client, set the redirect URI to `https://dlnyuqnwmojzleejussf.supabase.co/auth/v1/callback`, enter the client ID/secret in Supabase, and complete consent/test-user steps yourself.
4. Confirm Site URL / redirect allow-list includes the local origins listed above.
5. Live two-account isolation and browser acceptance checks.

No public deployment was performed.
