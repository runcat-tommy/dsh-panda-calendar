/**
 * M2 statutory layer tests (holiday-cn normalized data).
 * Snapshot fixtures mirror tools/holiday-snapshot.txt (fetched from
 * https://github.com/NateScarlet/holiday-cn, MIT).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadClient } from "./helpers.mjs";

const exp = loadClient();
const S = exp.PandaStatutory;
const snap = JSON.parse(
  readFileSync(new URL("./fixtures/holiday.snapshot.json", import.meta.url), "utf8")
);

function nd(y, m, d) {
  const d2025 = S.normalizeHolidayData(snap[String(y)]);
  return S.statOf(y, m, d, d2025);
}

test("normalizeHolidayData builds byDate + contiguous ranges", () => {
  const d2026 = S.normalizeHolidayData(snap["2026"]);
  assert.equal(d2026.year, 2026);
  assert.ok(Object.keys(d2026.byDate).length >= 30);
  // 2026-01-01..01-04 元旦 run (01-04 is 调休 workday, excluded from range)
  const jan1 = d2026.byDate["2026-01-01"];
  assert.deepEqual({ name: jan1.name, off: jan1.off }, { name: "元旦", off: true });
  assert.equal(jan1.dayNo, 1);
  const jan3 = d2026.byDate["2026-01-03"];
  assert.equal(jan3.dayNo, 3);
  assert.equal(d2026.byDate["2026-01-04"].off, false);
  // 春节 2026: off 02-15..02-23 (9 days), 调休 02-14 & 02-28
  const cny = d2026.byDate["2026-02-17"];
  assert.equal(cny.off, true);
  assert.equal(cny.name, "春节");
  assert.equal(cny.total, 9);
  assert.equal(cny.dayNo, 3);
  const cnyEnd = d2026.byDate["2026-02-23"];
  assert.equal(cnyEnd.dayNo, 9);
  assert.equal(d2026.byDate["2026-02-14"].off, false, "02-14 is 调休上班");
  assert.equal(d2026.byDate["2026-02-28"].off, false, "02-28 is 调休上班");
});

test("statOf answers for holidays, workdays and ordinary days", () => {
  assert.deepEqual(nd(2026, 10, 1), {
    name: "国庆节", off: true, holiday: "国庆节", dayNo: 1, total: 7,
  });
  const oct7 = nd(2026, 10, 7);
  assert.equal(oct7.off, true);
  assert.equal(oct7.dayNo, 7);
  // 调休上班日
  const makeup = nd(2026, 10, 10);
  assert.equal(makeup.off, false);
  assert.equal(makeup.name, "国庆节");
  // ordinary day
  assert.equal(nd(2026, 3, 15), null);
  assert.equal(nd(2025, 10, 1).name, "国庆节、中秋节"); // combined name year
  assert.equal(nd(2025, 5, 1).name, "劳动节");
});

test("fetchYearData falls back CDN -> raw -> null", async () => {
  // cdn ok
  const cdnOk = await S.fetchYearData(2026, {
    fetchImpl: (url) =>
      Promise.resolve({
        ok: url.includes("jsdelivr"),
        json: () => Promise.resolve(snap["2026"]),
      }),
  });
  assert.equal(cdnOk.year, 2026);
  // cdn down, raw ok
  const rawOk = await S.fetchYearData(2026, {
    fetchImpl: (url) =>
      Promise.resolve({
        ok: url.includes("raw.githubusercontent"),
        json: () => Promise.resolve(snap["2026"]),
      }),
  });
  assert.equal(rawOk.year, 2026);
  // both down -> null
  const bothDown = await S.fetchYearData(2026, {
    fetchImpl: () => Promise.resolve({ ok: false, json: () => Promise.reject(new Error("x")) }),
  });
  assert.equal(bothDown, null);
  // malformed payload -> tries next source
  const malformed = await S.fetchYearData(2026, {
    fetchImpl: (url) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(url.includes("jsdelivr") ? { nope: 1 } : snap["2026"]),
      }),
  });
  assert.equal(malformed.year, 2026);
});

test("storage round-trip: save then load (localStorage-like stub)", () => {
  const store = {};
  const storage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
  };
  S.saveStatData(2026, snap["2026"], storage);
  const loaded = S.loadStatData(2026, storage);
  assert.equal(loaded.year, 2026);
  assert.ok(loaded.byDate["2026-10-01"]);
  // snapshot fallback when storage is empty
  assert.ok(S.loadStatData(2026, null).byDate["2026-10-01"], "snapshot fallback works");
});

test("snapshot covers a full year of statutory data", () => {
  const d2026 = S.normalizeHolidayData(snap["2026"]);
  const d2025 = S.normalizeHolidayData(snap["2025"]);
  for (const d of [d2025, d2026]) {
    assert.ok(d.ranges.length >= 6, `expected >=6 ranges in ${d.year}`);
  }
  const names26 = new Set(d2026.ranges.map((r) => r.name));
  for (const n of ["元旦", "春节", "清明节", "劳动节", "端午节", "中秋节", "国庆节"]) {
    assert.ok(names26.has(n), `2026 should contain ${n} range`);
  }
});

test("snapshotHasYear reports whether built-in data covers a year", () => {
  const snapYears = Object.keys(snap).map(Number);
  assert.ok(snapYears.length >= 2, "fixture should carry at least two years");
  for (const y of snapYears) {
    assert.equal(S.snapshotHasYear(y), true, `snapshot year ${y} should be present`);
  }
  const maxYear = Math.max(...snapYears);
  assert.equal(S.snapshotHasYear(maxYear + 1), false, `year after the newest snapshot (${maxYear + 1}) should be missing`);
  assert.equal(S.snapshotHasYear(1999), false, "ancient year should be missing");
  assert.equal(S.snapshotHasYear(null), false, "null should not crash");
});
