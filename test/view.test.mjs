/**
 * M3 view-layer tests.
 *  1) PandaUi pure model functions (month-grid layout, today model,
 *     statutory decoration, festival/term/lunar sub-labels) — deterministic.
 *  2) Render smoke: the registered conversation.view render() produces a
 *     tree whose root has the .pc-root class without a DOM.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadClient, findEl, textOf } from "./helpers.mjs";

const exp = loadClient();
const U = exp.PandaUi;
const snap = JSON.parse(
  readFileSync(new URL("./fixtures/holiday.snapshot.json", import.meta.url), "utf8")
);
const S = exp.PandaStatutory;
const stat2026 = S.normalizeHolidayData(snap["2026"]);

test("monthCells yields 42 cells with one today and unique keys", () => {
  const cells = U.monthCells(2026, 9, { today: { y: 2026, m: 9, d: 3 }, statData: stat2026 });
  assert.equal(cells.length, 42);
  const keys = new Set(cells.map((c) => c.key));
  assert.equal(keys.size, 42);
  assert.equal(cells.filter((c) => c.isToday).length, 1);
  // Sep 2026: Sep 1 must be within the first week (not out)
  const sep1 = cells.find((c) => c.key === "2026-09-01");
  assert.ok(sep1 && sep1.out === false);
  // grid starts on the Sunday before Sep 1; Sep 1 2026 is a Tuesday
  assert.equal(cells[0].dow, 0);
});

test("monthCells decorates festivals + statutory days", () => {
  const cells = U.monthCells(2026, 9, { today: { y: 2026, m: 9, d: 3 }, statData: stat2026 });
  // 2026-09-25 中秋节 (off day 1 of 3)
  const mz = cells.find((c) => c.key === "2026-09-25");
  assert.ok(mz.festivals.some((f) => f.id === "zhongqiu"), "中秋 festival expected");
  assert.ok(mz.stat, "statutory hit expected on 中秋 9/25");
  assert.equal(mz.stat.off, true);
  assert.equal(mz.stat.name, "中秋节");
  assert.equal(mz.stat.dayNo, 1);
  assert.equal(mz.stat.total, 3);
  // 2026-10-10 调休上班 (name 国庆节 off:false)
  const oct10 = cells.find((c) => c.key === "2026-10-10");
  assert.ok(oct10 && oct10.stat && oct10.stat.off === false);
  assert.equal(oct10.stat.name, "国庆节");
});

test("monthCells sub-labels: term > festival > lunar", () => {
  const cells = U.monthCells(2026, 9, { today: { y: 2026, m: 9, d: 3 }, statData: stat2026 });
  const bh = cells.find((c) => c.key === "2026-09-07"); // 白露 2026
  assert.equal(bh.term, "白露");
  assert.equal(bh.sub, "白露");
  assert.equal(bh.subKind, "term");
  const qf = cells.find((c) => c.key === "2026-09-25");
  assert.equal(qf.sub, "中秋节"); // festival wins over lunar label
  assert.equal(qf.subKind, "fes");
  const plain = cells.find((c) => c.key === "2026-09-12"); // ordinary day
  assert.equal(plain.term, "");
  assert.equal(plain.festivals.length, 0);
  assert.equal(plain.subKind, "lunar"); // e.g. 八月初二 style day label
  assert.ok(plain.sub.length > 0);
});

test("monthCells leap-month first day shows 闰X月 label", () => {
  // 2023 leap second month: solar 2023-03-22 == 闰二月初一
  const cells = U.monthCells(2023, 3, { today: { y: 2023, m: 3, d: 22 } });
  const c = cells.find((x) => x.key === "2023-03-22");
  assert.equal(c.sub, "闰二月");
  assert.equal(c.subKind, "lunar");
  assert.ok(c.lunar && c.lunar.isLeap);
  assert.equal(c.lunar.lDay, 1);
});

test("monthCells clamps out-of-range gracefully (no crash beyond engine)", () => {
  const cells = U.monthCells(2101, 1, { today: { y: 2101, m: 1, d: 1 } });
  assert.equal(cells.length, 42);
  // days beyond engine range still render as empty lunar/term cells
  const late = cells.find((c) => c.key === "2101-02-01");
  assert.ok(late, "February tail cells still exist");
  assert.equal(late.lunar, null);
  assert.equal(late.sub, "");
});

test("todayModel bundles di + festivals + statutory state", () => {
  const m = U.todayModel(2026, 2, 17, { statData: stat2026 }); // 春节
  assert.equal(m.di.lDayCn, "初一");
  assert.ok(m.festivals.some((f) => f.id === "chunjie"));
  assert.equal(m.stat.name, "春节");
  assert.equal(m.stat.dayNo, 3); // 2026-02-17 is day 3 of the 春节 break
  assert.equal(m.stat.total, 9);
  const plain = U.todayModel(2026, 5, 20, { statData: stat2026 });
  assert.equal(plain.stat, null);
  assert.equal(U.todayModel(1800, 1, 1), null);
});

test("weekCnOfKey resolves weekday from YYYY-MM-DD", () => {
  const full = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  assert.equal(U.weekCnOfKey("2026-02-17", { weekdayFull: full }), "星期二");
  assert.equal(U.weekCnOfKey("2026-09-06", { weekdayFull: full }), "星期日");
});

test("composeDayCard renders lunar/ganzhi/festival/statutory text lines", () => {
  const text = U.composeDayCard(2026, 2, 17, { statData: stat2026 }); // 春节
  assert.ok(text, "card text expected");
  assert.ok(text.includes("2026年2月17日"));
  assert.ok(text.includes("丙午"), "lunar year 丙午");
  assert.ok(text.includes("初一"), "lunar day 初一");
  assert.ok(text.includes("春节"), "festival name");
  assert.ok(text.includes("第 3/9 天"), "statutory day number");
  assert.ok(text.includes("生肖马"), "zodiac line");
  // out-of-range -> null
  assert.equal(U.composeDayCard(1800, 1, 1, { statData: stat2026 }), null);
  // makeup workday wording
  const make = U.composeDayCard(2026, 2, 14, { statData: stat2026 }); // 调休上班
  assert.ok(make.includes("调休上班"));
});

test("view render smoke: registered render returns a .pc-root tree", () => {
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
  // helpers' react stub records elements instead of calling components; expand
  // the top-level component once to obtain the host-element tree.
  const elem = viewReg.render({ sessionId: "s1", inputActions: null });
  assert.equal(typeof elem.type, "function", "render returns the view component");
  exp.__react._resetHooks();
  const tree = elem.type(elem.props || {});
  const root = findEl(tree, (n) => n.props && String(n.props.className || "").indexOf("pc-root") === 0);
  assert.ok(root, ".pc-root expected in rendered tree");
  const title = findEl(tree, (n) => n.props && n.props.className === "pc-card-title");
  assert.ok(title, "at least one card title expected");
  // view label uses locale t
  assert.equal(viewReg.def.label(), "L:view");
});

/** Regression for "上月/下月 unresponsive on first visit": the functional
 *  updater in useViewState read VIEW_CACHE[full], which was only written by a
 *  prior set() — on the very first visit there was no seed, so clicking
 *  上月 threw (v of undefined) and the UI never updated. Clicking 今日 first
 *  wrote the cache, which is why it started working after that. The fix seeds
 *  the cache during useState initialisation. */
test("regression: month shift works on first visit (cache seeded)", () => {
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
  const sessionId = "bugfix-shift"; // unique: VIEW_CACHE is shared across tests
  const renderTree = () => {
    exp.__react._resetHooks();
    const elem = viewReg.render({ sessionId, inputActions: null });
    return elem.type(elem.props || {});
  };
  const calendarTitle = (tree) => {
    const titles = [];
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (n.props && n.props.className === "pc-card-title") {
        const t = textOf(n);
        if (/\d+年\d+月/.test(t)) titles.push(t);
      }
      (n.children || []).forEach(walk);
    };
    walk(tree);
    return titles[0] || "";
  };
  const ym = (s) => {
    const m = /\d+年(\d+)月/.exec(s);
    return m ? Number(m[1]) : 0;
  };

  // first visit: today's month rendered
  const before = ym(calendarTitle(renderTree()));
  assert.ok(before >= 1 && before <= 12, "a current month title should render");

  // click 上月 on the very first render (no prior 今日 click)
  const tree = renderTree();
  const prevBtn = findEl(tree, (n) => n.props && String(n.props.className || "").indexOf("pc-btn") === 0 && textOf(n).indexOf("L:prevMonth") >= 0);
  assert.ok(prevBtn && typeof prevBtn.props.onClick === "function", "上月 button with onClick expected");
  assert.doesNotThrow(() => prevBtn.props.onClick(), "clicking 上月 must not throw on first visit");

  // re-render: month should now be the previous month (cache seeded => read back)
  const after = ym(calendarTitle(renderTree()));
  assert.equal(after, before === 1 ? 12 : before - 1, "month grid should move back one month");
});

test("statutory model used by view labels off-days via statOf ranges", () => {
  const t2026 = S.normalizeHolidayData(snap["2026"]);
  const jan1 = S.statOf(2026, 1, 1, t2026);
  assert.equal(jan1.off, true);
  assert.equal(jan1.holiday, "元旦");
  const makeup = S.statOf(2026, 2, 14, t2026);
  assert.equal(makeup.off, false);
});

/** Integration: cities + active city saved under an earlier plugin run (e.g.
 *  before a reinstall) must come back when the view boots. Mirrors the real
 *  flow — helpers' react stub does not run effects by itself, so the
 *  bootstrap effect (the only one with an empty deps array) is invoked by
 *  hand, then the view re-renders from the module-level VIEW_CACHE. */
test("persisted city list + active city restore on view boot", () => {
  const backing = {
    "pandaCalendar.cities.v1": JSON.stringify({
      list: [
        { name: "苏州", lat: 31.2989, lon: 120.5853 },
        { name: "北京", lat: 39.9042, lon: 116.4074 },
      ],
      active: "苏州",
    }),
  };
  const realLS = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in backing ? backing[k] : null),
    setItem: (k, v) => { backing[k] = String(v); },
    removeItem: (k) => { delete backing[k]; },
  };
  try {
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
    const sessionId = "boot-restore"; // unique: VIEW_CACHE is shared across tests
    const renderTree = () => {
      exp.__react._resetHooks();
      const elem = viewReg.render({ sessionId, inputActions: null });
      return elem.type(elem.props || {});
    };

    // first render: cities not yet booted
    const first = renderTree();
    const locating = findEl(first, (n) => n.props && n.props.className === "pc-msg");
    assert.ok(locating, "weather card shows a message before cities resolve");

    // run the bootstrap effect (deps []) — it reads loadCityState()
    const boot = exp.__react._effects.find((e) => e.deps && e.deps.length === 0);
    assert.ok(boot, "bootstrap effect with empty deps should exist");
    boot.fn();

    // re-render: restored city list + active city should surface
    const tree = renderTree();
    const activeChip = findEl(tree, (n) => n.props && String(n.props.className || "").indexOf("pc-city") === 0 && String(n.props.className).indexOf("active") >= 0);
    assert.ok(activeChip, "active city chip expected");
    assert.equal(textOf(activeChip), "苏州");
    const allText = textOf(tree);
    assert.ok(allText.includes("苏州"), "苏州 chip expected");
    assert.ok(allText.includes("北京"), "北京 chip expected");
  } finally {
    if (realLS === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = realLS;
  }
});

/** The "update holiday data" hint (plain-language + copy button) is driven by
 *  whether the built-in snapshot covers NEXT year, judged from a frozen
 *  "today" injected as slotProps.nowMs (absent in the real host). */
test("snapshot update hint shows a copy button when next year is not built in", () => {
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
  const years = Object.keys(snap).map(Number).sort((a, b) => a - b);
  const maxYear = years[years.length - 1]; // e.g. 2026 -> 2027 missing
  const coveredYear = years.find((y) => years.includes(y + 1)); // e.g. 2025 -> 2026 present
  assert.ok(maxYear && coveredYear, "fixture should cover >=2 years");

  const renderAt = (year) => {
    exp.__react._resetHooks();
    const elem = viewReg.render({
      sessionId: "snapshot-hint-" + year,
      inputActions: null,
      nowMs: Date.UTC(year, 5, 15, 12), // local-safe mid-year instant
    });
    return elem.type(elem.props || {});
  };

  // next year IS built in -> no hint
  const treeCovered = renderAt(coveredYear);
  const hintCovered = findEl(treeCovered, (n) => n.props && n.props.className === "pc-snapshot");
  assert.equal(hintCovered, null, "no hint when next year is already built in");

  // next year missing -> hint with command + copy button
  const treeMissing = renderAt(maxYear);
  const hint = findEl(treeMissing, (n) => n.props && n.props.className === "pc-snapshot");
  assert.ok(hint, "hint should render when next year is missing");
  const hintText = textOf(hint);
  assert.ok(hintText.includes("node tools/gen-holiday-snapshot.mjs"), "hint shows the command");
  const copyBtn = findEl(hint, (n) => n.props && String(n.props.className || "").indexOf("pc-btn") === 0 && textOf(n).includes("L:copyCmd"));
  assert.ok(copyBtn && typeof copyBtn.props.onClick === "function", "copy button with onClick expected");
});

/** Both weather-card branches expose a manual locate button (idle label when
 *  not locating, disabled while locating). */
test("weather card offers a manual locate button in both branches", () => {
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
  const renderTree = (sessionId) => {
    exp.__react._resetHooks();
    const elem = viewReg.render({ sessionId, inputActions: null });
    return elem.type(elem.props || {});
  };

  // branch 1: cities not resolved yet (auto-locating)
  const treeIdle = renderTree("locate-idle");
  const idleBtn = findEl(treeIdle, (n) => n.props && String(n.props.className || "").indexOf("pc-btn") === 0 && textOf(n).includes("L:locateNow"));
  assert.ok(idleBtn && typeof idleBtn.props.onClick === "function", "locate button in the auto-locating branch");

  // branch 2: with a restored city list (cities resolved)
  const backing = {
    "pandaCalendar.cities.v1": JSON.stringify({
      list: [{ name: "苏州", lat: 31.2989, lon: 120.5853 }],
      active: "苏州",
    }),
  };
  const realLS = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in backing ? backing[k] : null),
    setItem: (k, v) => { backing[k] = String(v); },
    removeItem: (k) => { delete backing[k]; },
  };
  try {
    const tree = renderTree("locate-resolved");
    const boot = exp.__react._effects.find((e) => e.deps && e.deps.length === 0);
    boot.fn();
    const tree2 = renderTree("locate-resolved");
    const btn = findEl(tree2, (n) => n.props && String(n.props.className || "").indexOf("pc-btn") === 0 && textOf(n).includes("L:locateNow"));
    assert.ok(btn && typeof btn.props.onClick === "function", "locate button next to an active city");
  } finally {
    if (realLS === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = realLS;
  }
});
