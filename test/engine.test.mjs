/**
 * M1 calendar core tests.
 *
 * The engine is embedded in lib/client.js (a ModuleLoader bundle). We never
 * import that file: we eval its source under a stubbed window, capture the
 * factory's module.exports and exercise the exported PandaCalendarCore.
 *
 * Fixtures in test/fixtures/engine.fixtures.json were generated and
 * exhaustively validated by tools/gen-engine-data.mjs against
 * lunar-javascript (6tail) for every solar day 1900-01-31..2100-12-31
 * (73384 days, 0 mismatches).
 *
 * Run: node --test "test/*.test.mjs"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/engine.fixtures.json", import.meta.url), "utf8")
);

function makeReact() {
  return {
    createElement: () => ({}),
    useState: (init) => [typeof init === "function" ? init() : init, () => {}],
    useEffect: () => {},
  };
}

function loadCore() {
  globalThis.window = { __ModuleLoader__: {} };
  let exportsOut = null;
  window.__ModuleLoader__.load = (opts) => {
    exportsOut = opts.factory((id) => {
      if (id === "react") return makeReact();
      throw new Error(`unexpected require: ${id}`);
    });
  };
  (0, eval)(source);
  return exportsOut.PandaCalendarCore;
}

const C = loadCore();

test("core exposes the expected API surface", () => {
  for (const k of ["solarToLunar", "lunarToSolar", "dayInfo", "termName", "termDay", "gzName", "lunarYearMeta"]) {
    assert.equal(typeof C[k], "function", `missing core.${k}`);
  }
  assert.equal(C.LUNAR_YEAR0, 1900);
  assert.equal(C.LUNAR_YEAR1, 2100);
});

test("every fixture date reproduces 6tail-validated values", () => {
  assert.ok(fixtures.length > 800, `expected >800 fixtures, got ${fixtures.length}`);
  let checked = 0;
  for (const fx of fixtures) {
    const di = C.dayInfo(fx.y, fx.m, fx.d);
    assert.ok(di, `dayInfo null for ${fx.y}-${fx.m}-${fx.d}`);
    checked++;
    assert.equal(di.lYear, fx.lYear, `${fx.y}-${fx.m}-${fx.d} lYear`);
    assert.equal(di.lMonth, fx.lMonth, `${fx.y}-${fx.m}-${fx.d} lMonth`);
    assert.equal(di.lDay, fx.lDay, `${fx.y}-${fx.m}-${fx.d} lDay`);
    assert.equal(di.gzYear, fx.gzYear, `${fx.y}-${fx.m}-${fx.d} gzYear`);
    assert.equal(di.gzMonth, fx.gzMonth, `${fx.y}-${fx.m}-${fx.d} gzMonth`);
    assert.equal(di.gzDay, fx.gzDay, `${fx.y}-${fx.m}-${fx.d} gzDay`);
    assert.equal(di.animal, fx.animal, `${fx.y}-${fx.m}-${fx.d} animal`);
    assert.equal(di.term, fx.term, `${fx.y}-${fx.m}-${fx.d} term`);
  }
  assert.ok(checked >= 800);
});

test("lunar -> solar round-trips through solar -> lunar", () => {
  let checked = 0;
  for (const fx of fixtures) {
    const back = C.lunarToSolar(fx.lYear, fx.lMonth, fx.lDay);
    assert.ok(back, `lunarToSolar null for ${fx.y}-${fx.m}-${fx.d} -> ${fx.lYear}/${fx.lMonth}/${fx.lDay}`);
    assert.equal(back.y, fx.y, `back y ${fx.y}-${fx.m}-${fx.d} (lunar ${fx.lYear}/${fx.lMonth}/${fx.lDay})`);
    assert.equal(back.m, fx.m, `back m ${fx.y}-${fx.m}-${fx.d} (lunar ${fx.lYear}/${fx.lMonth}/${fx.lDay})`);
    assert.equal(back.d, fx.d, `back d ${fx.y}-${fx.m}-${fx.d} (lunar ${fx.lYear}/${fx.lMonth}/${fx.lDay})`);
    checked++;
  }
  assert.ok(checked >= 800);
});

test("leap months are detected and marked negative", () => {
  const leapDates = fixtures.filter((f) => f.tag.startsWith("leap-"));
  assert.ok(leapDates.length > 0);
  for (const fx of leapDates) {
    assert.ok(fx.lMonth < 0, `${fx.y}-${fx.m}-${fx.d} should be in a leap month, got ${fx.lMonth}`);
  }
  // 2023 闰二月 (a known leap): 2023-03-22 is 闰二月初一 per 6tail probe
  const d = C.dayInfo(2023, 3, 22);
  assert.equal(d.lMonth, -2);
  assert.equal(d.lDay, 1);
  assert.equal(d.lMonthCn, "闰二月");
  assert.equal(d.lDayCn, "初一");
  const back = C.lunarToSolar(2023, -2, 1);
  assert.deepEqual(back, { y: 2023, m: 3, d: 22 });
});

test("春节 year / zodiac switching (user requirement: 按春节换年)", () => {
  // 2025 春节 = 2025-01-29 (乙巳蛇), 2026 春节 = 2026-02-17 (丙午马)
  const before = C.dayInfo(2025, 1, 28); // 甲辰龙 (still 2024 lunar)
  assert.equal(before.gzYear, "甲辰");
  assert.equal(before.animal, "龙");
  const ny2025 = C.dayInfo(2025, 1, 29);
  assert.equal(ny2025.gzYear, "乙巳");
  assert.equal(ny2025.animal, "蛇");
  assert.equal(ny2025.lDay, 1);
  assert.equal(ny2025.lMonth, 1);
  // between 立春 (2026-02-04) and 春节: still 乙巳蛇 in our convention
  const lichun2026 = C.dayInfo(2026, 2, 4);
  assert.equal(lichun2026.gzYear, "乙巳"); // 春节口径, not 立春口径
  assert.equal(lichun2026.animal, "蛇");
  assert.equal(lichun2026.term, "立春");
  const ny2026 = C.dayInfo(2026, 2, 17);
  assert.equal(ny2026.gzYear, "丙午");
  assert.equal(ny2026.animal, "马");
});

test("month ganzhi follows 节气口径 (validated vs 6tail)", () => {
  const a = C.dayInfo(2026, 2, 3); // before 立春: 己丑月
  assert.equal(a.gzMonth, "己丑");
  const b = C.dayInfo(2026, 2, 17); // after 立春: 庚寅月
  assert.equal(b.gzMonth, "庚寅");
  const c = C.dayInfo(2025, 1, 29); // 春节 but before 立春: 丁丑月
  assert.equal(c.gzMonth, "丁丑");
});

test("solar terms land on correct days", () => {
  // [y, m, d, name, slotIndexWithinMonth(0 first/1 second)]
  const termSamples = [
    [2026, 2, 4, "立春", 0], [2026, 2, 18, "雨水", 1], [2026, 4, 5, "清明", 0],
    [2024, 6, 21, "夏至", 1], [2024, 12, 21, "冬至", 1], [2025, 1, 5, "小寒", 0],
    [2026, 12, 22, "冬至", 1],
  ];
  for (const [y, m, d, name, slot] of termSamples) {
    assert.equal(C.termName(y, m, d), name, `${y}-${m}-${d} should be ${name}`);
    const idx = (m - 1) * 2 + slot; // term table index
    assert.equal(C.termDay(y, idx), d, `termDay(${y},${idx}) for ${name}`);
    assert.equal(C.TERM_NAMES[idx], name, `TERM_NAMES[${idx}]`);
  }
  // non-term day
  assert.equal(C.termName(2026, 2, 10), "");
});

test("week / dayInfo composition fields", () => {
  const di = C.dayInfo(2026, 2, 17);
  assert.equal(di.week, 2); // Tuesday
  assert.equal(di.weekCn, "星期二");
  assert.equal(di.lYearCn, "二〇二六年");
  assert.equal(di.lDayCn, "初一");
  assert.equal(di.gzYmd, "丙午年 庚寅月 壬戌日");
});

test("out-of-range dates return null gracefully", () => {
  assert.equal(C.solarToLunar(1899, 12, 31), null);
  assert.equal(C.solarToLunar(2101, 1, 1), null);
  assert.equal(C.dayInfo(1899, 12, 31), null);
  assert.equal(C.lunarToSolar(1899, 1, 1), null);
  assert.equal(C.lunarToSolar(2101, 1, 1), null);
  assert.equal(C.lunarToSolar(2023, -3, 1), null); // no leap-3 in 2023
  assert.equal(C.lunarToSolar(2023, 1, 30), null); // 2023 正月 is 29 days
  assert.equal(C.lunarToSolar(2023, 2, 31), null); // 2023 二月 has 30 days
});
