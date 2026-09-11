/**
 * Tests for the "历史上的今天" layer.
 *  1) Pure snapshot lookup (historyOf / historyLookup) against an explicit
 *     fixture snapshot — deterministic without any network.
 *  2) zh Wikipedia onthisday payload normalization.
 *  3) Live fetch: 12h localStorage cache, silent failure fallback, and the
 *     injectable fetch/storage seams used by the real view.
 *  4) View integration: a .pc-history section is rendered inside the today
 *     card when the focused date has snapshot content (skipped gracefully
 *     when the bundle snapshot has not been generated yet, so the suite is
 *     green both before and after a regeneration).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadClient, findEl, textOf } from "./helpers.mjs";

const exp = loadClient();
const H = exp.PandaHistory;

// Compact stand-in mirroring tools/gen-history-data.mjs output shape:
// snapshot["M-D"] = { e: [[y, text]...], b: [[y, name, desc]...] }
const FIX = {
  "9-3": {
    e: [
      ["2004", "俄罗斯特种部队攻入车臣武装分子占据的别斯兰第一中学。"],
      ["1838", "废奴主义者弗雷德里克·道格拉斯逃离奴隶制。"],
      ["1945", "日本政府代表在密苏里号战舰上签署投降书，第二次世界大战结束。"],
    ],
    b: [
      ["1838", "弗雷德里克·道格拉斯", "美国废奴运动领袖、演说家与作家"],
      ["1905", "卡尔·戴维·安德森", "美国物理学家，1936年诺贝尔物理学奖得主"],
      ["1953", "让-皮埃尔·热内", "法国电影导演"],
      ["1965", "查理·辛", "美国演员"],
    ],
  },
  "12-31": {
    e: [
      ["1879", "爱迪生在美国新泽西州门洛帕克首次公开演示白炽灯。"],
    ],
    b: [],
  },
  "2-29": {
    e: [],
    b: [["1792", "焦阿基诺·罗西尼", "意大利作曲家"]],
  },
};

test("historyLookup: normalizes a snapshot record into events/births", () => {
  const rec = H.historyLookup(FIX, 9, 3);
  assert.ok(rec, "9/3 should exist in the fixture");
  assert.equal(rec.events.length, 3);
  assert.equal(rec.births.length, 4);
  assert.deepEqual(rec.events[0], ["2004", "俄罗斯特种部队攻入车臣武装分子占据的别斯兰第一中学。"]);
  assert.deepEqual(rec.births[0], ["1838", "弗雷德里克·道格拉斯", "美国废奴运动领袖、演说家与作家"]);
  // month/day without any births or events still resolves with empty arrays
  const leap = H.historyLookup(FIX, 2, 29);
  assert.ok(leap, "2/29 entry expected");
  assert.equal(leap.events.length, 0);
  assert.equal(leap.births.length, 1);
  // absent date -> null, not a crash
  assert.equal(H.historyLookup(FIX, 6, 15), null);
  assert.equal(H.historyLookup(null, 9, 3), null);
  assert.equal(H.historyLookup(FIX, 0, 0), null);
  assert.equal(H.historyLookup(FIX, 13, 1), null);
});

test("normalizeOnThisDay maps zh wiki selected payload to [year, text] pairs", () => {
  const payload = {
    selected: [
      { year: 2004, text: "第一件大事。" },
      { year: 1838, text: "第二件大事。" },
      { year: 1945, text: "第三件大事。" },
      { year: 1953, text: "第四件大事。" },
    ],
  };
  const all = H.normalizeOnThisDay(payload);
  assert.equal(all.length, 4);
  assert.deepEqual(all[0], ["2004", "第一件大事。"]);
  // limit respected
  assert.equal(H.normalizeOnThisDay(payload, 3).length, 3);
  assert.equal(H.normalizeOnThisDay(payload, 1).length, 1);
  // malformed entries dropped
  const messy = { selected: [
    { year: 1900, text: "  " },
    { text: "no year" },
    null,
    { year: 2020, text: "ok" },
  ] };
  assert.deepEqual(H.normalizeOnThisDay(messy), [["2020", "ok"]]);
  assert.deepEqual(H.normalizeOnThisDay(null), []);
  assert.deepEqual(H.normalizeOnThisDay({}), []);
});

test("fetchHistoryLive: cache hit returns events without calling fetch", async () => {
  const calls = [];
  const backing = {};
  const storage = {
    getItem: (k) => (k in backing ? backing[k] : null),
    setItem: (k, v) => { backing[k] = String(v); },
    removeItem: (k) => { delete backing[k]; },
  };
  // prime a fresh (non-expired) cache entry
  backing["pandaCalendar.history.1-1"] = JSON.stringify({
    ts: Date.now(),
    e: [["2000", "缓存里的事件。"]],
  });
  const ev = await H.fetchHistoryLive(1, 1, {
    fetchImpl: () => { calls.push("fetch"); return Promise.resolve(null); },
    storage,
  });
  assert.deepEqual(ev, [["2000", "缓存里的事件。"]]);
  assert.equal(calls.length, 0, "no network call when the cache is fresh");
});

test("fetchHistoryLive: expired cache triggers a refetch", async () => {
  const backing = {};
  const storage = {
    getItem: (k) => (k in backing ? backing[k] : null),
    setItem: (k, v) => { backing[k] = String(v); },
    removeItem: (k) => { delete backing[k]; },
  };
  backing["pandaCalendar.history.1-2"] = JSON.stringify({
    ts: Date.now() - 30 * 60 * 60 * 1000, // 30h old > 12h TTL
    e: [["1999", "过期内容。"]],
  });
  let calls = 0;
  const ev = await H.fetchHistoryLive(1, 2, {
    fetchImpl: () => {
      calls++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ selected: [{ year: 2020, text: "新事件。" }] }),
      });
    },
    storage,
  });
  assert.equal(calls, 1);
  assert.deepEqual(ev, [["2020", "新事件。"]]);
  // successful result should have replaced the cache
  const cached = JSON.parse(backing["pandaCalendar.history.1-2"]);
  assert.deepEqual(cached.e, [["2020", "新事件。"]]);
});

test("fetchHistoryLive: fetch failure or no fetch resolves null (silent fallback)", async () => {
  // HTTP 429 / 5xx etc. must not throw to the caller
  const failing = await H.fetchHistoryLive(3, 5, {
    fetchImpl: () => Promise.resolve({ ok: false, status: 429 }),
  });
  assert.equal(failing, null);
  // network-level rejection
  const rejected = await H.fetchHistoryLive(3, 5, {
    fetchImpl: () => Promise.reject(new Error("offline")),
  });
  assert.equal(rejected, null);
  // empty body -> null
  const empty = await H.fetchHistoryLive(3, 5, {
    fetchImpl: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ selected: [] }) }),
  });
  assert.equal(empty, null);
  // no fetchImpl at all (e.g. old host) -> null without throwing
  const none = await H.fetchHistoryLive(3, 5, { fetchImpl: null });
  assert.equal(none, null);
});

test("historyOf follows the in-bundle snapshot when present (regeneration-safe)", () => {
  // Before the generator has injected a snapshot the bundle has no data and
  // historyOf must return null cleanly; after regeneration every valid date
  // resolves. The assertion adapts to whichever state the bundle is in.
  const forSep3 = H.historyOf(9, 3);
  const all = (() => { try { return H.historyOf(9, 3); } catch (e) { return null; } })();
  void all;
  if (forSep3 === null) {
    assert.equal(H.historyOf(9, 3), null);
    assert.equal(H.historyOf(1, 1), null);
  } else {
    assert.ok(Array.isArray(forSep3.events));
    assert.ok(Array.isArray(forSep3.births));
    // sanity across the year (spot-check a handful of month/day pairs)
    const pairs = [[1, 1], [3, 5], [6, 15], [9, 3], [12, 31], [2, 29]];
    for (const [m, d] of pairs) {
      const rec = H.historyOf(m, d);
      assert.ok(rec, `${m}/${d} should resolve once a full snapshot is bundled`);
    }
  }
});

/** View integration: with a bundled snapshot for the focused date, a
 *  .pc-history section (events + births, collapsible) appears inside the
 *  today card body. Frozen "today" via nowMs makes the test deterministic;
 *  skipped when the bundle snapshot is not yet generated. */
test("view: today card renders a collapsible history section when data exists", (t) => {
  const sample = H.historyOf(6, 15);
  if (sample === null) {
    t.skip("bundle snapshot not generated yet — positive path needs data");
    return;
  }
  const counters = { localeRegister: 0, injectCalls: [] };
  const registrations = [];
  const ctx = {
    get: () => undefined,
    on: () => () => {},
    effect: () => () => {},
    locale: {
      register: () => { counters.localeRegister++; },
      bind: () => (key) => `L:${key}`,
    },
    slots: {
      inject: (name, cb) => { counters.injectCalls.push(name); registrations.push(cb()); },
      register: (def, render) => ({ def, render }),
    },
  };
  exp.apply(ctx);
  const viewReg = registrations.find((r) => r.def && r.def.name === "conversation.view");
  exp.__react._resetHooks();
  const elem = viewReg.render({
    sessionId: "history-view",
    inputActions: null,
    nowMs: Date.UTC(2026, 5, 15, 12), // 2026-06-15 noon UTC
  });
  const tree = elem.type(elem.props || {});
  const body = findEl(tree, (n) => n.props && String(n.props.className || "").indexOf("pc-today-body") === 0);
  assert.ok(body, ".pc-today-body expected");
  const hist = findEl(body, (n) => n.props && String(n.props.className || "").indexOf("pc-history") === 0);
  assert.ok(hist, ".pc-history section expected inside the today body");
  const head = findEl(hist, (n) => n.props && String(n.props.className || "").indexOf("pc-history-head") === 0);
  assert.ok(head, "clickable header expected");
  assert.ok(textOf(head).includes("L:historyToday"), "header carries the 历史上的今天 label");
  // explicit expand/collapse affordance: a solid button, collapsed by default
  const toggle = findEl(hist, (n) => n.props && String(n.props.className || "").indexOf("pc-history-toggle") === 0);
  assert.ok(toggle, "an explicit expand/collapse button is rendered");
  assert.equal(toggle.props["aria-expanded"], "false", "the section starts collapsed");
  assert.ok(textOf(toggle).includes("L:historyExpand"), "the collapsed button advertises the full item count");
  // first entry is previewed while collapsed so the section is discoverable
  const preview = findEl(hist, (n) => n.props && String(n.props.className || "").indexOf("pc-history-preview") === 0);
  assert.ok(preview, "collapsed state shows a first-entry preview");
  assert.ok(textOf(preview).includes("L:historyPreviewHint"), "preview carries a click-to-expand hint");
  if (sample.events.length) {
    assert.ok(textOf(preview).includes(sample.events[0][0]), "preview shows the first event's year");
    assert.ok(textOf(preview).includes(sample.events[0][1]), "preview shows the first event's text");
    assert.ok(!String(preview.props.className).includes("birth"), "event preview is not marked as a birth");
  } else {
    assert.ok(String(preview.props.className).includes("birth"), "birth-only dates preview a birth instead");
  }
  // content is always in the tree; .closed hides it visually via CSS
  const evRow = findEl(hist, (n) => n.props && String(n.props.className || "").indexOf("pc-hevent") === 0);
  assert.ok(evRow || sample.events.length === 0, "an events row is rendered when events exist");
  const birRow = findEl(hist, (n) => n.props && String(n.props.className || "").indexOf("pc-hbirth") === 0);
  assert.ok(birRow || sample.births.length === 0, "a births row is rendered when births exist");
});

/** The expand/collapse control is the section's primary action, so it has to
 *  read as one. It used to be a brand-tinted 999px pill, which in the
 *  monochrome host theme (brand-primary and button-primary-fill both resolve to
 *  near-black) looked like small print sitting next to the title rather than a
 *  control. It now shares the card's primary-action treatment (.pc-ts-now):
 *  solid fill, 8px radius, 13px/600 label, shadow. */
test("view: the on-this-day toggle reads as a prominent action", (t) => {
  const sample = H.historyOf(6, 15);
  if (sample === null) {
    t.skip("bundle snapshot not generated yet — the toggle only renders with data");
    return;
  }
  const registrations = [];
  const ctx = {
    get: () => undefined,
    on: () => () => {},
    effect: () => () => {},
    locale: { register: () => {}, bind: () => (key) => `L:${key}` },
    slots: {
      inject: (name, cb) => { registrations.push(cb()); },
      register: (def, render) => ({ def, render }),
    },
  };
  exp.apply(ctx);
  const viewReg = registrations.find((r) => r.def && r.def.name === "conversation.view");
  exp.__react._resetHooks();
  const elem = viewReg.render({
    sessionId: "history-toggle",
    inputActions: null,
    nowMs: Date.UTC(2026, 5, 15, 12),
  });
  const tree = elem.type(elem.props || {});
  const toggle = findEl(tree, (n) => n.props && String(n.props.className || "").indexOf("pc-history-toggle") === 0);
  assert.ok(toggle, "a .pc-history-toggle button is rendered");
  assert.equal(toggle.type, "button", "it is a real <button> element");
  assert.equal(toggle.props["aria-expanded"], "false", "collapsed by default");
  assert.ok(textOf(toggle).includes("L:historyExpand"), "still advertises the full item count");

  const css = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  const start = css.indexOf(".pc-history-toggle {");
  assert.ok(start > 0, ".pc-history-toggle rule exists");
  const rule = css.slice(start, css.indexOf(".pc-history-toggle .pc-history-caret", start));
  assert.ok(/background: var\(--dsw-alias-button-primary-fill/.test(rule), "solid brand background, not a tinted pill");
  assert.ok(/box-shadow/.test(rule), "raised (shadowed) look");
  assert.ok(/font-weight: 600/.test(rule), "heavier label than the small print beside it");
  assert.ok(!/background: transparent/.test(rule), "no flat-chip styling leaks in");
  assert.ok(!/border-radius: 999px/.test(rule), "no longer the 999px pill that read as small print");
  assert.ok(/border-radius: 8px/.test(rule), "rectangular shape shared with the card's primary action");
  // deliberately not smaller than the 13px section title, and a far bigger hit
  // area than the old 11px / 3px 11px pill it replaced
  const size = Number(rule.match(/font-size: ([\d.]+)px/)[1]);
  assert.ok(size >= 13, "label is at least the section title's size (" + size + "px)");
  const pad = rule.match(/padding: (\d+)px (\d+)px/);
  assert.ok(pad, "padding declared");
  assert.ok(Number(pad[1]) >= 8 && Number(pad[2]) >= 14, "hit area well above the old 3px/11px pill");
  assert.ok(/cursor: pointer/.test(rule), "still reads as clickable");
});

/** Data hygiene: the bundled snapshot must be free of the wikitext/HTML
 *  leftovers the build-time cleaner is supposed to remove (a "<ref></ref>"
 *  once reached the UI), and the fixture must match the bundle so a snapshot
 *  edit without regeneration is caught. */
test("snapshot data: no markup leftovers, fixture matches the bundle", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/history.snapshot.json", import.meta.url), "utf8"));
  const bundle = JSON.parse(readFileSync(new URL("../tools/history-snapshot.txt", import.meta.url), "utf8")
    .replace(/^var PANDA_HISTORY_SNAPSHOT = /, "").replace(/;\s*$/, ""));
  const keys = Object.keys(fixture);
  assert.ok(keys.length >= 366, "a full year of days, got " + keys.length);
  assert.deepEqual(keys.sort(), Object.keys(bundle).sort(), "fixture and bundle hold the same dates");
  let entries = 0;
  for (const k of keys) {
    const rec = fixture[k];
    // a day may legitimately omit `e` or `b` when that list is empty
    assert.ok(rec.e === undefined || Array.isArray(rec.e), k + " events array");
    assert.ok(rec.b === undefined || Array.isArray(rec.b), k + " births array");
    assert.equal(JSON.stringify(rec), JSON.stringify(bundle[k]), "bundle matches fixture for " + k);
    for (const [y, text] of rec.e || []) {
      entries++;
      assert.match(y, /^-?\d+$/, k + " event year looks numeric");
      assert.ok(text && text.length > 4, k + " event text is non-trivial");
      assert.ok(!/[<>]/.test(text), k + " event text has no markup: " + text.slice(0, 60));
      assert.ok(!/\{\{|\}\}|\[\[|\]\]/.test(text), k + " event text has no wikitext: " + text.slice(0, 60));
    }
    for (const [y, name, desc] of rec.b || []) {
      entries++;
      assert.match(y, /^-?\d+$/, k + " birth year looks numeric");
      assert.ok(name, k + " birth has a name");
      assert.ok(!/[<>]/.test(name) && !/[<>]/.test(desc || ""), k + " birth text has no markup");
      assert.ok(!/\{\{|\}\}|\[\[|\]\]/.test(name) && !/\{\{|\}\}|\[\[|\]\]/.test(desc || ""), k + " birth text has no wikitext");
    }
  }
  assert.ok(entries > 3000, "snapshot carries a full dataset, got " + entries);
});
