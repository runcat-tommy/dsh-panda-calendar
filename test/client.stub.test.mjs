/**
 * Client-half smoke test: evaluates the ModuleLoader bundle in a stubbed
 * browser environment and asserts the conversation-view registration shape:
 *   - exports.apply is a function; inject lists ["slots", "locale"]
 *   - apply() registers the 'panda-calendar' tab on the 'conversation.view'
 *     slot with order 30 (right after Trajectory=10 / Poetry=20) and a
 *     locale-bound label
 *   - apply() tolerates a DOM-less environment (graceful degradation)
 *
 * Run: node --test "test/*.test.mjs"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

function makeReact() {
  return {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (init) => [typeof init === "function" ? init() : init, () => {}],
    useEffect: () => {},
  };
}

/** Capture the registration passed to slots.register inside slots.inject. */
function makeCtx(counters, registrations) {
  return {
    get: () => undefined,
    on: () => () => {},
    effect: (fn) => {
      const cleanup = fn();
      if (typeof cleanup === "function") cleanup();
      return () => {};
    },
    locale: {
      register: () => { counters.localeRegister++; },
      bind: () => (key) => `L:${key}`,
    },
    slots: {
      inject: (name, cb) => { counters.injectCalls.push(name); registrations.push(cb()); },
      register: (def, render) => ({ def, render }),
    },
  };
}

function runFactory(reactImpl) {
  const counters = { localeRegister: 0, injectCalls: [] };
  const registrations = [];
  globalThis.window = { __ModuleLoader__: {} };
  let exportsOut = null;
  window.__ModuleLoader__.load = (opts) => {
    const returned = opts.factory((id) => {
      if (id === "react") return reactImpl || makeReact();
      throw new Error(`unexpected require: ${id}`);
    });
    exportsOut = returned;
  };
  (0, eval)(source); // the file calls window.__ModuleLoader__.load(...) at top level
  return { exportsOut, counters, registrations };
}

test("client exposes apply and the expected inject list", () => {
  const { exportsOut } = runFactory();
  assert.equal(typeof exportsOut.apply, "function");
  assert.deepEqual(exportsOut.inject, ["slots", "locale"]);
});

test("apply registers a conversation.view tab named panda-calendar at order 30", () => {
  const { exportsOut, counters, registrations } = runFactory();
  exportsOut.apply(makeCtx(counters, registrations));

  assert.ok(counters.localeRegister >= 1, "dictionaries should register");
  assert.ok(
    counters.injectCalls.includes("conversation.view"),
    "should inject into the conversation.view slot"
  );

  const viewReg = registrations.find((r) => r.def && r.def.name === "conversation.view");
  assert.ok(viewReg, "a conversation.view registration should exist");
  assert.equal(viewReg.def.id, "panda-calendar");
  assert.equal(viewReg.def.order, 30);
  assert.equal(typeof viewReg.def.label, "function");
  assert.equal(viewReg.def.label(), "L:view");
  assert.equal(typeof viewReg.render, "function");
});
