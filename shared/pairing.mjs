// Helm pairing handshake.
//
// ECDH needs BOTH public keys. The laptop (extension) shows ITS public key + channelId in the
// QR code. The phone scans it, then must deliver ITS OWN public key back to the laptop so both
// sides derive the same AES-256-GCM session key. That single exchange is the ONLY unencrypted
// traffic on the channel, and it only ever carries PUBLIC keys (safe to send in the clear).
// Everything after pairing flows through SecureChannel (fully encrypted).
//
// ORDERING NOTE (real Supabase Broadcast transport): handlers are registered with channel.on()
// inside transport.subscribe(), and channel.subscribe() runs in transport.connect(). Supabase
// delivers only to handlers registered BEFORE connect(). These helpers therefore register their
// handler, THEN connect. The in-process LocalTransport has no such constraint. See docs/pairing.md.

import { deriveSessionKey } from "./crypto.mjs";

export const PAIR_VERSION = 1;

/** Reserved transport events used only for the pre-encryption handshake. */
export const PAIR_EVENTS = Object.freeze({
  HELLO: "pair.hello", // phone  -> laptop: { v, pub, deviceId, ts }
  ACK: "pair.ack", // laptop -> phone:  { v, ok, ts }
});

/** Build the QR payload shown by the laptop. Carries the laptop PUBLIC key only. */
export function buildPairingPayload({ channelId, publicKeyB64 }) {
  if (!channelId || !publicKeyB64) {
    throw new Error("helm/pairing: channelId and publicKeyB64 are required");
  }
  return { v: PAIR_VERSION, channelId, pub: publicKeyB64 };
}

/** Parse + validate a scanned QR payload (string or object). */
export function parsePairingPayload(input) {
  const o = typeof input === "string" ? JSON.parse(input) : input;
  if (
    !o ||
    o.v !== PAIR_VERSION ||
    typeof o.channelId !== "string" ||
    typeof o.pub !== "string"
  ) {
    throw new Error("helm/pairing: invalid pairing payload");
  }
  return { channelId: o.channelId, publicKeyB64: o.pub };
}

/**
 * Laptop/extension side, PERSISTENT variant: keep listening for phone hellos and ACK EVERY one,
 * deriving a fresh session key per hello. Unlike `waitForPeer` (single-shot), this never stops
 * after the first pair, so a phone that re-scans, reloads, or reconnects always gets an ACK and
 * can re-pair. `onPeer` is invoked once per hello with the derived key + peer info; the laptop
 * uses it to (re)attach its encrypted relay. The ACK is sent BEFORE `onPeer` runs so the phone
 * confirms fast even if relay (re)attach is slow. `stop()` only unsubscribes — it does NOT close
 * the transport (the caller owns the transport lifecycle).
 *
 * @param {{ transport: import("./transport").Transport, keyPair: { privateKey: CryptoKey }, onPeer: (info: { key: CryptoKey, peer: { publicKeyB64: string, deviceId?: string } }) => void | Promise<void>, connect?: boolean }} opts
 * @returns {Promise<{ stop: () => void }>}
 */
export async function listenForPeers({ transport, keyPair, onPeer, connect = true } = {}) {
  if (!transport) throw new Error("helm/pairing: transport is required");
  if (!keyPair?.privateKey) throw new Error("helm/pairing: keyPair is required");
  if (typeof onPeer !== "function") throw new Error("helm/pairing: onPeer is required");

  const unsub = transport.subscribe(PAIR_EVENTS.HELLO, async (payload) => {
    if (!payload || typeof payload.pub !== "string") return;
    let key;
    try {
      key = await deriveSessionKey(keyPair.privateKey, payload.pub);
    } catch {
      return; // malformed/incompatible public key — ignore.
    }
    // ACK first: the phone re-broadcasts HELLO until it hears this, so answer every hello fast.
    try {
      await transport.publish(PAIR_EVENTS.ACK, { v: PAIR_VERSION, ok: true, ts: Date.now() });
    } catch {
      /* ack is best-effort */
    }
    try {
      await onPeer({ key, peer: { publicKeyB64: payload.pub, deviceId: payload.deviceId } });
    } catch {
      /* the caller is responsible for surfacing its own (re)attach failures */
    }
  });

  if (connect) await transport.connect?.();
  return { stop: () => unsub?.() };
}

/**
 * Laptop/extension side: wait for the phone's hello, derive the shared session key.
 * @param {{ transport: import("./transport").Transport, keyPair: { privateKey: CryptoKey }, timeoutMs?: number, connect?: boolean }} opts
 * @returns {Promise<{ key: CryptoKey, peer: { publicKeyB64: string, deviceId?: string } }>}
 */
export async function waitForPeer({ transport, keyPair, timeoutMs = 0, connect = true } = {}) {
  if (!transport) throw new Error("helm/pairing: transport is required");
  if (!keyPair?.privateKey) throw new Error("helm/pairing: keyPair is required");

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsub?.();
      fn(arg);
    };

    const unsub = transport.subscribe(PAIR_EVENTS.HELLO, async (payload) => {
      if (settled || !payload || typeof payload.pub !== "string") return;
      try {
        const key = await deriveSessionKey(keyPair.privateKey, payload.pub);
        // Best-effort ACK so the phone can confirm the laptop derived the key.
        try {
          await transport.publish(PAIR_EVENTS.ACK, { v: PAIR_VERSION, ok: true, ts: Date.now() });
        } catch {
          /* ack is optional */
        }
        finish(resolve, { key, peer: { publicKeyB64: payload.pub, deviceId: payload.deviceId } });
      } catch (err) {
        finish(reject, err);
      }
    });

    if (connect) {
      Promise.resolve(transport.connect?.()).catch((err) => finish(reject, err));
    }
    if (timeoutMs > 0) {
      timer = setTimeout(
        () => finish(reject, new Error("helm/pairing: timed out waiting for phone")),
        timeoutMs,
      );
      timer.unref?.();
    }
  });
}

/**
 * Phone side: derive the key from the scanned laptop public key, then announce our public key.
 *
 * When `waitForAck` is true we RE-BROADCAST the hello on an interval until the laptop ACKs (or we
 * hit `timeoutMs`). Supabase Broadcast has no replay, so a single hello is lost if the laptop's
 * channel finishes subscribing a moment after we publish (common right after `copilot` starts,
 * since the QR prints immediately). Re-announcing makes the handshake self-healing — the laptop's
 * persistent `listenForPeers` simply answers each hello and the phone resolves on the first ACK.
 *
 * @param {{ transport: import("./transport").Transport, keyPair: { privateKey: CryptoKey, publicKeyB64: string }, peerPublicKeyB64: string, deviceId?: string, waitForAck?: boolean, timeoutMs?: number, retryMs?: number }} opts
 * @returns {Promise<{ key: CryptoKey }>}
 */
export async function sayHello({
  transport,
  keyPair,
  peerPublicKeyB64,
  deviceId,
  waitForAck = false,
  timeoutMs = 20_000,
  retryMs = 1_200,
} = {}) {
  if (!transport) throw new Error("helm/pairing: transport is required");
  if (!keyPair?.privateKey || !keyPair.publicKeyB64) {
    throw new Error("helm/pairing: keyPair is required");
  }
  if (!peerPublicKeyB64) throw new Error("helm/pairing: peerPublicKeyB64 is required");

  const key = await deriveSessionKey(keyPair.privateKey, peerPublicKeyB64);
  const buildHello = () => ({
    v: PAIR_VERSION,
    pub: keyPair.publicKeyB64,
    deviceId,
    ts: Date.now(),
  });

  // Fire-and-forget path (e.g. restoring a saved pairing): publish once, don't block on an ack.
  if (!waitForAck) {
    await transport.connect?.();
    await transport.publish(PAIR_EVENTS.HELLO, buildHello());
    return { key };
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    let interval;
    let timer;
    let unsub;

    const cleanup = () => {
      if (interval) clearInterval(interval);
      if (timer) clearTimeout(timer);
      unsub?.();
    };

    // Register the ACK listener BEFORE connecting so no ack can race ahead of us.
    unsub = transport.subscribe(PAIR_EVENTS.ACK, () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ key });
    });

    const announce = () => {
      Promise.resolve(transport.publish(PAIR_EVENTS.HELLO, buildHello())).catch(() => {
        // Ignore transient publish failures; the interval will try again.
      });
    };

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("helm/pairing: no ack from laptop"));
    }, timeoutMs);
    timer.unref?.();

    Promise.resolve(transport.connect?.())
      .then(() => {
        if (settled) return;
        announce();
        interval = setInterval(announce, retryMs);
        interval.unref?.();
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      });
  });
}
