-- Helm Realtime authorization (Phase 2).
--
-- Helm's relay is Supabase Realtime *Broadcast* with ZERO database persistence — there
-- are no application tables in v1. The only server-side setup is authorizing the private
-- broadcast channels the clients join: `private:helm:<channelId>`.
--
-- Private channels gate every broadcast message through RLS on `realtime.messages`.
-- v1 pairing is anonymous (QR, no login), so these policies allow the `anon` and
-- `authenticated` roles to receive/send broadcasts ONLY on `private:helm:%` topics.
-- Confidentiality does not depend on this gate: the relay only ever carries end-to-end
-- AES-256-GCM ciphertext and the 128-bit channelId is unguessable. The gate just stops
-- random clients enumerating/joining arbitrary helm topics. Tighten to per-user identity
-- in v2 (replace the topic-prefix check with an ownership check).
--
-- `realtime.messages` ships with RLS already enabled; we only (re)create the policies.
-- Idempotent: safe to re-run.

drop policy if exists "helm_receive_broadcast" on realtime.messages;
drop policy if exists "helm_send_broadcast" on realtime.messages;

-- Receiving (joining + reading) broadcasts on Helm topics.
create policy "helm_receive_broadcast"
on realtime.messages
for select
to anon, authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) like 'private:helm:%'
);

-- Sending broadcasts on Helm topics.
create policy "helm_send_broadcast"
on realtime.messages
for insert
to anon, authenticated
with check (
  extension = 'broadcast'
  and (select realtime.topic()) like 'private:helm:%'
);
