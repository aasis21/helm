// Unit tests for the new protocol factories + routing (shared/messages.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EVENTS,
  KIND,
  userMessage,
  historyRequest,
  history,
  activity,
  elicitationRequest,
  elicitationResponse,
  elicitationComplete,
  eventForKind,
  isValidInner,
} from "../messages.mjs";

test("userMessage factory defaults origin to terminal and carries id/text", () => {
  const m = userMessage("hello laptop", "terminal", "evt-1");
  assert.equal(m.kind, KIND.USER_MESSAGE);
  assert.equal(m.text, "hello laptop");
  assert.equal(m.origin, "terminal");
  assert.equal(m.id, "evt-1");
  assert.equal(typeof m.ts, "number");

  const d = userMessage("from phone");
  assert.equal(d.origin, "terminal"); // explicit default
});

test("userMessage can be tagged as phone origin", () => {
  const m = userMessage("typed on phone", "phone", "evt-2");
  assert.equal(m.origin, "phone");
});

test("historyRequest defaults before=null and passes limit through", () => {
  const r = historyRequest();
  assert.equal(r.kind, KIND.HISTORY_REQUEST);
  assert.equal(r.before, null);
  assert.equal(r.limit, undefined);

  const r2 = historyRequest(42, 25);
  assert.equal(r2.before, 42);
  assert.equal(r2.limit, 25);
});

test("history factory carries items + pagination cursor", () => {
  const items = [{ turnIndex: 0, role: "user", text: "hi", ts: 1 }];
  const h = history(items, 7, true);
  assert.equal(h.kind, KIND.HISTORY);
  assert.deepEqual(h.items, items);
  assert.equal(h.nextCursor, 7);
  assert.equal(h.hasMore, true);

  const empty = history([]);
  assert.equal(empty.nextCursor, null);
  assert.equal(empty.hasMore, false);
});

test("activity factory coerces busy to a boolean and routes to STREAM", () => {
  const on = activity(true);
  assert.equal(on.kind, KIND.ACTIVITY);
  assert.equal(on.busy, true);
  assert.equal(typeof on.ts, "number");
  assert.equal(activity(0).busy, false); // coerced
  assert.equal(eventForKind(KIND.ACTIVITY), EVENTS.STREAM);
});

test("eventForKind routes user_message to STREAM and history kinds to CONTROL", () => {
  assert.equal(eventForKind(KIND.USER_MESSAGE), EVENTS.STREAM);
  assert.equal(eventForKind(KIND.HISTORY_REQUEST), EVENTS.CONTROL);
  assert.equal(eventForKind(KIND.HISTORY), EVENTS.CONTROL);
});

test("eventForKind still throws for unknown kinds", () => {
  assert.throws(() => eventForKind("nope"), /unknown kind/);
});

test("the new factories pass isValidInner", () => {
  assert.ok(isValidInner(userMessage("a")));
  assert.ok(isValidInner(historyRequest()));
  assert.ok(isValidInner(history([])));
  assert.ok(isValidInner(activity(true)));
});

// ---- ask_user / elicitation (#64) ------------------------------------------

test("elicitationRequest carries the message, mode, schema and tool linkage", () => {
  const schema = { type: "object", properties: { env: { type: "string" } }, required: ["env"] };
  const m = elicitationRequest("req-1", "Where to?", "form", schema, "tc-1");
  assert.equal(m.kind, KIND.ELICITATION_REQUEST);
  assert.equal(m.requestId, "req-1");
  assert.equal(m.message, "Where to?");
  assert.equal(m.mode, "form");
  assert.deepEqual(m.requestedSchema, schema);
  assert.equal(m.toolCallId, "tc-1");
  assert.equal(typeof m.ts, "number");

  const d = elicitationRequest("req-2", "hi");
  assert.equal(d.mode, "form"); // default mode
});

test("elicitationResponse only keeps content on accept", () => {
  const ok = elicitationResponse("req-1", "accept", { env: "staging" });
  assert.equal(ok.kind, KIND.ELICITATION_RESPONSE);
  assert.equal(ok.action, "accept");
  assert.deepEqual(ok.content, { env: "staging" });

  const declined = elicitationResponse("req-1", "decline", { env: "staging" });
  assert.equal(declined.action, "decline");
  assert.equal(declined.content, undefined); // content dropped when not accepting
});

test("elicitationComplete records the terminating action", () => {
  const m = elicitationComplete("req-1", "cancel");
  assert.equal(m.kind, KIND.ELICITATION_COMPLETE);
  assert.equal(m.requestId, "req-1");
  assert.equal(m.action, "cancel");
});

test("eventForKind routes elicitation kinds to their phone/ext channels", () => {
  assert.equal(eventForKind(KIND.ELICITATION_REQUEST), EVENTS.ELICITATION);
  assert.equal(eventForKind(KIND.ELICITATION_COMPLETE), EVENTS.ELICITATION);
  assert.equal(eventForKind(KIND.ELICITATION_RESPONSE), EVENTS.ELICITATION_RESPONSE);
});

test("the elicitation factories pass isValidInner", () => {
  assert.ok(isValidInner(elicitationRequest("r", "m", "form", { type: "object", properties: {} })));
  assert.ok(isValidInner(elicitationResponse("r", "accept", { a: 1 })));
  assert.ok(isValidInner(elicitationComplete("r", "accept")));
});
