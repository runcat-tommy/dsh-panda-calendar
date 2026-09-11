/**
 * Tests for the "时间戳转换" card layer.
 *  1) Pure epoch parsing: seconds vs milliseconds detection + validation.
 *  2) Time-zone aware formatting (IANA zones, fixed offsets, DST).
 *  3) Wall-clock -> epoch round-trips, including a DST boundary.
 *  4) View integration: the card renders below the weather card and exposes
 *     both directions of the conversion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadClient, findEl, textOf } from "./helpers.mjs";

const exp = loadClient();
const TS = exp.PandaTimestamp;

test("parseTimestamp: auto-detects seconds vs milliseconds", () => {
  // 1757572400 == 2025-09-11T06:33:20Z in both spellings
  const secs = TS.parseTimestamp("1757572400", "auto");
  assert.ok(secs, "10-digit value parses");
  assert.equal(secs.unit, "s");
  assert.equal(secs.ms, 1757572400000);
  const millis = TS.parseTimestamp("1757572400000", "auto");
  assert.ok(millis, "13-digit value parses");
  assert.equal(millis.unit, "ms");
  assert.equal(millis.ms, 1757572400000);
  // 1e11 is the documented auto split
  assert.equal(TS.parseTimestamp("99999999999", "auto").unit, "s");
  assert.equal(TS.parseTimestamp("100000000000", "auto").unit, "ms");
});

test("parseTimestamp: honours an explicit unit and tolerates formatting", () => {
  assert.equal(TS.parseTimestamp("1757572400", "ms").ms, 1757572400);
  assert.equal(TS.parseTimestamp("1757572400", "s").ms, 1757572400000);
  assert.equal(TS.parseTimestamp(" 1,757,572,400 ", "s").ms, 1757572400000);
  assert.equal(TS.parseTimestamp("1757572400.5", "s").ms, 1757572400500);
});

test("parseTimestamp: rejects junk and out-of-range values", () => {
  for (const bad of ["", "   ", "abc", "1757a", "12.34.56", "--5", "1e12", "1757572400s"]) {
    assert.equal(TS.parseTimestamp(bad, "auto"), null, JSON.stringify(bad) + " must not parse");
  }
  assert.equal(TS.parseTimestamp(null, "auto"), null);
  assert.equal(TS.parseTimestamp(undefined, "auto"), null);
  assert.equal(TS.parseTimestamp("99999999999999999", "ms"), null, "beyond Date range");
});

test("zonedFields/formatEpoch: same instant in different zones", () => {
  const ms = Date.UTC(2026, 8, 11, 6, 33, 20); // 2026-09-11T06:33:20Z
  assert.equal(TS.formatEpoch(ms, "UTC"), "2026-09-11 06:33:20");
  assert.equal(TS.formatEpoch(ms, "Asia/Shanghai"), "2026-09-11 14:33:20");
  assert.equal(TS.formatEpoch(ms, "Asia/Kolkata"), "2026-09-11 12:03:20"); // +05:30
  assert.equal(TS.formatEpoch(ms, "America/Los_Angeles"), "2026-09-10 23:33:20"); // PDT -07:00
  const f = TS.zonedFields(ms, "Asia/Shanghai");
  assert.equal(f.y, 2026);
  assert.equal(f.m, 9);
  assert.equal(f.d, 11);
  assert.equal(f.h, 14);
  assert.equal(f.week, 5); // Friday
  assert.equal(f.offsetMin, 480);
});

test("tzOffsetMs/offsetLabel: offsets follow DST", () => {
  const winter = Date.UTC(2026, 0, 15, 12); // Jan
  const summer = Date.UTC(2026, 6, 15, 12); // Jul
  assert.equal(TS.tzOffsetMs(winter, "Europe/London") / 3600000, 0);
  assert.equal(TS.tzOffsetMs(summer, "Europe/London") / 3600000, 1);
  assert.equal(TS.tzOffsetMs(winter, "America/New_York") / 3600000, -5);
  assert.equal(TS.tzOffsetMs(summer, "America/New_York") / 3600000, -4);
  assert.equal(TS.tzOffsetMs(winter, "UTC"), 0);
  assert.equal(TS.offsetLabel(480), "UTC+08:00");
  assert.equal(TS.offsetLabel(330), "UTC+05:30");
  assert.equal(TS.offsetLabel(-240), "UTC-04:00");
  assert.equal(TS.offsetLabel(0), "UTC+00:00");
});

test("wallClockToEpoch: inverse of formatEpoch across zones", () => {
  const ms = Date.UTC(2026, 8, 11, 6, 33, 20);
  for (const tz of ["UTC", "Asia/Shanghai", "Asia/Kolkata", "Europe/Paris", "America/New_York", "Australia/Sydney"]) {
    const f = TS.zonedFields(ms, tz);
    const back = TS.wallClockToEpoch({ y: f.y, m: f.m, d: f.d, h: f.h, mi: f.mi, s: f.s }, tz);
    assert.equal(back, ms, tz + " round-trip");
  }
  // 00:30 wall clock in Shanghai is the previous UTC day
  assert.equal(TS.wallClockToEpoch({ y: 2026, m: 9, d: 11, h: 0, mi: 30, s: 0 }, "Asia/Shanghai"), Date.UTC(2026, 8, 10, 16, 30, 0));
});

test("wallClockToEpoch: 2026 DST transitions resolve within the shift", () => {
  // US spring-forward: 2026-03-08 02:00 local does not exist; 01:30 and 03:30 do.
  const before = TS.wallClockToEpoch({ y: 2026, m: 3, d: 8, h: 1, mi: 30, s: 0 }, "America/New_York");
  const after = TS.wallClockToEpoch({ y: 2026, m: 3, d: 8, h: 3, mi: 30, s: 0 }, "America/New_York");
  assert.equal(TS.zonedFields(before, "America/New_York").h, 1, "01:30 stays 01:30");
  assert.equal(TS.zonedFields(after, "America/New_York").h, 3, "03:30 stays 03:30");
  assert.equal((after - before) / 3600000, 1, "the skipped hour is not counted");
  // EU fall-back: 2026-10-25 02:30 occurs twice; we must return a valid instant
  const fb = TS.wallClockToEpoch({ y: 2026, m: 10, d: 25, h: 2, mi: 30, s: 0 }, "Europe/Paris");
  assert.equal(TS.zonedFields(fb, "Europe/Paris").h, 2);
  assert.equal(TS.zonedFields(fb, "Europe/Paris").mi, 30);
});

test("wallClockToEpoch: rejects impossible and empty fields", () => {
  assert.equal(TS.wallClockToEpoch({ y: 2026, m: 13, d: 1 }, "UTC"), null);
  assert.equal(TS.wallClockToEpoch({ y: 2026, m: 0, d: 1 }, "UTC"), null);
  assert.equal(TS.wallClockToEpoch({ y: 2026, m: 1, d: 32 }, "UTC"), null);
  assert.equal(TS.wallClockToEpoch({ y: 2026, m: 1, d: 1, h: 24 }, "UTC"), null);
  assert.equal(TS.wallClockToEpoch({ y: 2026, m: 1, d: 1, mi: 60 }, "UTC"), null);
  assert.equal(TS.wallClockToEpoch({ y: 0, m: 1, d: 1 }, "UTC"), null);
  assert.equal(TS.wallClockToEpoch(null, "UTC"), null, "missing fields default to year 0 -> rejected");
  assert.equal(TS.wallClockToEpoch({}, "UTC"), null);
});

test("TZ_OPTIONS: every offered zone is accepted by Intl", () => {
  assert.ok(TS.TZ_OPTIONS.length >= 10, "a useful list of zones");
  for (const o of TS.TZ_OPTIONS) {
    assert.ok(o.id && o.zh && o.en, "bilingual label for " + o.id);
    assert.ok(TS.hasTimeZone(o.id), "Intl accepts " + o.id);
  }
  const ids = TS.TZ_OPTIONS.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate zone ids");
  assert.ok(ids.includes("Asia/Shanghai") && ids.includes("UTC") && ids.includes("local"));
});

/** Render the plugin view once with a stub locale; returns the element tree.
 *  `dictSink` collects the dictionaries the plugin registers with the host
 *  (the real host runs ctx.effect callbacks, so this stub does too). */
function renderView(sessionId, tImpl, dictSink) {
  const registrations = [];
  const sink = dictSink || [];
  const ctx = {
    get: () => undefined,
    on: () => () => {},
    effect: (fn) => { if (typeof fn === "function") fn(); return () => {}; },
    locale: { register: (ns, d) => sink.push({ ns, d }), bind: () => tImpl },
    slots: {
      inject: (name, cb) => { registrations.push(cb()); },
      register: (def, render) => ({ def, render }),
    },
  };
  exp.apply(ctx);
  const viewReg = registrations.find((r) => r.def && r.def.name === "conversation.view");
  exp.__react._resetHooks();
  const elem = viewReg.render({ sessionId, inputActions: null });
  return elem.type(elem.props || {});
}

const zhT = (key) => `L:${key}`;
// the view picks its own dictionary from t("today"); "Today" selects the en dict
const enT = (key) => (key === "today" ? "Today" : `L:${key}`);

/** View integration: the timestamp card must sit under the weather card in the
 *  right column and render both conversion directions. */
test("view: timestamp card renders below the weather card", () => {
  const tree = renderView("timestamp-view", zhT);
  const grid = findEl(tree, (n) => n.props && String(n.props.className || "").indexOf("pc-grid-cards") === 0);
  assert.ok(grid, ".pc-grid-cards expected");
  // right column = the second child; it must hold weather first, timestamp second
  const rightCol = grid.children[1];
  assert.ok(rightCol, "right column expected");
  const cards = (rightCol.children || []).filter(Boolean);
  assert.equal(cards.length, 2, "right column carries exactly two cards");
  const headOf = (card) => {
    const head = findEl(card, (n) => n.props && String(n.props.className || "").indexOf("pc-card-head") === 0);
    return textOf(head);
  };
  assert.ok(headOf(cards[0]).includes("L:weatherTitle"), "weather card first");
  assert.ok(headOf(cards[1]).includes("L:tsTitle"), "timestamp card directly below it");
  // both directions are offered, plus the time-zone selector
  const bodyContent = textOf(cards[1]);
  assert.ok(bodyContent.includes("L:tsToDate"), "timestamp -> date mode");
  assert.ok(bodyContent.includes("L:tsToTs"), "date -> timestamp mode");
  assert.ok(findEl(cards[1], (n) => n.type === "select" && String(n.props.className || "").indexOf("pc-select") === 0),
    "time-zone <select> expected");
  const outRows = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (n.props && String(n.props.className || "").indexOf("pc-ts-out") === 0) outRows.push(n);
    for (const c of n.children || []) walk(c);
  };
  walk(cards[1]);
  assert.equal(outRows.length, 0, "no result block while the input is empty");
  assert.ok(textOf(cards[1]).includes("L:tsEmpty"), "an empty-state hint is shown instead");
});

/** The "Now" shortcut is the card's primary action: it must render as a solid
 *  brand button with a clock icon, not as a flat chip like the unit pills. */
test("view: the Now button reads as a prominent action", () => {
  const tree = renderView("timestamp-view-now", zhT);
  const btn = findEl(tree, (n) => n.props && String(n.props.className || "") === "pc-ts-now");
  assert.ok(btn, "a .pc-ts-now button is rendered");
  assert.equal(btn.type, "button", "it is a real <button> element");
  assert.equal(btn.props.title, "L:tsNow", "hover title repeats the label");
  assert.ok(textOf(btn).includes("L:tsNow"), "carries the Now label");
  assert.ok(findEl(btn, (n) => n.props && String(n.props.className || "") === "ico"), "clock icon span");
  const css = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  const start = css.indexOf(".pc-ts-now {");
  assert.ok(start > 0, ".pc-ts-now rule exists");
  const rule = css.slice(start, css.indexOf(".pc-ts-now .ico", start));
  assert.ok(/background: var\(--dsw-alias-button-primary-fill/.test(rule), "solid brand background, not transparent");
  assert.ok(/box-shadow/.test(rule), "raised (shadowed) look");
  assert.ok(/font-weight: 600/.test(rule), "heavier label than the pill group");
  assert.ok(!/background: transparent/.test(rule), "no flat-chip styling leaks in");
  // deliberately larger than the .pc-city pills next to it (12px / 3px 12px)
  const nowSize = Number(rule.match(/font-size: ([\d.]+)px/)[1]);
  const pillRule = css.slice(css.indexOf(".pc-city {"), css.indexOf(".pc-city.active"));
  const pillSize = Number(pillRule.match(/font-size: ([\d.]+)px/)[1]);
  assert.ok(nowSize > pillSize, "Now label is larger than the pills (" + nowSize + " vs " + pillSize + "px)");
  const nowPad = rule.match(/padding: (\d+)px (\d+)px/);
  const pillPad = pillRule.match(/padding: (\d+)px (\d+)px/);
  assert.ok(Number(nowPad[2]) > Number(pillPad[2]), "Now has more horizontal padding than the pills");
  assert.ok(/border-radius: 8px/.test(rule), "rectangular button shape instead of a 999px pill");
});

/** Localization: the plugin registers zh+en dictionaries with the host, so the
 *  timestamp keys must exist, non-empty, in both — and the dictionary-driven
 *  zone names must actually switch language. */
test("i18n: every timestamp key exists in zh and en, zone names localize", () => {
  const dicts = [];
  const treeEn = renderView("timestamp-view-en", enT, dicts);
  const entry = dicts.map((d) => d.d).find((d) => d && d.zh && d.en);
  assert.ok(entry, "the plugin registers a zh+en dictionary pair");
  assert.deepEqual(Object.keys(entry.zh).sort(), Object.keys(entry.en).sort(), "zh/en key parity");
  const tsKeys = Object.keys(entry.zh).filter((k) => k.indexOf("ts") === 0);
  assert.ok(tsKeys.length >= 20, "timestamp keys registered, got " + tsKeys.length);
  for (const k of tsKeys) {
    assert.equal(typeof entry.zh[k], "string", "zh." + k + " is a string");
    assert.equal(typeof entry.en[k], "string", "en." + k + " is a string");
    assert.ok(entry.zh[k].trim().length > 0, "zh." + k + " is not empty");
    assert.ok(entry.en[k].trim().length > 0, "en." + k + " is not empty");
  }
  // the en render must not leak Chinese zone names
  const optTextEn = (card) => {
    const select = findEl(card, (n) => n.type === "select" && String(n.props.className || "").indexOf("pc-select") === 0);
    return (select.children || []).map((o) => textOf(o)).join(" | ");
  };
  const cardEn = findEl(treeEn, (n) => n.props && String(n.props.className || "").indexOf("pc-ts-body") === 0);
  assert.ok(cardEn, "timestamp card body expected in the en render");
  const zonesEn = optTextEn(cardEn);
  assert.ok(zonesEn.includes("Beijing / Shanghai") && zonesEn.includes("Los Angeles"), "en zone names: " + zonesEn.slice(0, 70));
  assert.ok(!/[\u4e00-\u9fff]/.test(zonesEn), "no CJK left in the en zone list");
  assert.ok(/UTC[+-]\d\d:\d\d/.test(zonesEn), "zone options carry the live UTC offset");
  // same card under the zh dictionary
  const treeZh = renderView("timestamp-view-zh2", zhT);
  const cardZh = findEl(treeZh, (n) => n.props && String(n.props.className || "").indexOf("pc-ts-body") === 0);
  const zonesZh = optTextEn(cardZh);
  assert.ok(zonesZh.includes("北京 / 上海") && zonesZh.includes("洛杉矶"), "zh zone names: " + zonesZh.slice(0, 70));
  assert.ok(!/undefined/.test(zonesZh + zonesEn), "no zone label resolves to undefined");
});
