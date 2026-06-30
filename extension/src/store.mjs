// SPDX-License-Identifier: Apache-2.0
// Read-only access to the Copilot CLI's own session store (~/.copilot/session-store.db)
// for the chat title (summary). This is the SAME data the CLI session picker shows, so
// Helm's phone title stays in sync with the terminal without depending on the experimental
// session-metadata RPC. node:sqlite ships built-in on Node 24 (no flag).
import { homedir } from "node:os";
import { join } from "node:path";

const DB_PATH = join(homedir(), ".copilot", "session-store.db");

async function openDb() {
  const { DatabaseSync } = await import("node:sqlite");
  return new DatabaseSync(DB_PATH, { readOnly: true });
}

/**
 * The chat title ("summary") the CLI derives for a session as the conversation grows.
 * Returns "" for an unknown session or if the store can't be read (older Node without
 * node:sqlite, missing DB, locked file, …) — the caller falls back to the cwd basename.
 */
export async function readSummary(sessionId) {
  if (!sessionId) return "";
  try {
    const db = await openDb();
    try {
      const row = db.prepare("SELECT summary FROM sessions WHERE id = ?").get(sessionId);
      return (row && row.summary) || "";
    } finally {
      db.close();
    }
  } catch {
    return "";
  }
}
