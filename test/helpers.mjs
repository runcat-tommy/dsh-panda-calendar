/**
 * Shared test helpers. Loads lib/client.js (a ModuleLoader bundle) exactly
 * the way the real dsh web client would, by evaling the source under a
 * stubbed window and capturing module.exports.
 */
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

/**
 * A tiny react-like stub that records the element tree so tests can make
 * structural assertions without a DOM. Element = { type, props, children,
 * key }. No re-render, no effects, no events — pure snapshot of first render.
 */
export function makeReact() {
  let effects = [];
  const hooks = [];
  const api = {
    createElement: (type, props, ...children) => {
      const flat = [];
      const push = (n) => {
        if (Array.isArray(n)) n.forEach(push);
        else if (n !== null && n !== undefined && n !== false && n !== true) flat.push(n);
      };
      children.forEach(push);
      return { type, props: props || null, children: flat, key: props && props.key != null ? String(props.key) : null };
    },
    useState: (init) => {
      hooks.push({ init });
      const idx = hooks.length - 1;
      return [
        hooks[idx].value !== undefined ? hooks[idx].value : (typeof init === "function" ? init() : init),
        (v) => { hooks[idx].value = typeof v === "function" ? v(hooks[idx].value) : v; },
      ];
    },
    useEffect: (fn, deps) => { effects.push({ fn, deps }); },
    _resetHooks: () => { hooks.length = 0; effects.length = 0; },
    _effects: effects,
    _hooks: hooks,
  };
  return api;
}

export function loadClient() {
  globalThis.window = { __ModuleLoader__: {} };
  let exportsOut = null;
  const react = makeReact();
  window.__ModuleLoader__.load = (opts) => {
    exportsOut = opts.factory((id) => {
      if (id === "react") return react;
      throw new Error(`unexpected require: ${id}`);
    });
  };
  (0, eval)(source);
  exportsOut.__react = react;
  return exportsOut;
}

/** Depth-first search of rendered tree: first element whose (type or props
 *  className / title / text children) matches the predicate. */
export function findEl(node, pred) {
  if (!node || typeof node !== "object") return null;
  if (pred(node)) return node;
  for (const c of node.children || []) {
    if (c && typeof c === "object") {
      const hit = findEl(c, pred);
      if (hit) return hit;
    }
  }
  return null;
}

export function textOf(node) {
  if (!node) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  const own = node.children || [];
  let s = "";
  for (const c of own) {
    if (typeof c === "string" || typeof c === "number") s += String(c);
    else if (c && typeof c === "object") s += textOf(c);
  }
  return s;
}

export function loadCore() {
  return loadClient().PandaCalendarCore;
}
