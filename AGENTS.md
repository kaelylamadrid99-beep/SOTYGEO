<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Server-side data access goes through `getSql()` in `src/lib/db.ts`, which calls the service-role-only `exec_sql` database function; keeps the app's existing parameterized SQL working on Lovable Cloud.
- All domain tables are server-only (RLS on, no anon/authenticated grants); authorization lives in app code (`src/lib/sotygeo/security/*`), so never query them from the browser.
- Accounts use Lovable Cloud auth; `public."user"` is a read-only view over auth users for legacy SQL. Create/update accounts via the auth admin API (`users/auth-accounts.ts`), never by SQL.
- Auth emails (signup confirmation, password reset) are sent by Lovable Cloud; app emails (invitations, notices) still use `notifications/email.server.ts`.
