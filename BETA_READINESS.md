# DebtPilot Beta Readiness Audit

Audit date: July 13, 2026
Recommendation: **Ready with limitations**

## Passed checks

### Authentication and account security

- Signup uses email confirmation and directs confirmation through the server-side `/auth/confirm` callback.
- Confirmation and email-change links use `token_hash` verification, so they do not depend on the browser that initiated the request.
- Callback destinations are restricted to validated internal paths; incomplete onboarding returns to `/welcome`.
- Login, forgot-password, recovery, reset-password, signed-in password changes, email changes, local/global sign-out, and deletion paths provide user-safe states.
- Passwords require at least 10 characters and matching confirmation. Password-manager autocomplete and accessible labels are present.
- Recovery and confirmation failures render friendly screens rather than provider, token, cookie, or framework errors.
- Account deletion verifies the access token and typed email server-side before using the service role.

### Onboarding

- New and incomplete users are routed to onboarding; completed users are routed to the dashboard.
- Saved onboarding step and draft data resume after refresh or a new session.
- Bills and debts use stable client IDs and upserts, so retries do not create duplicates.
- Promotional debt fields map to and from persisted database columns.
- Goal completion now writes each goal before removing deleted goals, avoiding the previous delete-first data-loss window and identifying a failed goal by name.
- Completion is marked only after bills, debts, goals, and the profile update succeed.

### Core product

- Bills, debts, goals, vehicle scenarios, financial snapshots, and profiles are ownership-scoped.
- Transaction posting is a database function with row locks and a single transaction; failed posting cannot leave partial balance updates.
- Posted transactions cannot be posted twice or deleted through the UI.
- Recommendation-history absence is treated as optional and does not break the dashboard.
- Recommendation completion is protected by a user/recommendation unique index against retry duplicates.
- Before You Buy, Pilot recommendations, insights, forecast, payoff, and timeline calculations have unit coverage.

### UX and safety

- Public authentication pages and signed-in pages have mobile-first layouts and visible loading/empty states.
- The duplicate dashboard sign-out control and duplicate Settings sign-out control were removed; session actions now live in the account/session controls.
- Tooltips are keyboard-focusable and expose tooltip semantics.
- Provider/database messages previously shown by login, Settings, goals, transactions, vehicles, insights, forecast, payoff, inbox, Pilot, and What-If are now replaced with plain-language messages.
- Production diagnostics do not include raw errors in the UI; detailed logging helpers are disabled in production.
- RLS remains enabled on user-data tables, with ownership checks based on `auth.uid()`.

## Fixed issues

- Suppressed raw authentication and database errors across core user flows.
- Suppressed the Supabase Admin deletion error returned by the account API.
- Made onboarding goal persistence retry-safe and non-destructive on partial failure.
- Added a uniqueness constraint for recommendation-history retries.
- Removed duplicate sign-out navigation.
- Replaced the stale hard-coded Settings version with the shared application version.
- Added regression tests for safe authentication, load/save/delete messages, and production diagnostic suppression.

## Remaining risks

- This repository has automated unit and production-build coverage, but no browser-driven end-to-end suite against a dedicated Supabase staging project. The authentication emails, two-address secure email-change behavior, and service-role deletion must be smoke-tested in staging.
- Browser-native confirmation dialogs are used for global sign-out, transaction posting, and account deletion. They are keyboard accessible in supported browsers, but should receive explicit screen-reader/mobile QA.
- Transactions are intentionally append/review/post only; posted-item reversal is not available during beta.
- Optional recommendation history degrades gracefully when its migration is missing, but history persistence is unavailable until migrations are applied.
- Vercel environment/configuration drift cannot be verified from the repository alone.

## Manual Supabase and Vercel steps

1. Apply every migration through `010_beta_data_safety.sql` to the production Supabase project.
2. Run `supabase/verify_production_schema.sql` in the Supabase SQL editor and resolve every reported missing table, column, policy, or function.
3. Confirm RLS is enabled for profiles, debts, bills, goals, transactions, vehicle scenarios, financial snapshots, and recommendation history.
4. Set the Supabase Site URL to the canonical HTTPS Vercel production origin.
5. Allow these exact callback paths for the production origin and preview/local origins used for testing:
   - `/auth/confirm`
   - `/auth/confirm?next=/settings`
   - `/auth/recovery`
6. Use token-hash email templates for cross-device confirmation:
   - Signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`
   - Email change: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/settings`
   - Recovery: `{{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&type=recovery`
7. Verify Vercel production variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. Never expose the service-role key as a public variable.
8. In staging on desktop and mobile, smoke-test signup, cross-device confirmation, recovery, email change from another browser, local/global sign-out, deletion, onboarding resume/completion, transaction posting, and a failed/duplicate retry.

## Beta recommendation

**Ready with limitations**, after the migrations, callback templates, environment variables, schema verification, and staging smoke tests above are completed. The remaining limitations are operational verification and the intentionally absent transaction-reversal workflow, not known data-loss or technical-error exposure in the audited paths.
