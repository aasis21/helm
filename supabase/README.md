# Supabase provisioning (Helm relay)

Helm's relay is **Supabase Realtime Broadcast with zero database persistence**. There are
no application tables in v1 — the only setup is authorizing the private broadcast channels
the clients join (`private:helm:<channelId>`).

## What's here

- `migrations/` — timestamped SQL (`YYYYMMDDHHmmss_*.sql`), Supabase-CLI compatible.
  - `*_helm_realtime_broadcast_rls.sql` — RLS on `realtime.messages` authorizing
    `private:helm:*` broadcast for the `anon` / `authenticated` roles. **Apply this before
    using `HELM_TRANSPORT=supabase`** — private channels are denied by default.
- `project.json` — `{ "project_id": "<ref>" }`. Fill in your Supabase project ref.

## Apply it

Pick one:

**A. Supabase MCP (HQ wiring).** With the Supabase MCP loaded (see
`cortex/mcp/mcp-config.json`; this requires a CLI restart + browser OAuth), ask the agent
to apply `supabase/migrations` to your project.

**B. Supabase CLI.**
```sh
supabase link --project-ref <ref>
supabase db push
```

**C. Dashboard.** Paste the migration into the SQL Editor and run it.

## Security note

Applying these policies is a **hardening** step, not a confidentiality requirement: the
relay only ever sees end-to-end AES-256-GCM ciphertext, and the 128-bit channelId is
unguessable. RLS adds an access gate so random anon clients can't enumerate or join
arbitrary helm topics. In v2 (per-user identity) replace the topic-prefix check with an
ownership check. See [`../docs/security.md`](../docs/security.md) and
[`../docs/hosting.md`](../docs/hosting.md).
