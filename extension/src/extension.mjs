// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";
import { joinSession } from "@github/copilot-sdk/extension";
import {
  SecureChannel,
  createLocalTransport,
  createSupabaseTransport,
  generateKeyPair,
  randomChannelId,
  buildPairingPayload,
  listenForPeers,
} from "@aasis21/helm-shared";
import { attachRelay, createPermissionRelay } from "./relay.mjs";

// Best-effort: load SUPABASE_URL / SUPABASE_ANON_KEY / HELM_TRANSPORT from a colocated
// `.env` (next to the installed extension or in the launch cwd) so operators don't have to
// export them by hand before every `gh copilot`. Already-exported shell vars always win;
// a missing/unreadable file is a silent no-op. Never commit a real `.env` (it is gitignored).
function loadLocalEnv() {
  if (typeof parseEnv !== "function") return;
  const here = (() => {
    try {
      return dirname(fileURLToPath(import.meta.url));
    } catch {
      return null;
    }
  })();
  // The install-dir .env (next to a shipped extension) is canonical, so it is tried first
  // and its values win; the launch cwd .env is a secondary fallback. Both are merged — we do
  // NOT stop after the first readable file, so a partial cwd/.env can't mask the install one.
  // Any already-exported process env still wins per key (see the collision note in
  // createTransport for why Helm uses HELM_SUPABASE_* rather than generic SUPABASE_*).
  const candidates = [];
  if (here) candidates.push(join(here, ".env"));
  candidates.push(join(process.cwd(), ".env"));
  for (const file of candidates) {
    try {
      const parsed = parseEnv(readFileSync(file, "utf8"));
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch {
      // No readable .env here; try the next candidate.
    }
  }
}
loadLocalEnv();

const laptopKeys = await generateKeyPair();
const channelId = process.env.HELM_CHANNEL_ID || randomChannelId();
const pairingPayload = buildPairingPayload({
  channelId,
  publicKeyB64: laptopKeys.publicKeyB64,
});

let relayHandle = null;
let permissionRelay = null;
let shuttingDown = false;
let connecting = false;
// Persistent pairing state. `listenForPeers` keeps the laptop answering phone hellos for the whole
// session (not just the first pair), so re-scans/reloads always re-pair. We dedupe by peer public
// key so a phone re-broadcasting its hello only re-attaches the relay once.
let pairingStop = null;
let activeTransport = null;
let currentPeerPub = null;
let pairChain = Promise.resolve();

const session = await joinSession({
  streaming: true,
  onPermissionRequest: async (request, invocation) => {
    if (!permissionRelay) {
      return {
        kind: "denied-by-permission-request-hook",
        message: "Helm encrypted approval relay is not connected",
        interrupt: false,
      };
    }
    return permissionRelay.onPermissionRequest(request, invocation);
  },
  commands: [
    {
      name: "helm-pair",
      description: "Show the Helm mobile pairing QR code for this Copilot session.",
      handler: async () => {
        await logPairingQr(session, JSON.stringify(pairingPayload));
        // If pairing isn't currently listening (initial connect gave up, or it was torn down),
        // re-kick it. A live listener already answers re-scans, so don't stack a second transport.
        if (!pairingStop && !shuttingDown) void connectRelayWithRetry();
      },
    },
  ],
});

// Session-end cleanup. The native runtime (Copilot CLI >= 1.0.66) no longer accepts
// SDK callback hooks (the old `hooks: { onSessionEnd }` throws at session.resume), so we
// subscribe to the `session.shutdown` event instead to stop the relay and tell the phone.
session.on?.("session.shutdown", (event) => {
  const reason = event?.data?.shutdownType ?? event?.data?.errorReason ?? "session_end";
  void shutdown(reason);
});

await logPairingQr(session, JSON.stringify(pairingPayload));
session.log?.("Helm: waiting for phone pairing hello…");

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    void shutdown(sig).finally(() => process.exit(0));
  });
}

void connectRelayWithRetry();

// Subscribe the encrypted channel and KEEP listening for phone hellos for the whole session. A
// transient Supabase subscribe failure (CHANNEL_ERROR) must not permanently kill pairing for a
// walk-away tool, so retry the subscribe with capped exponential backoff using a FRESH transport
// each attempt (a realtime channel is single-use after an error). Once subscribed, `listenForPeers`
// answers every hello — the first scan AND any later re-scan/reload — so pairing self-heals.
// `/helm-pair` can re-kick this if all attempts gave up.
async function connectRelayWithRetry() {
  if (connecting || pairingStop || shuttingDown) return;
  connecting = true;
  try {
    const maxAttempts = positiveIntFromEnv("HELM_CONNECT_MAX_ATTEMPTS", 6);
    for (let attempt = 1; !shuttingDown; attempt++) {
      const transport = createTransport({ channelId });
      try {
        const listener = await listenForPeers({
          transport,
          keyPair: laptopKeys,
          connect: true,
          onPeer: (info) => onPeerPaired(transport, info),
        });
        if (shuttingDown) {
          listener.stop();
          await closeQuietly(transport);
          return;
        }
        pairingStop = listener.stop;
        activeTransport = transport;
        session.log?.("Helm: pairing channel ready; listening for phone hellos…");
        return;
      } catch (err) {
        await closeQuietly(transport);
        if (shuttingDown) return;
        if (attempt >= maxAttempts) {
          process.stderr.write(
            `Helm: encrypted channel not ready after ${attempt} attempts: ${err?.message ?? err}\n`,
          );
          session.log?.(
            `Helm: pairing channel could not subscribe after ${attempt} attempts: ${err?.message ?? err}. Run /helm-pair to retry.`,
            { level: "warning", ephemeral: false },
          );
          return;
        }
        const backoffMs = Math.min(1500 * 2 ** (attempt - 1), 15_000);
        session.log?.(
          `Helm: pairing channel subscribe attempt ${attempt} failed (${err?.message ?? err}); retrying in ${Math.round(backoffMs / 1000)}s…`,
          { level: "warning", ephemeral: false },
        );
        await sleep(backoffMs);
      }
    }
  } finally {
    connecting = false;
  }
}

// (Re)attach the encrypted relay for a freshly-paired phone. Serialized through `pairChain` so a
// phone re-broadcasting its hello can't trigger overlapping attaches, and idempotent per peer key:
// a duplicate hello from the same phone is already ACKed by `listenForPeers`, so we just no-op.
function onPeerPaired(transport, info) {
  pairChain = pairChain.then(() => attachForPeer(transport, info)).catch((err) => {
    session.log?.(`Helm: re-pair failed: ${err?.message ?? err}`, {
      level: "warning",
      ephemeral: false,
    });
  });
  return pairChain;
}

async function attachForPeer(transport, { key, peer }) {
  if (shuttingDown || transport !== activeTransport) return;
  if (peer.publicKeyB64 === currentPeerPub && relayHandle) return; // same phone re-saying hello

  const previous = relayHandle;
  relayHandle = null;
  currentPeerPub = null;
  if (previous) {
    // Tear down the old peer's relay but keep the shared transport open for this new phone.
    try {
      await previous.stop("repair", { closeTransport: false });
    } catch {
      // best-effort; a failed teardown must not block the new pairing.
    }
  }

  const channel = new SecureChannel({
    transport,
    key,
    identity: {
      userId: process.env.HELM_USER_ID || "copilot",
      deviceId: process.env.HELM_DEVICE_ID || "laptop",
      sessionId: session.sessionId || channelId,
    },
  });
  permissionRelay = createPermissionRelay({
    channel,
    logger: (message, options) => session.log?.(message, options),
  });
  // SupabaseTransport is subscribe-order independent (single catch-all broadcast listener +
  // internal dispatch), so attachRelay may register SecureChannel handlers after the channel is
  // already connected without losing events.
  relayHandle = await attachRelay({ session, channel, channelId, permissionRelay });
  relayHandle.session = session;
  currentPeerPub = peer.publicKeyB64;
  session.log?.(`Helm: encrypted relay attached to ${peer.deviceId ?? "phone"}.`);
}

// Tear everything down once: stop the pairing listener, stop the relay (which announces the session
// end + closes the shared transport), or just close the transport if no relay ever attached.
async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  pairingStop?.();
  pairingStop = null;
  if (relayHandle) {
    try {
      await relayHandle.stop(reason);
    } catch {
      // best-effort
    }
  } else {
    await closeQuietly(activeTransport);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}

async function closeQuietly(transport) {
  try {
    await transport?.close?.();
  } catch {
    // best-effort cleanup of a failed transport
  }
}

function positiveIntFromEnv(name, fallback) {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

async function logPairingQr(session, payload) {
  const qr = await QRCode.toString(payload, { type: "terminal", small: true });
  session.log?.(`Helm pairing payload:\n${qr}\n${payload}`, {
    level: "info",
    ephemeral: false,
  });
}

function createTransport({ channelId }) {
  const transportName = process.env.HELM_TRANSPORT || "local";
  if (transportName === "local") return createLocalTransport({ channelId });

  // Prefer Helm-namespaced vars. The generic SUPABASE_URL / SUPABASE_ANON_KEY are extremely
  // common and are frequently exported globally for an UNRELATED Supabase project; because an
  // already-exported env var beats our .env, that ambient value silently hijacks the relay and
  // the private-channel join is rejected (CHANNEL_ERROR). Namespacing avoids the collision; the
  // generic names stay as a fallback for "bring your own relay" users who only set those.
  const url = process.env.HELM_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.HELM_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Helm: HELM_TRANSPORT=supabase requires HELM_SUPABASE_URL and HELM_SUPABASE_ANON_KEY",
    );
  }
  if (!process.env.HELM_SUPABASE_URL || !process.env.HELM_SUPABASE_ANON_KEY) {
    process.stderr.write(
      `Helm: using generic SUPABASE_* env (relay host ${safeHost(url)}). Set ` +
        "HELM_SUPABASE_URL / HELM_SUPABASE_ANON_KEY so a global SUPABASE_URL for another " +
        "project cannot hijack the relay.\n",
    );
  }
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Helm uses *private* broadcast channels, authorized by RLS on realtime.messages
  // (see supabase/migrations). The anon key is the realtime access token; without
  // setAuth + the RLS policies applied, channel joins are denied.
  client.realtime.setAuth(anonKey);
  return createSupabaseTransport({ client, channelId });
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "?";
  }
}
